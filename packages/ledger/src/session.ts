import type { PayeeHistoryRow } from "@waltning/core/capture/payee-memory";
import type { AccountingDate } from "@waltning/core/date";
import type { Id } from "@waltning/core/id";
import type { CurrencyCode, Money, Period, PeriodSpendRow } from "@waltning/core/money";
import type {
  AddCurrencyInput,
  ArchiveAccountInput,
  ArchiveCategoryInput,
  ArchiveCurrencyInput,
  CategorizeBatchInput,
  ChangePivotInput,
  ClearManualRateInput,
  ConvertLeafGroupInput,
  CreateAccountInput,
  CreateCategoryInput,
  CreateCounterpartyInput,
  CreateGroupInput,
  CreateTransactionInput,
  DeleteTransactionInput,
  MergeCategoriesInput,
  MergeCounterpartiesInput,
  ReconcileAccountInput,
  RecordDistinctCounterpartiesInput,
  RenameCategoryInput,
  ReparentCategoryInput,
  SetManualRateInput,
  SetPinnedInput,
  SetRateSourceInput,
  SetTransactionLinesInput,
  SettleDebtInput,
  UnmergeCounterpartiesInput,
  UpdateAccountInput,
  UpdateCounterpartyInput,
  UpdateCurrencyInput,
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
import {
  type LocalUnsettledClearing,
  readUnsettledClearing,
} from "./accounts/read-unsettled-clearing.ts";
import { reconcileAccountExecutor } from "./accounts/reconcile-account.executor.ts";
import { updateAccountExecutor } from "./accounts/update-account.executor.ts";
import { archiveCategoryExecutor } from "./categories/archive-category.executor.ts";
import { convertLeafGroupExecutor } from "./categories/convert-leaf-group.executor.ts";
import {
  createCategoryExecutor,
  type LocalCategoryRow,
} from "./categories/create-category.executor.ts";
import {
  type MergeCategoriesResult,
  mergeCategoriesExecutor,
} from "./categories/merge-categories.executor.ts";
import {
  type CategoryReferenceCounts,
  readCategoryReferenceCounts,
} from "./categories/read-category-reference-counts.ts";
import { type LocalCategory, readCategoryTree } from "./categories/read-category-tree.ts";
import { readCategoryUsage } from "./categories/read-category-usage.ts";
import { renameCategoryExecutor } from "./categories/rename-category.executor.ts";
import { reparentCategoryExecutor } from "./categories/reparent-category.executor.ts";
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
  type LocalCounterpartyBalance,
  readCounterpartyBalances,
} from "./counterparties/read-counterparty-balances.ts";
import {
  type LocalCounterpartyMerge,
  readCounterpartyMerges,
} from "./counterparties/read-counterparty-merges.ts";
import { readDistinctCounterpartyPairs } from "./counterparties/read-distinct-counterparty-pairs.ts";
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
import { addCurrencyExecutor, type LocalCurrencyRow } from "./currencies/add-currency.executor.ts";
import { archiveCurrencyExecutor } from "./currencies/archive-currency.executor.ts";
import { type ChangePivotResult, changePivotExecutor } from "./currencies/change-pivot.executor.ts";
import {
  type ClearManualRateResult,
  clearManualRateExecutor,
} from "./currencies/clear-manual-rate.executor.ts";
import { type LocalCurrency, readCurrencies } from "./currencies/read-currencies.ts";
// ── end E2 block ─────────────────────────────────────────────────────────
import { readCurrencySettings } from "./currencies/read-currency-settings.ts";
import {
  type LocalCoverage,
  type LocalCrossRate,
  type LocalRate,
  type LocalRateRow,
  listFxRates,
  readCoverage,
  readCrossRate,
  readRate,
} from "./currencies/read-rate.ts";
import {
  type SetManualRateResult,
  setManualRateExecutor,
} from "./currencies/set-manual-rate.executor.ts";
import { setPinnedExecutor } from "./currencies/set-pinned.executor.ts";
import { setRateSourceExecutor } from "./currencies/set-rate-source.executor.ts";
import { updateCurrencyExecutor } from "./currencies/update-currency.executor.ts";
import {
  describeLedgerError,
  emitLedgerDiagnostic,
  type LedgerDiagnostics,
  type LedgerStartupStage,
} from "./diagnostics.ts";
import {
  isPreJournalStoreError,
  type LedgerFs,
  type Migration,
  migrateOutbox,
  migrateReplica,
} from "./migrate.ts";
import { type Ledger, type LedgerPaths, openLedger, type SqliteOpener } from "./open.ts";
import { type LaunchRecovery, recoverOnLaunch } from "./recover.ts";
import { ledgerRegistry } from "./registry.ts";
import type { ledgerSchema } from "./schema-map.ts";
import { categorizeBatchExecutor } from "./transactions/categorize-batch.executor.ts";
import {
  createTransactionExecutor,
  type LocalTransactionRow,
} from "./transactions/create-transaction.executor.ts";
import { deleteTransactionExecutor } from "./transactions/delete-transaction.executor.ts";
import { readPayeeHistory } from "./transactions/read-payee-history.ts";
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
  /** S17's whole list — every column a settings row needs, `readCurrencySettings`'s answer. */
  listCurrencySettings: (options?: { includeArchived?: boolean }) => readonly LocalCurrencyRow[];
  listGroups: () => readonly LocalGroup[];
  listRecent: (limit: number) => readonly LocalRecentTransaction[];
  listCategories: () => readonly LocalCapturableCategory[];
  /** The whole tree — groups and leaves both, archived excluded — for S06's sheet. See `readCategoryTree`. */
  listCategoryTree: () => readonly LocalCategory[];
  /** `includeArchived` — default `false`, same toggle as `listAccounts`. */
  listCounterparties: (options?: ReadCounterpartiesOptions) => readonly LocalCounterparty[];
  /**
   * D2's own reader, exposed here for D4b's proposal — one row per distinct
   * folded payee, its most recent category. See `readPayeeHistory`.
   */
  listPayeeHistory: () => readonly PayeeHistoryRow[];
  /** §7, one row per counterparty per currency, ageing on companies (O15) — S12. */
  listCounterpartyBalances: (today: AccountingDate) => readonly LocalCounterpartyBalance[];
  /**
   * The whole tree **with archived rows** — S19's editor, which has its own
   * archived toggle and is the one screen where "offerable" is not the
   * question. `listCategoryTree` above stays archived-excluded because its
   * only consumer today is a picker, where an archived category must never
   * appear (`TAXONOMY.md` R2).
   */
  listFullCategoryTree: () => readonly LocalCategory[];
  /** How many live rows touch each category — see `readCategoryUsage`. */
  listCategoryUsage: () => ReadonlyMap<Id<"categories">, number>;
  /** The merge preview's exact pre-write counts — see `readCategoryReferenceCounts`. */
  readCategoryReferenceCounts: (categoryId: Id<"categories">) => CategoryReferenceCounts;
  /** S13's overflow — merges into one counterparty, still live. See `readCounterpartyMerges`. */
  listCounterpartyMerges: (
    counterpartyId: Id<"counterparties">,
  ) => readonly LocalCounterpartyMerge[];
  /** S15 §9.1 — every pair `record_distinct_counterparties` has recorded. See `readDistinctCounterpartyPairs`. */
  listDistinctCounterpartyPairs: () => readonly (readonly [
    Id<"counterparties">,
    Id<"counterparties">,
  ])[];
  /** §3, per currency — C2's hero (`DualTotal`), not the phone-preview's single subtotal. */
  listNetWorth: () => readonly LocalNetWorth[];
  /** §5's base figure, per currency. `period` is screen state, not store state — C2. */
  readPeriodSpend: (period: Period) => readonly PeriodSpendRow[];
  /** §8, FIFO attribution included — C2's unsettled banner names a transaction. */
  listUnsettledClearing: () => readonly LocalUnsettledClearing[];
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
  /** E5 — S14 and S31's own reference line, triangulated through the pivot (§7.0). */
  readCrossRate: (pair: {
    from: CurrencyCode;
    to: CurrencyCode;
    date: AccountingDate;
  }) => LocalCrossRate | null;
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
  changePivot: (input: ChangePivotInput, capture: Capture) => ChangePivotResult;
  setManualRate: (input: SetManualRateInput, capture: Capture) => SetManualRateResult;
  clearManualRate: (input: ClearManualRateInput, capture: Capture) => ClearManualRateResult;
  updateCurrency: (input: UpdateCurrencyInput, capture: Capture) => LocalCurrencyRow;
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
  renameCategory: (input: RenameCategoryInput, capture: Capture) => LocalCategoryRow;
  reparentCategory: (input: ReparentCategoryInput, capture: Capture) => LocalCategoryRow;
  convertLeafGroup: (input: ConvertLeafGroupInput, capture: Capture) => LocalCategoryRow;
  mergeCategories: (input: MergeCategoriesInput, capture: Capture) => MergeCategoriesResult;
  archiveCategory: (input: ArchiveCategoryInput, capture: Capture) => LocalCategoryRow;
  /**
   * What the most recent launch (or `reset`) found — S30's eventual source
   * for `halted` and the deferred count. R4 L2: read, not thrown away.
   */
  lastRecovery: () => LaunchRecovery;
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
  /**
   * The two chains, when a caller needs a session over a database **below**
   * this build's head. Defaults to this build's own; the app never sets it.
   *
   * The one caller is `tools/dump-fixture.ts`. `fixtures/upgrade/` is only
   * worth anything if the databases in it actually sat at the version they
   * name, and a session that always migrates to head can never leave one
   * there — so the fixture for the version a branch *leaves behind* is dumped
   * from a session whose replica chain stops one step short. The seam already
   * exists one level down (`MigrateOptions.migrations`, which every migration
   * test uses); this is the same seam, reachable from the one place that
   * needs a whole session rather than a bare migrator.
   */
  migrations?: {
    readonly replica?: readonly Migration[];
    readonly outbox?: readonly Migration[];
  };
  diagnostics?: LedgerDiagnostics;
  /**
   * What a pre-journal store — a file above version 0 with no
   * `__ledger_migrations`, one no chain can account for — means for this
   * session. No default: the decision belongs to the platform seam that
   * knows whether an installed device could hold a ledger worth keeping,
   * never to a schema version, so every caller states it in the open.
   *
   * `"rebuild"` — the pair is deleted and `start` retries from nothing
   * (`removeStorePair`); the app's own choice while no current install
   * predates the journal. `"refuse"` — the pair is left untouched and the
   * migrator's error propagates, wrapped with the recovery this mode is
   * honest about: a person deleting the files by hand.
   */
  preJournalStores: "rebuild" | "refuse";
};

