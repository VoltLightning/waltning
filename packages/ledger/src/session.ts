import type { CurrencyCode } from "@waltning/core/money";
import * as money from "@waltning/core/money";
import type { CreateAccountInput, CreateTransactionInput } from "@waltning/core/registry/inputs";
import { currencies } from "@waltning/schema/sqlite/currencies";
import { createAccountExecutor, type LocalAccountRow } from "./accounts/create-account.executor.ts";
import { type LocalAccountSummary, readAccounts } from "./accounts/read-accounts.ts";
import { type LedgerFs, migrateOutbox, migrateReplica } from "./migrate.ts";
import { type Ledger, type LedgerPaths, openLedger, type SqliteOpener } from "./open.ts";
import { recoverOnLaunch } from "./recover.ts";
import { ledgerRegistry } from "./registry.ts";
import type { ledgerSchema } from "./schema-map.ts";
import {
  createTransactionExecutor,
  type LocalTransactionRow,
} from "./transactions/create-transaction.executor.ts";
import { type LocalRecentTransaction, readRecent } from "./transactions/read-recent.ts";
import { type Capture, writeLocally } from "./write.ts";

export type BootstrapCurrency = {
  code: CurrencyCode;
  name: string;
  symbol: string;
  decimals: number;
  isPivot: true;
};

export const USD_BOOTSTRAP = {
  code: money.currencyCode("USD"),
  name: "US dollar",
  symbol: "$",
  decimals: 2,
  isPivot: true,
} as const;

export type LocalLedgerSession = {
  listAccounts: () => readonly LocalAccountSummary[];
  listRecent: (limit: number) => readonly LocalRecentTransaction[];
  createAccount: (input: CreateAccountInput, capture: Capture) => LocalAccountRow;
  createTransaction: (input: CreateTransactionInput, capture: Capture) => LocalTransactionRow;
  reset: () => void;
  close: () => void;
};

export type LocalLedgerSessionOptions<TRun> = {
  open: SqliteOpener<TRun, typeof ledgerSchema>;
  paths: LedgerPaths;
  fs: LedgerFs;
  removeDatabase: (path: string) => void;
  bootstrapCurrency: BootstrapCurrency;
};

type SessionLedger<TRun> = Ledger<TRun, typeof ledgerSchema>;

function start<TRun>(options: LocalLedgerSessionOptions<TRun>): SessionLedger<TRun> {
  const ledger = openLedger(options.open, options.paths);
  try {
    const outboxMigration = migrateOutbox(ledger.outbox, { fs: options.fs });
    const replicaMigration = migrateReplica(ledger.replica, {
      fs: options.fs,
      canRefetch: false,
    });

    ledger.replica.db
      .insert(currencies)
      .values(options.bootstrapCurrency)
      .onConflictDoNothing()
      .run();
    recoverOnLaunch(ledger, ledgerRegistry);

    readAccounts(ledger.replica.db);
    readRecent(ledger.replica.db, 5);

    try {
      outboxMigration.copy?.release();
    } finally {
      replicaMigration.copy?.release();
    }
    return ledger;
  } catch (error) {
    ledger.close();
    throw error;
  }
}

export function createLocalLedgerSession<TRun>(
  options: LocalLedgerSessionOptions<TRun>,
): LocalLedgerSession {
  let ledger = start(options);
  let closed = false;

  const requireOpen = () => {
    if (closed) throw new Error("the local ledger session is closed");
    return ledger;
  };

  return {
    listAccounts: () => readAccounts(requireOpen().replica.db),
    listRecent: (limit) => readRecent(requireOpen().replica.db, limit),
    createAccount: (input, capture) =>
      writeLocally(requireOpen(), {
        executor: createAccountExecutor,
        registry: ledgerRegistry,
        input,
        capture,
      }).row,
    createTransaction: (input, capture) =>
      writeLocally(requireOpen(), {
        executor: createTransactionExecutor,
        registry: ledgerRegistry,
        input,
        capture,
      }).row,
    reset: () => {
      const current = requireOpen();
      closed = true;
      current.close();

      for (const path of [options.paths.replica, options.paths.outbox]) {
        options.removeDatabase(path);
        for (const suffix of ["-wal", "-shm", ".pre-migration"]) {
          const sibling = `${path}${suffix}`;
          if (options.fs.exists(sibling)) options.fs.remove(sibling);
        }
      }

      ledger = start(options);
      closed = false;
    },
    close: () => {
      if (closed) return;
      ledger.close();
      closed = true;
    },
  };
}
