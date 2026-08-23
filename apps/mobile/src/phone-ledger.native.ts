import "./polyfills.ts";
import { createPhoneLedger } from "@waltning/client/ledger/create-phone-ledger";
import { todayIn } from "@waltning/core/date";
import { type IdTable, id } from "@waltning/core/id";
import { randomId } from "@waltning/core/random";
import type { SqliteOpener } from "@waltning/ledger/open";
import { ledgerSchema } from "@waltning/ledger/schema-map";
import { createLocalLedgerSession, USD_BOOTSTRAP } from "@waltning/ledger/session";
import { drizzle } from "drizzle-orm/expo-sqlite";
import { Directory, File, Paths } from "expo-file-system";
import { deleteDatabaseSync, openDatabaseSync, type SQLiteRunResult } from "expo-sqlite";
import { mobileDiagnostics } from "./diagnostics.ts";

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
  bootstrapCurrency: USD_BOOTSTRAP,
  diagnostics: mobileDiagnostics,
});

export const PHONE_LEDGER_AVAILABLE = true as const;

export const phoneLedger = createPhoneLedger(session, {
  diagnostics: mobileDiagnostics,
  capture: () => {
    const at = new Date();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    return {
      date: todayIn(timeZone, at),
      timeZone,
      offsetMinutes: -at.getTimezoneOffset(),
      at,
    };
  },
  id: <Table extends IdTable>() => id<Table>(randomId()),
});

export function requirePhoneLedger() {
  return phoneLedger;
}
