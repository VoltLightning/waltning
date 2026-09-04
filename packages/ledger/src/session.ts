import type { Id } from "@waltning/core/id";
import type {
  ClearingAccountRow,
  CurrencyCode,
  Period,
  PeriodSpendRow,
} from "@waltning/core/money";
import type {
  CategorizeBatchInput,
  CreateAccountInput,
  CreateCategoryInput,
  CreateTransactionInput,
  DeleteTransactionInput,
  SetTransactionLinesInput,
  UpdateTransactionInput,
} from "@waltning/core/registry/inputs";
import type { CategoryKind } from "@waltning/schema/enums";
import { currencies } from "@waltning/schema/sqlite/currencies";
import { createAccountExecutor, type LocalAccountRow } from "./accounts/create-account.executor.ts";
import { type LocalAccountSummary, readAccounts } from "./accounts/read-accounts.ts";
import { type LocalGroup, readGroups } from "./accounts/read-groups.ts";
import { type LocalNetWorth, readNetWorth } from "./accounts/read-net-worth.ts";
import { readUnsettledClearing } from "./accounts/read-unsettled-clearing.ts";
import {
  createCategoryExecutor,
  type LocalCategoryRow,
} from "./categories/create-category.executor.ts";
import { type LocalCategory, readCategoryTree } from "./categories/read-category-tree.ts";
import {
  type LocalCounterparty,
  readCounterparties,
} from "./counterparties/read-counterparties.ts";
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
import { categorizeBatchExecutor } from "./transactions/categorize-batch.executor.ts";
import {
  createTransactionExecutor,
  type LocalTransactionRow,
} from "./transactions/create-transaction.executor.ts";
import { deleteTransactionExecutor } from "./transactions/delete-transaction.executor.ts";
import { readPeriodSpend } from "./transactions/read-period-spend.ts";
import { type LocalRecentTransaction, readRecent } from "./transactions/read-recent.ts";
import { type LocalTransactionDetail, readTransaction } from "./transactions/read-transaction.ts";
import {
  searchTransactions,
  type TransactionSearchCursor,
  type TransactionSearchFilter,
  type TransactionSearchPage,
} from "./transactions/search-transactions.ts";
import { setTransactionLinesExecutor } from "./transactions/set-transaction-lines.executor.ts";
import { updateTransactionExecutor } from "./transactions/update-transaction.executor.ts";
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

/**
 * A leaf category, as a picker needs it.
 *
 * `readCategoryTree` carries the whole hierarchy — parent, depth, `isLeaf` —
 * for the executors' cycle check and S19's editor. Only a leaf can be
 * assigned to a transaction (TAXONOMY R1), so the session filters to that
 * subset before it ever reaches a form.
 */
export type LocalCapturableCategory = {
  id: Id<"categories">;
  name: string;
  kind: CategoryKind;
};