type SessionLedger<TRun> = Ledger<TRun, typeof ledgerSchema>;

/**
 * Both files, gone — `reset`'s own delete loop, and now also what a
 * pre-journal rebuild runs before it retries `start`. `architecture/14`
 * §14.6: the replica and the outbox are only consistent as a pair, so
 * whichever store a refusal named, both are deleted together.
 */
function removeStorePair<TRun>(
  options: Pick<LocalLedgerSessionOptions<TRun>, "paths" | "fs" | "removeDatabase">,
): void {
  for (const path of [options.paths.replica, options.paths.outbox]) {
    options.removeDatabase(path);
    for (const suffix of ["-wal", "-shm", ".pre-migration"]) {
      const sibling = `${path}${suffix}`;
      if (options.fs.exists(sibling)) options.fs.remove(sibling);
    }
  }
}

/**
 * `start`'s two results, kept together rather than the recovery discarded.
 *
 * **R4 L2.** `recoverOnLaunch`'s return value used to be called and thrown
 * away right here — `halted` (a replay stall) and the deferred count S30
 * needs were computed and immediately lost. Carried out as a pair instead,
 * so `createLocalLedgerSession` can keep the recovery on the session for a
 * screen to read later; no screen reads it yet.
 */
type StartResult<TRun> = {
  readonly ledger: SessionLedger<TRun>;
  readonly recovery: LaunchRecovery;
};

