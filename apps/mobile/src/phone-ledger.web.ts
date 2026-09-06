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
 * **The one failure another attempt can clear, named rather than guessed.**
 *
 * The browser rejects `createSyncAccessHandle` with a `DOMException` called
 * `NoModificationAllowedError` while another document still holds the OPFS
 * access-handle pool — and that name is the whole signal. It survives the
 * worker boundary because the patched channel sends `name` alongside `message`
 * (`pnpm-workspace.yaml`, patch 2); before that every synchronous failure in
 * the browser arrived as the message `[object Object]` and nothing downstream
 * could tell one from another.
 *
 * **Which line threw is not the question.** An earlier version answered
 * "did the throw come from an open call?", which classifies a corrupt replica
 * (`SQLITE_NOTADB`) and an exhausted pool (`SQLITE_CANTOPEN` past the pool's
 * six slots) as retryable — both permanent, both then offered a button that
 * re-runs the whole open/migrate path forever. The safe default is the
 * opposite one: offer a retry only where the cause can be named.
 */
const POOL_CONTENTION = "NoModificationAllowedError";

/** The cause chain too — `session.ts` wraps a rebuild failure and keeps `cause`. */
function isPoolContention(error: Error): boolean {
  for (let step: Error | undefined = error, depth = 0; step && depth < 8; depth += 1) {
    if (step.name === POOL_CONTENTION || step.message.includes(POOL_CONTENTION)) return true;
    step = step.cause instanceof Error ? step.cause : undefined;
  }
  return false;
}

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
 * **One async open answers both questions the first synchronous call depends
 * on**, because in the worker they are the same question.
 *
 * 1. **Is the worker running?** `invokeWorkerSync` spins a bounded
 *    `Atomics.pause` loop measured in tens of milliseconds, while a cold
 *    worker has to fetch its bundle and compile the wasm — so
 *    `openDatabaseSync` as the first-ever SQLite call on web times out by
 *    construction. An open through the async API waits without that timeout.
 * 2. **Is the OPFS access-handle pool free?** It is acquired for the **whole
 *    pool directory at once, per worker** — not per file, and not per open:
 *    the worker's `maybeInitAsync` runs `AccessHandlePoolVFS.create` before it
 *    so much as looks at the path, and that call takes a sync access handle on
 *    every file in the directory. So `:memory:` is not a way around it; a
 *    `:memory:` open acquires the pool exactly as a file open does. Which is
 *    what makes it the right probe: it asks the real question and creates no
 *    file while asking.
 *
 * A document being replaced does not return its handles the instant the next
 * one starts running, so two loads a second or two apart put the new page's
 * acquisition against the old page's worker and it is refused. That is a
 * timing condition, not a broken ledger.
 *
 * **This loop only means anything because of patch 3** (`pnpm-workspace.yaml`).
 * Upstream, a refused acquisition was permanent for the life of the document —
 * `_sqlite3` was assigned before the VFS, so every later call fell through to
 * `Invalid VFS state`, and the handles the failed attempt *had* won stayed open
 * inside an unreachable instance. Retrying against that worker was five more
 * certain failures. The patch publishes the VFS trio together and releases a
 * partial acquisition, so each attempt here is a real attempt.
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
 * **The gate opens after the last attempt whether or not it succeeded**, and
 * that is deliberate: a gate that waited for success would hang the app on a
 * genuinely broken worker with nothing on screen. Five attempts over ~2 s is
 * longer than a page swap; past that the synchronous open below runs, fails
 * loudly, and the failure screen says what happened — with a retry when the
 * cause is one another attempt can clear (`isPoolContention`).
 */
async function prepareWorker(): Promise<void> {
  for (const delay of OPEN_BACKOFF_MS) {
    if (delay > 0) await after(delay);
    try {
      const probe = await openDatabaseAsync(":memory:");
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
   * `true` only for the one cause `isPoolContention` can name — a document
   * that lost the race for the OPFS pool. Everything else, corrupt file and
   * refused migration alike, is terminal by default.
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
    // `catch` bindings are `unknown` because the language gives no choice.
    // What crosses the worker boundary is always an `Error` — the driver
    // normalises it — so what matters is that it now carries the *worker's*
    // name and message rather than the constant `[object Object]` the channel
    // used to produce (`pnpm-workspace.yaml`, patch 2). `errorFromThrown`
    // covers the non-`Error` throws that reach here from everywhere else.
    const error = errorFromThrown(caught);
    const failure = { status: "failed", error, retryable: isPoolContention(error) } as const;
    releaseOpenHandles();
    if (!failure.retryable) startup = failure;
    return failure;
  }
}