export type LocalLedgerSession = {
  listAccounts: () => readonly LocalAccountSummary[];
  listCurrencies: () => readonly LocalCurrency[];
  listGroups: () => readonly LocalGroup[];
  listRecent: (limit: number) => readonly LocalRecentTransaction[];
  listCategories: () => readonly LocalCapturableCategory[];
  /** The whole tree — groups and leaves both — for S06's sheet. See `readCategoryTree`. */
  listCategoryTree: () => readonly LocalCategory[];
  listCounterparties: () => readonly LocalCounterparty[];
  /** §3, per currency — C2's hero (`DualTotal`), not the phone-preview's single subtotal. */
  listNetWorth: () => readonly LocalNetWorth[];
  /** §5's base figure, per currency. `period` is screen state, not store state — C2. */
  readPeriodSpend: (period: Period) => readonly PeriodSpendRow[];
  /** §8, minus FIFO attribution — C2's unsettled banner. */
  listUnsettledClearing: () => readonly ClearingAccountRow[];
  /** C4 — S10's list. A query, not a snapshot field: a filtered page is asked for, not held. */
  searchTransactions: (
    filter: TransactionSearchFilter,
    cursor?: TransactionSearchCursor,
  ) => TransactionSearchPage;
  createAccount: (input: CreateAccountInput, capture: Capture) => LocalAccountRow;
  createTransaction: (input: CreateTransactionInput, capture: Capture) => LocalTransactionRow;
  createCategory: (input: CreateCategoryInput, capture: Capture) => LocalCategoryRow;
  /** C4 — S10's swipe-categorize. One category over N ids, refused as a whole or not at all. */
  categorizeBatch: (
    input: CategorizeBatchInput,
    capture: Capture,
  ) => readonly LocalTransactionRow[];
  /** S09's whole subject, one query — `null` for a row that is gone or soft-deleted. */
  getTransaction: (id: Id<"transactions">) => LocalTransactionDetail | null;
  updateTransaction: (input: UpdateTransactionInput, capture: Capture) => LocalTransactionRow;
  deleteTransaction: (input: DeleteTransactionInput, capture: Capture) => LocalTransactionRow;
  setTransactionLines: (input: SetTransactionLinesInput, capture: Capture) => LocalTransactionRow;
  reset: () => void;
  close: () => void;
};

export type LocalLedgerSessionOptions<TRun> = {
  open: SqliteOpener<TRun, typeof ledgerSchema>;
  paths: LedgerPaths;
  fs: LedgerFs;
  /**
   * `"rollback"` only where the platform genuinely cannot WAL — the browser —
   * and only with a `fs.copy` that reads through the live connection rather
   * than the file. `open.ts` carries the reasoning and verifies the claim.
   */
  journalMode?: "wal" | "rollback";
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
    ledger = openLedger(
      options.open,
      options.paths,
      options.journalMode ? { journalMode: options.journalMode } : {},
    );
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
    listGroups: () => readGroups(requireOpen().replica.db),
    listRecent: (limit) => readRecent(requireOpen().replica.db, limit),
    listCategories: () =>
      readCategoryTree(requireOpen().replica.db)
        .filter((category) => category.isLeaf && !category.archived)
        .map(({ id, name, kind }) => ({ id, name, kind })),
    // Archived nodes excluded, same as `listCategories` above — an archived
    // category has stopped being offerable (`TAXONOMY.md` R2), and a picker
    // is exactly where "offerable" matters.
    listCategoryTree: () =>
      readCategoryTree(requireOpen().replica.db).filter((category) => !category.archived),
    listCounterparties: () => readCounterparties(requireOpen().replica.db),
    listNetWorth: () => readNetWorth(requireOpen().replica.db),
    readPeriodSpend: (period) => readPeriodSpend(requireOpen().replica.db, period),
    listUnsettledClearing: () => readUnsettledClearing(requireOpen().replica.db),
    searchTransactions: (filter, cursor) =>
      searchTransactions(requireOpen().replica.db, filter, cursor),
    getTransaction: (id) => readTransaction(requireOpen().replica.db, id),
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
    createCategory: (input, capture) =>
      writeLocally(requireOpen(), {
        executor: createCategoryExecutor,
        registry: ledgerRegistry,
        input,
        capture,
        ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
      }).row,
    categorizeBatch: (input, capture) =>
      writeLocally(requireOpen(), {
        executor: categorizeBatchExecutor,
        registry: ledgerRegistry,
        input,
        capture,
        ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
      }).row,
    updateTransaction: (input, capture) =>
      writeLocally(requireOpen(), {
        executor: updateTransactionExecutor,
        registry: ledgerRegistry,
        input,
        capture,
        ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
      }).row,
    deleteTransaction: (input, capture) =>
      writeLocally(requireOpen(), {
        executor: deleteTransactionExecutor,
        registry: ledgerRegistry,
        input,
        capture,
        ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
      }).row,
    setTransactionLines: (input, capture) =>
      writeLocally(requireOpen(), {
        executor: setTransactionLinesExecutor,
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
