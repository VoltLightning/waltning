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
import { type WarmupResult, warmWorker } from "@waltning/client/ledger/warm-worker";
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
 * (`SQLITE_NOTADB`) and an exhausted pool (`SQLITE_CANTOPEN`) as retryable —
 * both permanent, both then offered a button that re-runs the whole
 * open/migrate path forever. The safe default is the opposite one: offer a
 * retry only where the cause can be named.
 *
 * **An exhausted pool stays terminal, and the mitigation is capacity.** A
 * refused slot is refused on every later attempt of the same open, so a button
 * would be a lie; the answer is that the pool is sized well above this app's
 * own peak in the first place (see `LEDGER_PATHS`), not that the failure is
 * retried.
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
 * **The gate opens when the engine has answered, not when a timer says it
 * should have.** Two things have to be true before any synchronous call, and
 * one asynchronous open establishes both, because in the worker they are the
 * same call.
 *
 * 1. **The worker is running.** `invokeWorkerSync` spins a bounded
 *    `Atomics.pause` loop — about nine milliseconds on every current Chromium
 *    — while a cold worker has to fetch its bundle and instantiate a ~620 KB
 *    wasm module. `openDatabaseSync` as the first SQLite call on web times out
 *    by construction, and the timeout is the only thing that surfaces: a
 *    driver-internal `Sync operation timeout`, which names no cause and can be
 *    classified as none. The asynchronous API has no such budget.
 * 2. **The OPFS access-handle pool is free.** It is acquired for the **whole
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
 * timing condition, not a broken ledger, which is why it is retried here.
 *
 * **What happens when the retries run out is the whole point of the shape.**
 * The synchronous open is *not* attempted against a worker that never
 * answered — it could only report `Sync operation timeout`, and the failure
 * screen would then state a driver string with no action in it and offer no
 * retry, on precisely the condition a retry is for. Instead the probe's own
 * error is the startup outcome: on the browser that is the `DOMException`
 * naming the held pool, which `isPoolContention` can read.
 *
 * **This loop depends on two properties of the vendored driver that only the
 * fork provides** (`pnpm-workspace.yaml` states all four defects and why):
 * a refused acquisition leaves the worker able to try again, and a successful
 * async call resolves rather than rejecting. `tests/dependency-patches.test.ts`
 * drives both against the installed files.
 */
const OPEN_BACKOFF_MS = [0, 150, 300, 600, 1200] as const;

/** `null` while the probe is still running — the layout renders its blank frame. */
let warmup: WarmupResult | null = null;
const readyListeners = new Set<() => void>();

function announce() {
  for (const listener of readyListeners) listener();
}

function after(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probeWorker(): Promise<void> {
  const probe = await openDatabaseAsync(":memory:");
  await probe.closeAsync();
}

function runWarmup(): void {
  warmup = null;
  announce();
  void warmWorker(probeWorker, OPEN_BACKOFF_MS, after).then((result) => {
    warmup = result;
    announce();
  });
}

runWarmup();

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
  startup = null;
  runWarmup();
}

function subscribeReady(listener: () => void): () => void {
  readyListeners.add(listener);
  return () => readyListeners.delete(listener);
}

function readReady(): boolean {
  return warmup !== null;
}

/** `true` once the gate has settled, either way. The root layout gates on it. */
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

  // **A cold worker is answered here, not by the driver.** Nine milliseconds
  // of spin cannot cover a wasm instantiation, so a synchronous open against a
  // worker that never warmed reports `Sync operation timeout` — a string that
  // names no cause, offers no action, and is classified as nothing. The
  // probe's own refusal is the readable account of the same failure, so it is
  // the outcome, and no synchronous call is made at all.
  if (warmup?.status !== "warm") {
    const error = warmup?.error ?? new Error("the browser's SQLite worker has not answered yet");
    return { status: "failed", error, retryable: isPoolContention(error) };
  }

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
