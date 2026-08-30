import type { CurrencyCode } from "@waltning/core/money";
import type { CreateAccountInput, CreateTransactionInput } from "@waltning/core/registry/inputs";
import { currencies } from "@waltning/schema/sqlite/currencies";
import { createAccountExecutor, type LocalAccountRow } from "./accounts/create-account.executor.ts";
import { type LocalAccountSummary, readAccounts } from "./accounts/read-accounts.ts";
import { type LocalCurrency, readCurrencies } from "./currencies/read-currencies.ts";
import {
  describeLedgerError,
  emitLedgerDiagnostic,
  type LedgerDiagnostics,
  type LedgerStartupStage,
} from "./diagnostics.ts";
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

/**
 * A currency row as the replica needs it at first launch.
 *
 * Structurally a `CurrencyDefinition` minus `rateSource`, and deliberately not
 * that type: the phone's bootstrap is a set of rows to insert, and narrowing it
 * here means a caller can hand this function a currency the reference list does
 * not contain — a person's own — without the type saying it came from a seed.
 */
export type BootstrapCurrency = {
  code: CurrencyCode;
  name: string;
  symbol: string;
  symbolPosition: "P" | "S";
  decimals: number;
  isPivot?: boolean;
  pinned?: boolean;
};

export type LocalLedgerSession = {
  listAccounts: () => readonly LocalAccountSummary[];
  listCurrencies: () => readonly LocalCurrency[];
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
  /**
   * Every currency the replica starts with, not one.
   *
   * A single `bootstrapCurrency: USD_BOOTSTRAP` was the whole of the phone's
   * single-currency assumption: `accounts.currency` is a foreign key into this
   * table, so one row meant one possible account currency, enforced by SQLite
   * rather than by any decision.
   */
  bootstrapCurrencies: readonly BootstrapCurrency[];
  diagnostics?: LedgerDiagnostics;
};

type SessionLedger<TRun> = Ledger<TRun, typeof ledgerSchema>;

function start<TRun>(options: LocalLedgerSessionOptions<TRun>): SessionLedger<TRun> {
  const { diagnostics } = options;
  let stage: LedgerStartupStage = "open";
  emitLedgerDiagnostic(diagnostics, { scope: "ledger_startup", phase: "start", stage });

  let ledger: SessionLedger<TRun>;
  try {
    ledger = openLedger(options.open, options.paths);
  } catch (error) {
    emitLedgerDiagnostic(diagnostics, {
      scope: "ledger_startup",
      phase: "failure",
      stage,
      error: describeLedgerError(error),
    });
    throw error;
  }

  try {
    stage = "migrate_outbox";
    const outboxMigration = migrateOutbox(ledger.outbox, { fs: options.fs });
    stage = "migrate_replica";
    const replicaMigration = migrateReplica(ledger.replica, {
      fs: options.fs,
      canRefetch: false,
    });

    stage = "bootstrap_currency";
    // `onConflictDoNothing`, so a launch after someone has edited a currency
    // does not quietly restore the seed's version of it.
    if (options.bootstrapCurrencies.length > 0) {
      ledger.replica.db
        .insert(currencies)
        .values([...options.bootstrapCurrencies])
        .onConflictDoNothing()
        .run();
    }
    stage = "recover";
    recoverOnLaunch(ledger, ledgerRegistry);

    stage = "initial_read";
    readAccounts(ledger.replica.db);
    readRecent(ledger.replica.db, 5);

    stage = "release_copies";
    try {
      outboxMigration.copy?.release();
    } finally {
      replicaMigration.copy?.release();
    }
    emitLedgerDiagnostic(diagnostics, {
      scope: "ledger_startup",
      phase: "success",
      stage: "ready",
    });
    return ledger;
  } catch (error) {
    ledger.close();
    emitLedgerDiagnostic(diagnostics, {
      scope: "ledger_startup",
      phase: "failure",
      stage,
      error: describeLedgerError(error),
    });
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
    listCurrencies: () => readCurrencies(requireOpen().replica.db),
    listRecent: (limit) => readRecent(requireOpen().replica.db, limit),
    createAccount: (input, capture) =>
      writeLocally(requireOpen(), {
        executor: createAccountExecutor,
        registry: ledgerRegistry,
        input,
        capture,
        ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
      }).row,
    createTransaction: (input, capture) =>
      writeLocally(requireOpen(), {
        executor: createTransactionExecutor,
        registry: ledgerRegistry,
        input,
        capture,
        ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
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
