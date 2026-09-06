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
import { initializeDisplayCurrencyFromLedger } from "@waltning/client/currencies/initialize-display-currency";
import {
  createPhoneLedger,
  type PhoneLedgerController,
} from "@waltning/client/ledger/create-phone-ledger";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { createLedgerGate, type LedgerFailureCause } from "@waltning/client/ledger/ledger-gate";
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
import { displayCurrency, setLivePivotReader, setLivePivotSubscriber } from "./platform";

/**
 * The two stores, and — through the pre-migration copies and journals they
 * imply — the number the OPFS pool has to be sized for.
 *
 * A pool slot is one OPFS file, and the VFS refuses a path it has no slot for
 * with `SQLITE_CANTOPEN`. Deleting a store frees its slot — `probeExists`
 * below does exactly that on every launch — but the refused open frees
 * nothing and is not retried, so the file that did not fit simply does not
 * exist. The peak here is six: `replica`, `outbox`, their two
 * `.pre-migration` copies (both live at once, since a copy is discarded only
 * after the session opens cleanly), **one** rollback journal — the stores
 * migrate one after the other, so only one write transaction is open at a
 * time — and the file `probeExists` opens to answer `fs.exists`. Six is also
 * exactly the upstream capacity, which leaves no room at all. The fork raises
 * it to sixteen and tops up an install created under a smaller one
 * (`pnpm-workspace.yaml`, defect 4). Adding a third store here means checking
 * that number.
 */
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

/**
 * Close whatever this module opened before a startup gave up.
 *
 * A retry re-opens the same two files, so a handle left over from the failed
 * attempt would be the thing that refused the next one, turning a transient
 * failure into a permanent one this module caused itself.
 */
function releaseOpenHandles(): void {
  for (const handle of openHandles.values()) {
    try {
      handle.closeSync();
    } catch {
      // Already closed, or closing on a broken worker — either way there is
      // nothing left to do with it and the retry is what matters.
    }
  }
  openHandles.clear();
}

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
 * **The synchronous half, and the only thing in this file the gate cannot
 * decide for itself.** Called once, and only after the probe has resolved —
 * every `openDatabaseSync`, `probeExists` and `copyDatabase` below it runs
 * inside this call, against a worker that has already answered.
 *
 * It throws rather than returning a failure: `createLedgerGate` classifies,
 * releases and caches, because none of those three depend on `expo-sqlite`.
 */
function openSession(): PhoneLedgerController {
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
    // Every current install is disposable until first install (the owner's
    // ruling) — decided here, at the platform seam, never by a schema version.
    preJournalStores: "rebuild",
  });
  const controller = createPhoneLedger(session, deviceRuntime(mobileDiagnostics));
  // H1 — the header's live fallback, wired before anything reads it.
  setLivePivotReader(() => session.listCurrencySettings().find((row) => row.isPivot)?.code ?? null);
  // M2 — `controller.subscribe` fires after every successful write,
  // `change_pivot` included, so a mounted display-currency consumer follows live.
  setLivePivotSubscriber(controller.subscribe);
  // §7.0's default (first pinned, else the live pivot), read from this ledger
  // rather than `platform.ts`'s bootstrap constant — see
  // `initialize-display-currency.ts`. Guarded on hydration inside; never
  // awaited here, same as the fire-and-forget `hydrate()` in `_layout.tsx`.
  void initializeDisplayCurrencyFromLedger(displayCurrency, session.listCurrencySettings);
  return controller;
}

