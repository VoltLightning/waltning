/**
 * The browser's ledger — the same engine, a different way of holding files.
 *
 * `expo-sqlite` on web is wa-sqlite compiled to WASM in a worker, its files
 * held in an OPFS access-handle pool, its synchronous API carried over
 * `SharedArrayBuffer` — which is why the dev server and the Caddyfile both
 * send `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`. The
 * thirteen shared tables, the executors, and the two-file write path run
 * unchanged; only what is in this file differs from `phone-ledger.native.ts`.
 *
 * Two differences, both forced by the VFS:
 *
 * - **No WAL.** The OPFS build leaves out `xShmMap`, so the session declares
 *   `journalMode: "rollback"` and `open.ts` verifies the claim. The browser
 *   holds one connection per file in one worker, so nothing overlaps; the
 *   copy strategy below never reads a file, so nothing needs checkpointing.
 * - **No filesystem.** The pool stores files under obfuscated names no
 *   outside API can reach, so `LedgerFs` is implemented through SQLite
 *   itself: `copy` runs the online backup API over the live connection,
 *   `exists` probes by opening — a just-created database reports zero pages,
 *   and no file this module writes is ever empty, because a pre-migration
 *   copy is a backup of a migrated database.
 */

import "./polyfills.ts";
import { createPhoneLedger } from "@waltning/client/ledger/create-phone-ledger";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { currencies } from "@waltning/core/currencies";
import type { SqliteOpener } from "@waltning/ledger/open";
import { ledgerSchema } from "@waltning/ledger/schema-map";
import { createLocalLedgerSession } from "@waltning/ledger/session";
import { drizzle } from "drizzle-orm/expo-sqlite";
import {
  backupDatabaseSync,
  deleteDatabaseSync,
  openDatabaseAsync,
  openDatabaseSync,
  type SQLiteDatabase,
  type SQLiteRunResult,
} from "expo-sqlite";
import { useSyncExternalStore } from "react";
import { mobileDiagnostics } from "./diagnostics.ts";

const LEDGER_PATHS = {
  replica: "waltning-replica.db",
  outbox: "waltning-outbox.db",
} as const;

type PhoneSqliteOpener = SqliteOpener<SQLiteRunResult, typeof ledgerSchema>;

/**
 * The live handle per path, so `copy` can back up *through* it. The migrator
 * copies a database it has already opened, and the backup API wants the open
 * database, not its name.
 */
const openHandles = new Map<string, SQLiteDatabase>();

// The same pnpm-specialization cast `phone-ledger.native.ts` documents: two
// Drizzle instances of one version, nominally distinct to TypeScript.
const openPhoneDatabase = ((filename: string) => {
  const sqlite = openDatabaseSync(filename);
  openHandles.set(filename, sqlite);
  return {
    db: drizzle(sqlite, { schema: ledgerSchema }),
    close: () => {
      openHandles.delete(filename);
      sqlite.closeSync();
    },
  };
}) as unknown as PhoneSqliteOpener;

/**
 * Does a database file exist in the pool?
 *
 * Opening is the only probe the pool offers, and opening creates the file —
 * so a probe that finds zero pages has learned "no" and made a small mess,
 * which it cleans up before answering. Sound for *these* files because none
 * of them is ever legitimately empty: a store has been migrated (DDL, at
 * least one page) and a pre-migration copy is a backup of one.
 */
function probeExists(path: string): boolean {
  const probe = openDatabaseSync(path);
  let pages = 0;
  try {
    pages = probe.getFirstSync<{ page_count: number }>("PRAGMA page_count")?.page_count ?? 0;
  } finally {
    probe.closeSync();
  }
  if (pages > 0) return true;
  deleteDatabaseSync(path);
  return false;
}

/** Copy via the online backup API — committed state, read through the connection. */
function copyDatabase(from: string, to: string): void {
  const source = openHandles.get(from);
  if (!source) {
    throw new Error(`cannot copy ${from} — it is not open, and the pool hides closed files`);
  }
  const destination = openDatabaseSync(to);
  try {
    backupDatabaseSync({ sourceDatabase: source, destDatabase: destination });
  } finally {
    destination.closeSync();
  }
}

export const PHONE_LEDGER_AVAILABLE = true as const;

/**
 * The worker is warmed **asynchronously, before the first synchronous call** —
 * and this is a requirement, not an optimization. `invokeWorkerSync` spins a
 * bounded `Atomics.pause` loop measured in tens of milliseconds, while a cold
 * worker has to fetch its bundle and compile the wasm — so `openDatabaseSync`
 * as the first-ever SQLite call on web times out by construction. One
 * `:memory:` open through the async API boots the same singleton worker with
 * no timeout on the wait; once it answers, every sync call is a round-trip to
 * a warm worker and lands inside the spin.
 */
let warmed = false;
const warmListeners = new Set<() => void>();

function markWarmed() {
  warmed = true;
  for (const listener of warmListeners) listener();
}

// A failure here is not swallowed: the gate opens either way, and the real
// `openDatabaseSync` below then reports the same broken worker loudly instead
// of the app hanging on a gate that never opens.
void openDatabaseAsync(":memory:")
  .then((probe) => probe.closeAsync())
  .catch(() => undefined)
  .finally(markWarmed);

function subscribeWarm(listener: () => void): () => void {
  warmListeners.add(listener);
  return () => warmListeners.delete(listener);
}

function readWarm(): boolean {
  return warmed;
}

/** `true` once the worker can answer a synchronous call. The root layout gates on it. */
export function usePhoneLedgerReady(): boolean {
  return useSyncExternalStore(subscribeWarm, readWarm, readWarm);
}

/**
 * Built on first use rather than at module scope — module evaluation happens
 * before the warm-up above can possibly have finished, and the first caller
 * is the root layout, which waits for `usePhoneLedgerReady()`.
 */
let controller: ReturnType<typeof createPhoneLedger> | null = null;

export function requirePhoneLedger() {
  if (!controller) {
    const session = createLocalLedgerSession({
      open: openPhoneDatabase,
      paths: LEDGER_PATHS,
      journalMode: "rollback",
      fs: {
        exists: probeExists,
        copy: copyDatabase,
        remove: (path) => deleteDatabaseSync(path),
      },
      removeDatabase: (path) => deleteDatabaseSync(path),
      // The whole reference set, not the pivot alone — the same bootstrap the
      // phone gets, because it is the same ledger.
      bootstrapCurrencies: currencies.map(({ rateSource: _rateSource, ...currency }) => currency),
      diagnostics: mobileDiagnostics,
    });
    controller = createPhoneLedger(session, deviceRuntime(mobileDiagnostics));
  }
  return controller;
}
