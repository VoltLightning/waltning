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
import { currencies } from "@waltning/core/currencies";
import { errorFromThrown } from "@waltning/core/diagnostics";
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
 * Set by `openDatabase` below, read by `startPhoneLedger` — **which half of a
 * startup failure this was.**
 *
 * Opening and migrating fail for opposite reasons. The pool is held by one
 * document at a time, so an open that lands while the previous page's worker
 * still holds the access handles fails on a condition that clears by itself in
 * under a second; a migration refuses on the *content* of a file, which the
 * next attempt finds unchanged. One is worth another attempt and the other is
 * not, and that is the whole of what the failure screen needs to know.
 */
let openFailed = false;

/**
 * Every `openDatabaseSync` in this module goes through here, so nothing can
 * open a file without the transient/terminal question being answered for it.
 */
function openDatabase(filename: string): SQLiteDatabase {
  try {
    return openDatabaseSync(filename);
  } catch (caught) {
    openFailed = true;
    throw caught;
  }
}

/**
 * Close whatever this module opened before a startup gave up.
 *
 * A retry re-opens the same two files, and the pool admits one holder per
 * file — so a handle left over from the failed attempt would be the thing that
 * refused the next one, turning a transient failure into a permanent one this
 * module caused itself.
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
  const sqlite = openDatabase(filename);
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
  const probe = openDatabase(path);
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
  const destination = openDatabase(to);
  try {
    backupDatabaseSync({ sourceDatabase: source, destDatabase: destination });
  } finally {
    destination.closeSync();
  }
}

export const PHONE_LEDGER_AVAILABLE = true as const;

/**
 * Two conditions have to hold before the first synchronous call, and the gate
 * below waits for **both**.
 *
 * 1. **The worker has to be running.** `invokeWorkerSync` spins a bounded
 *    `Atomics.pause` loop measured in tens of milliseconds, while a cold
 *    worker has to fetch its bundle and compile the wasm — so
 *    `openDatabaseSync` as the first-ever SQLite call on web times out by
 *    construction. One `:memory:` open through the async API boots the same
 *    singleton worker with no timeout on the wait.
 * 2. **The OPFS access-handle pool has to be free.** It admits one holder per
 *    file, and a document that has just been replaced does not give its
 *    handles back the instant the next one starts running — so two full loads
 *    a second or two apart put the new page's open against the old page's
 *    worker, and the open throws. That is a *timing* condition, not a broken
 *    ledger: the same load a moment later succeeds, which is exactly why it
 *    belongs in the gate rather than on the failure screen.
 *
 * So the gate opens on an **async open of the real replica file**, retried
 * with a short backoff. It is the only probe that answers the question being
 * asked — a `:memory:` database is not in the pool and can tell nothing about
 * who holds it — and closing it again leaves the pool as it was found.
 * Opening a file that does not exist yet creates an empty one, which
 * `probeExists` above already treats as "no" and deletes.
 */
const OPEN_BACKOFF_MS = [0, 150, 300, 600, 1200] as const;

let ready = false;
const readyListeners = new Set<() => void>();

function markReady() {
  ready = true;
  for (const listener of readyListeners) listener();
}

function after(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A failure here is not swallowed and the gate opens either way — five
 * attempts over ~2 s is long enough for a page swap and short enough that a
 * genuinely broken worker is reported by the real open below, loudly, rather
 * than the app hanging on a gate that never opens. `startPhoneLedger` then
 * classifies that failure as retryable, and the failure screen offers the
 * attempt this loop ran out of.
 */
async function prepareWorker(): Promise<void> {
  try {
    const boot = await openDatabaseAsync(":memory:");
    await boot.closeAsync();
  } catch {
    // A worker that cannot open `:memory:` will say so again below.
  }
  for (const delay of OPEN_BACKOFF_MS) {
    if (delay > 0) await after(delay);
    try {
      const probe = await openDatabaseAsync(LEDGER_PATHS.replica);
      await probe.closeAsync();
      return;
    } catch {
      // The previous document's worker still holds the pool. Wait and ask again.
    }
  }
}

void prepareWorker().finally(markReady);

function subscribeReady(listener: () => void): () => void {
  readyListeners.add(listener);
  return () => readyListeners.delete(listener);
}

function readReady(): boolean {
  return ready;
}

/** `true` once the worker can answer a synchronous call. The root layout gates on it. */
export function usePhoneLedgerReady(): boolean {
  return useSyncExternalStore(subscribeReady, readReady, readReady);
}

export type PhoneLedgerStartup =
  | { status: "ready"; controller: PhoneLedgerController }
  /**
   * `retryable` is the open/migrate distinction `openFailed` records: another
   * attempt can clear a held pool and can never clear a refused migration.
   */
  | { status: "failed"; error: Error; retryable: boolean };

let startup: PhoneLedgerStartup | null = null;

/**
 * Built on first use rather than at module scope — module evaluation happens
 * before the warm-up above can possibly have finished, and the first caller
 * is the root layout, which waits for `usePhoneLedgerReady()`.
 * `createLocalLedgerSession` has already emitted its own `ledger_startup`
 * failure diagnostic, so nothing more is logged here.
 *
 * **A success is cached and a retryable failure is not.** A session is a
 * singleton and a migration refusal is a fact about a file, so both are
 * answers this function keeps. A held pool is neither: it is a statement about
 * a moment that has already passed by the time anyone reads it, and caching it
 * would make the failure screen's own "Try again" a button that re-renders the
 * same sentence. Every retryable attempt releases the handles it took before
 * it returns, so the next one meets the pool it would have met anyway.
 */
export function startPhoneLedger(): PhoneLedgerStartup {
  if (startup) return startup;

  openFailed = false;
  try {
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
      // Every current install is disposable until first install (the
      // owner's ruling) — decided here, at the platform seam, never by a
      // schema version.
      preJournalStores: "rebuild",
    });
    const controller = createPhoneLedger(session, deviceRuntime(mobileDiagnostics));
    // H1 — the header's live fallback, wired before anything reads it.
    setLivePivotReader(
      () => session.listCurrencySettings().find((row) => row.isPivot)?.code ?? null,
    );
    // M2 — `controller.subscribe` fires after every successful write,
    // `change_pivot` included, so a mounted display-currency consumer
    // follows live.
    setLivePivotSubscriber(controller.subscribe);
    // §7.0's default (first pinned, else the live pivot), read from this
    // ledger rather than `platform.ts`'s bootstrap constant — see
    // `initialize-display-currency.ts`. Guarded on hydration inside; never
    // awaited here, same as the fire-and-forget `hydrate()` in `_layout.tsx`.
    void initializeDisplayCurrencyFromLedger(displayCurrency, session.listCurrencySettings);

    startup = { status: "ready", controller };
    return startup;
  } catch (caught) {
    // `catch` bindings are `unknown` because the language gives no choice —
    // and the worker rejects with a plain object rather than an `Error`, which
    // `errorFromThrown` reads instead of rendering it as `[object Object]`.
    const failure = {
      status: "failed",
      error: errorFromThrown(caught),
      retryable: openFailed,
    } as const;
    releaseOpenHandles();
    if (!failure.retryable) startup = failure;
    return failure;
  }
}