/**
 * **The gate opens when the engine has answered, not when a timer says it
 * should have** — and one asynchronous open establishes everything it needs,
 * because in the worker the two questions are the same call.
 *
 * 1. **Is the worker running?** `invokeWorkerSync` spins a bounded
 *    `Atomics.pause` loop — about nine milliseconds on every current Chromium
 *    — while a cold worker has to fetch its bundle and instantiate a ~620 KB
 *    wasm module. `openDatabaseSync` as the first SQLite call on web times out
 *    by construction, and the timeout is the only thing that surfaces: a
 *    driver-internal `Sync operation timeout`, which names no cause and can be
 *    classified as none. The asynchronous API has no such budget.
 * 2. **Is the OPFS access-handle pool free?** It is acquired for the **whole
 *    pool directory at once, per worker** — not per file, and not per open:
 *    the worker's `maybeInitAsync` runs `AccessHandlePoolVFS.create` before it
 *    so much as looks at the path. So `:memory:` is not a way around it and
 *    that is what makes it the right probe — it asks the real question and
 *    creates no pool file while asking (`':memory:'` short-circuits before any
 *    directory is prefixed).
 *
 * A document being replaced does not return its handles the instant the next
 * one starts running, so two loads a second or two apart put the new page's
 * acquisition against the old page's worker and it is refused. That is a
 * timing condition, not a broken ledger, which is why it is retried.
 *
 * **The deadline is the other half of "answered".** The driver parks a
 * deferred and posts; nothing in it ever times that out, and a worker whose
 * module cannot evaluate — a missing wasm asset, cross-origin isolation
 * headers dropped from the dev server or the Caddyfile — never installs its
 * `onmessage` handler at all. Awaiting that is awaiting forever, which renders
 * as a blank frame with no sentence and no button. Eight seconds is long
 * enough for a cold cache on a slow phone and short enough to still be a
 * screen rather than a void; the deadline is per attempt, so a slow device
 * gets the whole schedule.
 *
 * **The decisions this feeds are not here.** `createLedgerGate`
 * (`packages/client`) holds when a synchronous open may be attempted, what the
 * screen says when it may not, what is worth another attempt and what is
 * cached — none of which names a platform API, all of which is driven by
 * `ledger-gate.test.ts` with stubs. What is left in this file is `expo-sqlite`.
 *
 * **Two properties only the vendored fork provides** (`pnpm-workspace.yaml`
 * states all four defects and why): a refused acquisition leaves the worker
 * able to try again, and a successful async call resolves rather than
 * rejecting. `tests/dependency-patches.test.ts` drives both against the
 * installed files.
 */
const WARMUP_SCHEDULE = { delays: [0, 150, 300, 600, 1200], deadlineMs: 8000 } as const;

function after(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probeWorker(): Promise<void> {
  const probe = await openDatabaseAsync(":memory:");
  await probe.closeAsync();
}

const gate = createLedgerGate<PhoneLedgerController>({
  probe: probeWorker,
  open: openSession,
  release: releaseOpenHandles,
  schedule: WARMUP_SCHEDULE,
  wait: after,
});

/**
 * Re-run the gate, then let the caller start again.
 *
 * **Fire-and-forget on purpose.** It flips the module back to "still probing",
 * which turns `usePhoneLedgerReady()` false, which is what puts the blank
 * frame back on screen; when the probe settles the gate opens again and the
 * caller's own guard runs `startPhoneLedger` once. A `retry` that awaited this
 * would have to be async inside a render, which is the one thing the startup
 * hook exists to avoid.
 */
export function retryPhoneLedger(): void {
  gate.retry();
}

/** `true` once the gate has settled, either way. The root layout gates on it. */
export function usePhoneLedgerReady(): boolean {
  return useSyncExternalStore(gate.subscribe, gate.ready, gate.ready);
}

export type PhoneLedgerStartup =
  | { status: "ready"; controller: PhoneLedgerController }
  /**
   * `cause` present means the platform could not get the engine up and the
   * screen says a sentence of its own; absent means the ledger refused after
   * the engine answered, and its own words are shown. `createLedgerGate` is
   * where that is decided.
   */
  | {
      status: "failed";
      error: Error;
      retryable: boolean;
      cause?: LedgerFailureCause;
    };

/**
 * The startup outcome. Delegated whole to the gate, which never makes a
 * synchronous call against an engine that has not answered — see its header,
 * and `openSession` below for the part that is actually `expo-sqlite`.
 */
export function startPhoneLedger(): PhoneLedgerStartup {
  return gate.start();
}
