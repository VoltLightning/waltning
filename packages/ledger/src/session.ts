import type { AccountingDate } from "@waltning/core/date";
import type { Id } from "@waltning/core/id";
import type {
  ClearingAccountRow,
  CurrencyCode,
  Money,
  Period,
  PeriodSpendRow,
} from "@waltning/core/money";
import type {
  AddCurrencyInput,
  ArchiveAccountInput,
  ArchiveCurrencyInput,
  CategorizeBatchInput,
  ChangePivotInput,
  ClearManualRateInput,
  CreateAccountInput,
  CreateCategoryInput,
  CreateCounterpartyInput,
  CreateGroupInput,
  CreateTransactionInput,
  DeleteTransactionInput,
  MergeCounterpartiesInput,
  ReconcileAccountInput,
  RecordDistinctCounterpartiesInput,
  SetManualRateInput,
  SetPinnedInput,
  SetRateSourceInput,
  SetTransactionLinesInput,
  SettleDebtInput,
  UnmergeCounterpartiesInput,
  UpdateAccountInput,
  UpdateCounterpartyInput,
  UpdateTransactionInput,
} from "@waltning/core/registry/inputs";
import type { CategoryKind } from "@waltning/schema/enums";
import { currencies } from "@waltning/schema/sqlite/currencies";
import { archiveAccountExecutor } from "./accounts/archive-account.executor.ts";
import { createAccountExecutor, type LocalAccountRow } from "./accounts/create-account.executor.ts";
import { createGroupExecutor, type LocalGroupRow } from "./accounts/create-group.executor.ts";
import { type LocalAccountSummary, readAccounts } from "./accounts/read-accounts.ts";
import { readBalanceAsOf } from "./accounts/read-balance-as-of.ts";
import { type LocalGroup, readGroups } from "./accounts/read-groups.ts";
import { type LocalNetWorth, readNetWorth } from "./accounts/read-net-worth.ts";
import { readUnsettledClearing } from "./accounts/read-unsettled-clearing.ts";
import { reconcileAccountExecutor } from "./accounts/reconcile-account.executor.ts";
import { updateAccountExecutor } from "./accounts/update-account.executor.ts";
import {
  createCategoryExecutor,
  type LocalCategoryRow,
} from "./categories/create-category.executor.ts";
import { type LocalCategory, readCategoryTree } from "./categories/read-category-tree.ts";
// ── E2 · counterparties and settlement — its own block, same reason ────────
import {
  createCounterpartyExecutor,
  type LocalCounterpartyRow,
} from "./counterparties/create-counterparty.executor.ts";
import {
  type MergeCounterpartiesResult,
  mergeCounterpartiesExecutor,
} from "./counterparties/merge-counterparties.executor.ts";
import {
  type LocalCounterparty,
  type ReadCounterpartiesOptions,
  readCounterparties,
} from "./counterparties/read-counterparties.ts";
import {
  type LocalDistinctPairRow,
  recordDistinctCounterpartiesExecutor,
} from "./counterparties/record-distinct-counterparties.executor.ts";
import {
  type SettleDebtResult,
  settleDebtExecutor,
} from "./counterparties/settle-debt.executor.ts";
import {
  type UnmergeCounterpartiesResult,
  unmergeCounterpartiesExecutor,
} from "./counterparties/unmerge-counterparties.executor.ts";
import { updateCounterpartyExecutor } from "./counterparties/update-counterparty.executor.ts";
// ── E3 · FX operations — the phone half ────────────────────────────────────
import { addCurrencyExecutor, type LocalCurrencyRow } from "./currencies/add-currency.executor.ts";
import { archiveCurrencyExecutor } from "./currencies/archive-currency.executor.ts";
import { changePivotExecutor } from "./currencies/change-pivot.executor.ts";
import {
  type ClearManualRateResult,
  clearManualRateExecutor,
} from "./currencies/clear-manual-rate.executor.ts";
// ── end E2 block ─────────────────────────────────────────────────────────
import { type LocalCurrency, readCurrencies } from "./currencies/read-currencies.ts";
import {
  type LocalCoverage,
  type LocalRate,
  type LocalRateRow,
  listFxRates,
  readCoverage,
  readRate,
} from "./currencies/read-rate.ts";
import {
  type SetManualRateResult,
  setManualRateExecutor,
} from "./currencies/set-manual-rate.executor.ts";
import { setPinnedExecutor } from "./currencies/set-pinned.executor.ts";
import { setRateSourceExecutor } from "./currencies/set-rate-source.executor.ts";
// ── end E3 block ─────────────────────────────────────────────────────────
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
  listAccounts: (options?: { includeArchived?: boolean }) => readonly LocalAccountSummary[];
  listCurrencies: () => readonly LocalCurrency[];
  listGroups: () => readonly LocalGroup[];
  listRecent: (limit: number) => readonly LocalRecentTransaction[];
  listCategories: () => readonly LocalCapturableCategory[];
  /** The whole tree — groups and leaves both — for S06's sheet. See `readCategoryTree`. */
  listCategoryTree: () => readonly LocalCategory[];
  /** `includeArchived` — default `false`, same toggle as `listAccounts`. */
  listCounterparties: (options?: ReadCounterpartiesOptions) => readonly LocalCounterparty[];
  /** §3, per currency — C2's hero (`DualTotal`), not the phone-preview's single subtotal. */
  listNetWorth: () => readonly LocalNetWorth[];
  /** §5's base figure, per currency. `period` is screen state, not store state — C2. */
  readPeriodSpend: (period: Period) => readonly PeriodSpendRow[];
  /** §8, minus FIFO attribution — C2's unsettled banner. */
  listUnsettledClearing: () => readonly ClearingAccountRow[];
  /** §2 as of a chosen date — `ReconcileSheet`'s live "Computed" figure, S16 §5. */
  balanceAsOf: (accountId: Id<"accounts">, asOf: AccountingDate) => Money;
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
  updateAccount: (input: UpdateAccountInput, capture: Capture) => LocalAccountRow;
  archiveAccount: (input: ArchiveAccountInput, capture: Capture) => LocalAccountRow;
  reconcileAccount: (input: ReconcileAccountInput, capture: Capture) => LocalTransactionRow;
  createGroup: (input: CreateGroupInput, capture: Capture) => LocalGroupRow;
  /* ── E3 · FX ──────────────────────────────────────────────────────────── */
  /** `null`, not `undefined`, matching every other absent-row read on this session. */
  readRate: (pair: {
    base: CurrencyCode;
    quote: CurrencyCode;
    date: AccountingDate;
  }) => LocalRate | null;
  readCoverage: (today: AccountingDate) => readonly LocalCoverage[];
  listFxRates: (range: {
    base: CurrencyCode;
    quote: CurrencyCode;
    from: AccountingDate;
    to: AccountingDate;
  }) => readonly LocalRateRow[];
  addCurrency: (input: AddCurrencyInput, capture: Capture) => LocalCurrencyRow;
  archiveCurrency: (input: ArchiveCurrencyInput, capture: Capture) => LocalCurrencyRow;
  setRateSource: (input: SetRateSourceInput, capture: Capture) => LocalCurrencyRow;
  setPinned: (input: SetPinnedInput, capture: Capture) => LocalCurrencyRow;
  changePivot: (input: ChangePivotInput, capture: Capture) => LocalCurrencyRow;
  setManualRate: (input: SetManualRateInput, capture: Capture) => SetManualRateResult;
  clearManualRate: (input: ClearManualRateInput, capture: Capture) => ClearManualRateResult;
  /* ── end E3 block ─────────────────────────────────────────────────────── */
  // ── E2 · counterparties and settlement ────────────────────────────────────
  createCounterparty: (input: CreateCounterpartyInput, capture: Capture) => LocalCounterpartyRow;
  updateCounterparty: (input: UpdateCounterpartyInput, capture: Capture) => LocalCounterpartyRow;
  mergeCounterparties: (
    input: MergeCounterpartiesInput,
    capture: Capture,
  ) => MergeCounterpartiesResult;
  unmergeCounterparties: (
    input: UnmergeCounterpartiesInput,
    capture: Capture,
  ) => UnmergeCounterpartiesResult;
  recordDistinctCounterparties: (
    input: RecordDistinctCounterpartiesInput,
    capture: Capture,
  ) => LocalDistinctPairRow;
  /** H9: takes the amount and what it discharges — never a residual. Returns one. */
  settleDebt: (input: SettleDebtInput, capture: Capture) => SettleDebtResult;
  // ── end E2 block ─────────────────────────────────────────────────────────
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
    listAccounts: (listOptions) => readAccounts(requireOpen().replica.db, listOptions),
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
    listCounterparties: (options) => readCounterparties(requireOpen().replica.db, options),
    listNetWorth: () => readNetWorth(requireOpen().replica.db),
    readPeriodSpend: (period) => readPeriodSpend(requireOpen().replica.db, period),
    listUnsettledClearing: () => readUnsettledClearing(requireOpen().replica.db),
    balanceAsOf: (accountId, asOf) => readBalanceAsOf(requireOpen().replica.db, accountId, asOf),
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
    updateAccount: (input, capture) =>
      writeLocally(requireOpen(), {
        executor: updateAccountExecutor,
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
    archiveAccount: (input, capture) =>
      writeLocally(requireOpen(), {
        executor: archiveAccountExecutor,
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
    reconcileAccount: (input, capture) =>
      writeLocally(requireOpen(), {
        executor: reconcileAccountExecutor,
        registry: ledgerRegistry,
        input,
        capture,
        ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
      }).row,
    createGroup: (input, capture) =>
      writeLocally(requireOpen(), {
        executor: createGroupExecutor,
        registry: ledgerRegistry,
        input,
        capture,
        ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
      }).row,
    /* ── E3 · FX ────────────────────────────────────────────────────────── */
    readRate: (pair) => readRate(requireOpen().replica.db, pair) ?? null,
    readCoverage: (today) => readCoverage(requireOpen().replica.db, today),
    listFxRates: (range) => listFxRates(requireOpen().replica.db, range),
    addCurrency: (input, capture) =>
      writeLocally(requireOpen(), {
        executor: addCurrencyExecutor,
        registry: ledgerRegistry,
        input,
        capture,
        ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
      }).row,
    archiveCurrency: (input, capture) =>
      writeLocally(requireOpen(), {
        executor: archiveCurrencyExecutor,
        registry: ledgerRegistry,
        input,
        capture,
        ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
      }).row,
    setRateSource: (input, capture) =>
      writeLocally(requireOpen(), {
        executor: setRateSourceExecutor,
        registry: ledgerRegistry,
        input,
        capture,
        ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
      }).row,
    setPinned: (input, capture) =>
      writeLocally(requireOpen(), {
        executor: setPinnedExecutor,
        registry: ledgerRegistry,
        input,
        capture,
        ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
      }).row,
    changePivot: (input, capture) =>
      writeLocally(requireOpen(), {
        executor: changePivotExecutor,
        registry: ledgerRegistry,
        input,
        capture,
        ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
      }).row,
    setManualRate: (input, capture) =>
      writeLocally(requireOpen(), {
        executor: setManualRateExecutor,
        registry: ledgerRegistry,
        input,
        capture,
        ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
      }).row,
    clearManualRate: (input, capture) =>
      writeLocally(requireOpen(), {
        executor: clearManualRateExecutor,
        registry: ledgerRegistry,
        input,
        capture,
        ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
      }).row,
    /* ── end E3 block ───────────────────────────────────────────────────── */
    // ── E2 · counterparties and settlement ──────────────────────────────────
    createCounterparty: (input, capture) =>
      writeLocally(requireOpen(), {
        executor: createCounterpartyExecutor,
        registry: ledgerRegistry,
        input,
        capture,
        ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
      }).row,
    updateCounterparty: (input, capture) =>
      writeLocally(requireOpen(), {
        executor: updateCounterpartyExecutor,
        registry: ledgerRegistry,
        input,
        capture,
        ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
      }).row,
    mergeCounterparties: (input, capture) =>
      writeLocally(requireOpen(), {
        executor: mergeCounterpartiesExecutor,
        registry: ledgerRegistry,
        input,
        capture,
        ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
      }).row,
    unmergeCounterparties: (input, capture) =>
      writeLocally(requireOpen(), {
        executor: unmergeCounterpartiesExecutor,
        registry: ledgerRegistry,
        input,
        capture,
        ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
      }).row,
    recordDistinctCounterparties: (input, capture) =>
      writeLocally(requireOpen(), {
        executor: recordDistinctCounterpartiesExecutor,
        registry: ledgerRegistry,
        input,
        capture,
        ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
      }).row,
    settleDebt: (input, capture) =>
      writeLocally(requireOpen(), {
        executor: settleDebtExecutor,
        registry: ledgerRegistry,
        input,
        capture,
        ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
      }).row,
    // ── end E2 block ─────────────────────────────────────────────────────────
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
