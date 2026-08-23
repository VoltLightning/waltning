import "./polyfills.ts";
import { createPhoneLedger } from "@waltning/client/ledger";
import { type IdTable, id, randomId, todayIn } from "@waltning/core";
import {
  createLocalLedgerSession,
  ledgerSchema,
  type SqliteOpener,
  USD_BOOTSTRAP,
} from "@waltning/ledger";
import { drizzle } from "drizzle-orm/expo-sqlite";
import { File } from "expo-file-system";
import {
  defaultDatabaseDirectory,
  deleteDatabaseSync,
  openDatabaseSync,
  type SQLiteRunResult,
} from "expo-sqlite";

const LEDGER_PATHS = {
  replica: "waltning-replica.db",
  outbox: "waltning-outbox.db",
} as const;

const file = (path: string) => new File(defaultDatabaseDirectory, path);

type PhoneSqliteOpener = SqliteOpener<SQLiteRunResult, typeof ledgerSchema>;

// pnpm specializes Drizzle's package instance by its optional peers. The
// mobile and ledger instances are the same version and public shape, but a
// private member makes them nominally distinct to TypeScript. Keep that
// package-manager boundary here, where Expo enters, rather than weakening the
// ledger's typed database seam for every caller.
const openPhoneDatabase = ((filename: string) => {
  const sqlite = openDatabaseSync(filename);
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
  removeDatabase: (path) => deleteDatabaseSync(path),
  bootstrapCurrency: USD_BOOTSTRAP,
});

export const PHONE_LEDGER_AVAILABLE = true as const;

export const phoneLedger = createPhoneLedger(session, {
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