/**
 * `rebuilt` distinguishes the retry after a rebuild from the original call —
 * without it, a second `PreJournalStoreError` (the rebuilt pair is itself
 * pre-journal, which should never happen but must not hang the app) would
 * rebuild forever instead of surfacing as a failure.
 */
function start<TRun>(
  options: LocalLedgerSessionOptions<TRun>,
  state: { rebuilt: boolean } = { rebuilt: false },
): StartResult<TRun> {
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
    const outboxMigration = migrateOutbox(ledger.outbox, {
      fs: options.fs,
      ...(options.migrations?.outbox ? { migrations: options.migrations.outbox } : {}),
    });
    stage = "migrate_replica";
    const replicaMigration = migrateReplica(ledger.replica, {
      fs: options.fs,
      ...(options.migrations?.replica ? { migrations: options.migrations.replica } : {}),
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
    const recovery = recoverOnLaunch(ledger, ledgerRegistry);

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
    return { ledger, recovery };
  } catch (error) {
    if (
      isPreJournalStoreError(error) &&
      (stage === "migrate_outbox" || stage === "migrate_replica")
    ) {
      if (options.preJournalStores === "rebuild" && !state.rebuilt) {
        ledger.close();
        emitLedgerDiagnostic(diagnostics, {
          scope: "ledger_startup",
          phase: "rebuild",
          stage,
          store: error.store,
          error: describeLedgerError(error),
        });
        removeStorePair(options);
        return start(options, { rebuilt: true });
      }

      // Either mode ends here with a plain `Error`, never `PreJournalStoreError`
      // itself: `state.rebuilt` means the rebuilt pair is *itself* pre-journal,
      // which should never happen but must surface rather than loop, and
      // `"refuse"` never rebuilds at all. The migrator's own message states
      // only the fact (M-2) — the recovery each mode gives is this session's
      // to add, not the migrator's.
      ledger.close();
      const wrapped =
        options.preJournalStores === "rebuild"
          ? new Error(`the pre-journal rebuild did not take: ${error.message}`, { cause: error })
          : new Error(
              `${error.message} The recovery in this mode is to close the app, delete ${error.path}, ${error.path}-wal and ${error.path}-shm, and the same three files for the other store beside it — the replica and the outbox are only consistent as a pair — then start the app again.`,
              { cause: error },
            );
      emitLedgerDiagnostic(diagnostics, {
        scope: "ledger_startup",
        phase: "failure",
        stage,
        error: describeLedgerError(wrapped),
      });
      throw wrapped;
    }
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
  let { ledger, recovery: lastRecovery } = start(options);
  let closed = false;

  const requireOpen = () => {
    if (closed) throw new Error("the local ledger session is closed");
    return ledger;
  };

  return {
    listAccounts: (listOptions) => readAccounts(requireOpen().replica.db, listOptions),
    listCurrencies: () => readCurrencies(requireOpen().replica.db),
    listCurrencySettings: (settingsOptions) =>
      readCurrencySettings(requireOpen().replica.db, settingsOptions),
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
    listPayeeHistory: () => readPayeeHistory(requireOpen().replica.db),
    listCounterpartyBalances: (today) => readCounterpartyBalances(requireOpen().replica.db, today),
    listFullCategoryTree: () => readCategoryTree(requireOpen().replica.db),
    listCategoryUsage: () => readCategoryUsage(requireOpen().replica.db),
    readCategoryReferenceCounts: (categoryId) =>
      readCategoryReferenceCounts(requireOpen().replica.db, categoryId),
    listCounterpartyMerges: (counterpartyId) =>
      readCounterpartyMerges(requireOpen().replica.db, counterpartyId),
    listDistinctCounterpartyPairs: () => readDistinctCounterpartyPairs(requireOpen().replica.db),
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
    renameCategory: (input, capture) =>
      writeLocally(requireOpen(), {
        executor: renameCategoryExecutor,
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
    reparentCategory: (input, capture) =>
      writeLocally(requireOpen(), {
        executor: reparentCategoryExecutor,
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
    convertLeafGroup: (input, capture) =>
      writeLocally(requireOpen(), {
        executor: convertLeafGroupExecutor,
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
    readCrossRate: (pair) => readCrossRate(requireOpen().replica.db, pair) ?? null,
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
    updateCurrency: (input, capture) =>
      writeLocally(requireOpen(), {
        executor: updateCurrencyExecutor,
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
    mergeCategories: (input, capture) =>
      writeLocally(requireOpen(), {
        executor: mergeCategoriesExecutor,
        registry: ledgerRegistry,
        input,
        capture,
        ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
      }).row,
    archiveCategory: (input, capture) =>
      writeLocally(requireOpen(), {
        executor: archiveCategoryExecutor,
        registry: ledgerRegistry,
        input,
        capture,
        ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
      }).row,
    lastRecovery: () => lastRecovery,
    reset: () => {
      const current = requireOpen();
      closed = true;
      current.close();

      removeStorePair(options);

      ({ ledger, recovery: lastRecovery } = start(options));
      closed = false;
    },
    close: () => {
      if (closed) return;
      ledger.close();
      closed = true;
    },
  };
}
