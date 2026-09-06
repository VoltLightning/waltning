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
import { Directory, File, Paths } from "expo-file-system";
import { deleteDatabaseSync, openDatabaseSync, type SQLiteRunResult } from "expo-sqlite";
import { mobileDiagnostics } from "./diagnostics.ts";
import { displayCurrency, setLivePivotReader, setLivePivotSubscriber } from "./platform";

const LEDGER_PATHS = {
  replica: "waltning-replica.db",
  outbox: "waltning-outbox.db",
} as const;

// Assigned inside `startPhoneLedger`'s own `try` — `new Directory(...)` and
// `.create()` are both throwable filesystem calls, and a throw here at
// module scope used to break the layout module's own evaluation (see the
// function's header). `file`/`openPhoneDatabase` below close over these by
// reference, so they read whatever `startPhoneLedger` has set by the time a
// migration actually calls them.
let databaseDirectory: Directory;
let databaseDirectoryPath: string;
const file = (path: string) => new File(databaseDirectory, path);

type PhoneSqliteOpener = SqliteOpener<SQLiteRunResult, typeof ledgerSchema>;

// pnpm specializes Drizzle's package instance by its optional peers. The
// mobile and ledger instances are the same version and public shape, but a
// private member makes them nominally distinct to TypeScript. Keep that
// package-manager boundary here, where Expo enters, rather than weakening the
// ledger's typed database seam for every caller.
const openPhoneDatabase = ((filename: string) => {
  const sqlite = openDatabaseSync(filename, undefined, databaseDirectoryPath);
  return { db: drizzle(sqlite, { schema: ledgerSchema }), close: () => sqlite.closeSync() };
}) as unknown as PhoneSqliteOpener;

export const PHONE_LEDGER_AVAILABLE = true as const;

export type PhoneLedgerStartup =
  | { status: "ready"; controller: PhoneLedgerController }
  /**
   * **`retryable` is constantly `false` here, and that is a fact about the
   * device rather than an omission.** The browser's failure worth retrying is
   * the OPFS access-handle pool still held by the document being replaced
   * (`phone-ledger.web.ts`); a phone has one process, one document directory
   * and no second holder, so an open that fails here fails the same way on the
   * next attempt. The field exists so the three variants describe one shape
   * and `_layout.tsx` reads one field.
   */
  | {
      status: "failed";
      error: Error;
      retryable: false;
      /**
       * Never set here: `cause` names a way the *platform* failed to get
       * the engine up, and the device has no such step — every failure it
       * can have is the ledger's own, shown in the ledger's own words.
       */
      cause?: undefined;
    };

let startup: PhoneLedgerStartup | null = null;

/**
 * Built on first use rather than at module scope — **nothing throwable runs
 * outside this function's own `try`**, `new Directory(...)`/`.create()`
 * included, not only `createLocalLedgerSession`. A throw at module scope
 * used to break the layout module's own evaluation, which is why
 * expo-router reported a missing default export and crashed on its own
 * `ErrorBoundary` instead of showing a screen. Cached after the first call,
 * failure included: the only way out of a failed startup is relaunching the
 * app, and `createLocalLedgerSession` has already emitted its own
 * `ledger_startup` failure diagnostic, so nothing more is logged here.
 */
export function startPhoneLedger(): PhoneLedgerStartup {
  if (startup) return startup;

  try {
    databaseDirectory = new Directory(Paths.document, "SQLite");
    databaseDirectory.create({ idempotent: true, intermediates: true });
    databaseDirectoryPath = databaseDirectory.uri.replace(/^file:\/\//u, "");

    const session = createLocalLedgerSession({
      open: openPhoneDatabase,
      paths: LEDGER_PATHS,
      fs: {
        exists: (path) => file(path).exists,
        copy: (from, to) => file(from).copySync(file(to), { overwrite: true }),
        remove: (path) => {
          const target = file(path);
          if (target.exists) target.delete();
        },
      },
      removeDatabase: (path) => deleteDatabaseSync(path, databaseDirectoryPath),
      // The whole reference set, not the pivot alone. `accounts.currency` is a
      // foreign key into this table, so what the replica is bootstrapped with
      // is exactly the set of currencies an account can be opened in.
      bootstrapCurrencies: currencies.map(({ rateSource: _rateSource, ...currency }) => currency),
      diagnostics: mobileDiagnostics,
      // Every current install is disposable until first install (the
      // owner's ruling) — decided here, at the platform seam, never by a
      // schema version.
      preJournalStores: "rebuild",
    });

    const controller = createPhoneLedger(session, deviceRuntime(mobileDiagnostics));

    // H1 — the header's live fallback, wired before anything reads it: every
    // `getSnapshot()` call resolves through this reader once nothing is chosen.
    setLivePivotReader(
      () => session.listCurrencySettings().find((row) => row.isPivot)?.code ?? null,
    );
    // M2 — `controller.subscribe` fires after every successful write, `change_
    // pivot` included, so a mounted display-currency consumer follows live.
    setLivePivotSubscriber(controller.subscribe);

    // §7.0's default (first pinned, else the live pivot), read from this
    // ledger rather than `platform.ts`'s bootstrap constant — see
    // `initialize-display-currency.ts`. Guarded on hydration inside; never
    // awaited here, same as the fire-and-forget `hydrate()` in `_layout.tsx`.
    void initializeDisplayCurrencyFromLedger(displayCurrency, session.listCurrencySettings);

    startup = { status: "ready", controller };
  } catch (caught) {
    // `catch` bindings are `unknown` because the language gives no choice —
    // `errorFromThrown` keeps whatever a non-`Error` thrower said instead of
    // rendering it as `[object Object]` on the failure screen.
    startup = { status: "failed", error: errorFromThrown(caught), retryable: false };
  }

  return startup;
}

/**
 * Nothing to warm and nothing to wait for: the device opens synchronously
 * against its own filesystem, so a retry is the caller's own re-run of
 * `startPhoneLedger`. Clearing the cached outcome is all this can usefully do
 * — and `retryable` is constantly `false` here, so nothing offers it.
 */
export function retryPhoneLedger(): void {
  startup = null;
}

/** The device opens synchronously with no worker to warm — always ready. */
export function usePhoneLedgerReady(): true {
  return true;
}
