import "./polyfills.ts";
import { initializeDisplayCurrencyFromLedger } from "@waltning/client/currencies/initialize-display-currency";
import { createPhoneLedger } from "@waltning/client/ledger/create-phone-ledger";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { currencies } from "@waltning/core/currencies";
import type { SqliteOpener } from "@waltning/ledger/open";
import { ledgerSchema } from "@waltning/ledger/schema-map";
import { createLocalLedgerSession } from "@waltning/ledger/session";
import { drizzle } from "drizzle-orm/expo-sqlite";
import { Directory, File, Paths } from "expo-file-system";
import { deleteDatabaseSync, openDatabaseSync, type SQLiteRunResult } from "expo-sqlite";
import { mobileDiagnostics } from "./diagnostics.ts";
import { displayCurrency, setLivePivotReader, setLivePivotSubscriber } from "./platform.ts";

const LEDGER_PATHS = {
  replica: "waltning-replica.db",
  outbox: "waltning-outbox.db",
} as const;

const databaseDirectory = new Directory(Paths.document, "SQLite");
databaseDirectory.create({ idempotent: true, intermediates: true });
const databaseDirectoryPath = databaseDirectory.uri.replace(/^file:\/\//u, "");
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
  // foreign key into this table, so what the replica is bootstrapped with is
  // exactly the set of currencies an account can be opened in.
  bootstrapCurrencies: currencies.map(({ rateSource: _rateSource, ...currency }) => currency),
  diagnostics: mobileDiagnostics,
});

export const PHONE_LEDGER_AVAILABLE = true as const;

export const phoneLedger = createPhoneLedger(session, deviceRuntime(mobileDiagnostics));

// H1 — the header's live fallback, wired before anything reads it: every
// `getSnapshot()` call resolves through this reader once nothing is chosen.
setLivePivotReader(() => session.listCurrencySettings().find((row) => row.isPivot)?.code ?? null);
// M2 — `phoneLedger.subscribe` fires after every successful write, `change_
// pivot` included, so a mounted display-currency consumer follows live.
setLivePivotSubscriber(phoneLedger.subscribe);

// §7.0's default (first pinned, else the live pivot), read from this ledger
// rather than `platform.ts`'s bootstrap constant — see
// `initialize-display-currency.ts`. Guarded on hydration inside; never
// awaited here, same as the fire-and-forget `hydrate()` in `_layout.tsx`.
void initializeDisplayCurrencyFromLedger(displayCurrency, session.listCurrencySettings);

export function requirePhoneLedger() {
  return phoneLedger;
}

/** The device opens synchronously with no worker to warm — always ready. */
export function usePhoneLedgerReady(): true {
  return true;
}
