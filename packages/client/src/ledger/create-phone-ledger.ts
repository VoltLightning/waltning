import { fold } from "@waltning/core/capture/names";
import type { PayeeHistoryRow } from "@waltning/core/capture/payee-memory";
import { jaccard, trigrams } from "@waltning/core/capture/trigrams";
import { type AccountingDate, accountingDate, isAccountingDate } from "@waltning/core/date";
import type { DiagnosticError } from "@waltning/core/diagnostics";
import { id as brandId, type Id, type IdTable, id } from "@waltning/core/id";
import type { CurrencyCode, Money, UnitsPerPivot } from "@waltning/core/money";
import * as money from "@waltning/core/money";
import {
  type AccountKind,
  type AddCurrencyInput,
  type ArchiveAccountInput,
  type ArchiveCategoryInput,
  type ArchiveCurrencyInput,
  addCurrencyInput,
  archiveAccountInput,
  archiveCategoryInput,
  archiveCurrencyInput,
  type CategorizeBatchInput,
  type ChangePivotInput,
  type ClearManualRateInput,
  type ConvertLeafGroupInput,
  type CounterpartyKind,
  type CreateAccountInput,
  type CreateCategoryInput,
  type CreateCounterpartyInput,
  type CreateGroupInput,
  type CreateTransactionInput,
  categorizeBatchInput,
  changePivotInput,
  clearManualRateInput,
  convertLeafGroupInput,
  createAccountInput,
  createCategoryInput,
  createCounterpartyInput,
  createGroupInput,
  createTransactionInput,
  type DeleteTransactionInput,
  deleteTransactionInput,
  type MergeCategoriesInput,
  type MergeCounterpartiesInput,
  mergeCategoriesInput,
  mergeCounterpartiesInput,
  type ReconcileAccountInput,
  type RecordDistinctCounterpartiesInput,
  type RenameCategoryInput,
  type ReparentCategoryInput,
  reconcileAccountInput,
  recordDistinctCounterpartiesInput,
  renameCategoryInput,
  reparentCategoryInput,
  type SetManualRateInput,
  type SetPinnedInput,
  type SetRateSourceInput,
  type SetTransactionLinesInput,
  type SettleDebtInput,
  setManualRateInput,
  setPinnedInput,
  setRateSourceInput,
  setTransactionLinesInput,
  settleDebtInput,
  type UnmergeCounterpartiesInput,
  type UpdateAccountInput,
  type UpdateCounterpartyInput,
  type UpdateCurrencyInput,
  type UpdateTransactionInput,
  unmergeCounterpartiesInput,
  updateAccountInput,
  updateCounterpartyInput,
  updateCurrencyInput,
  updateTransactionInput,
} from "@waltning/core/registry/inputs";
import { zMoney } from "@waltning/core/zod";
import {
  type ClientDiagnosticEvent,
  type ClientDiagnostics,
  clientFailure,
  emitClientDiagnostic,
} from "../diagnostics.ts";
import { type FieldError, fieldErrorsFromZod } from "../transport/field-errors.ts";

// ── end E2 block ─────────────────────────────────────────────────────────

/**
 * `Omit` over a union collapses to the union's *common* keys — `keyof (A|B)`
 * is an intersection, not a union — which would erase `action` and `update`
 * down to nothing both branches share. Distributing over `T` first keeps each
 * branch's own extra key.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/**
 * L1 — phase derived from the outcome, once, rather than asserted by hand at
 * every call site. 43 of the 75 `phase: "success"` emits this file used to
 * carry sat immediately before a `return { fieldErrors }` — a refusal
 * reported as a success, because the two were typed independently and
 * nothing forced them to agree. Every controller below returns through this
 * instead: `outcome` is `undefined` for a controller with no return value at
 * all (`refresh()`, `reset()`), and otherwise the phase is "success" unless
 * `outcome` itself carries a `fieldErrors` key — a refusal is never a
 * success, no matter how deep in a controller it was produced.
 *
 * `tests/architecture.test.ts` refuses a bare `phase: "success"` literal
 * anywhere else in this file, so a new call site cannot reintroduce the bug
 * this replaced.
 */
function finish<T>(
  diagnostics: ClientDiagnostics | undefined,
  event: DistributiveOmit<Extract<ClientDiagnosticEvent, { phase: "start" }>, "phase">,
  outcome: T,
): T {
  const errors = fieldErrorsOf(outcome);
  emitClientDiagnostic(
    diagnostics,
    (errors
      ? { ...event, phase: "failure", error: fieldErrorsDiagnostic(errors) }
      : { ...event, phase: "success" }) as ClientDiagnosticEvent,
  );
  return outcome;
}

/** `outcome`'s own `fieldErrors`, when it has any — every controller's refusal shape. */
function fieldErrorsOf(outcome: unknown): readonly FieldError[] | undefined {
  if (typeof outcome !== "object" || outcome === null || !("fieldErrors" in outcome)) {
    return undefined;
  }
  const errors = (outcome as { fieldErrors: unknown }).fieldErrors;
  return Array.isArray(errors) ? (errors as readonly FieldError[]) : undefined;
}

/** A refusal's own fields, described the way a caught exception already is. */
function fieldErrorsDiagnostic(errors: readonly FieldError[]): DiagnosticError {
  return {
    name: "FieldErrors",
    message: errors.map((error) => error.message).join("; ") || "validation failed",
  };
}

export type PhoneCapture = {
  date: AccountingDate;
  timeZone: string;
  offsetMinutes: number;
  at: Date;
};

export type PhoneAccount = {
  id: Id<"accounts">;
  name: string;
  kind: AccountKind;
  currency: CurrencyCode;
  decimals: number;
  balance: Money;
  groupId: Id<"accountGroups"> | null;
  ownership: CreateAccountInput["ownership"];
  isBusiness: boolean;
  archived: boolean;
  /** The last balance a reconciliation recorded (S16 §5) — `null` before the first one. */
  expectedBalance: Money | null;
  /** `AccountEditor`'s own fields — shown and, `version` apart, edited. */
  openingBalance: Money;
  openingDate: AccountingDate | null;
  memo: string;
  /** `update_account`'s and `archive_account`'s compare-and-swap token (`architecture/14` §14.2). */
  version: number;
};

/**
 * An account, plus whether an expense can be captured against it.
 *
 * The join is here rather than on the screen because it is a rule, not a
 * rendering: `createExpense` refuses the same accounts this marks, and a screen
 * that worked the pairing out itself could disagree with the controller that
 * enforces it.
 */
export type PhoneCapturableAccount = PhoneAccount & {
  capturable: boolean;
};

/**
 * A currency the replica holds, for a picker to offer.
 *
 * Structural rather than imported from `@waltning/ledger`: the port is what
 * keeps this package free of the storage engine behind it, and a type import
 * would be the first thread of the dependency it exists to avoid.
 */
export type PhoneCurrency = {
  code: CurrencyCode;
  name: string;
  symbol: string;
  decimals: number;
  /**
   * Whether a capture in this currency can be valued without a rate being
   * asserted. `false` for any non-pivot currency the replica has no rate for —
   * the ordinary state of a phone that has never synced (§14.6).
   */
  capturable: boolean;
  /**
   * §7.0 — the one currency `fx_rates` is quoted against. Stands in for the
   * *display currency* until the header toggle §7.0 names exists: S12/S13's
   * `net in {display}` (`SPEC.md` §6.6) resolves against whichever currency
   * this marks, matching `computations.md` §4.6's own fallback ("when
   * display equals pivot, that join is skipped").
   */
  isPivot: boolean;
};

/**
 * S17's whole row — `readCurrencySettings`'s answer, structural like
 * `PhoneCurrency` above for the same reason (no `@waltning/ledger` import).
 * `PhoneCurrency` answers *can a capture be valued in this*; this answers
 * *what does the settings screen show and write* — the two never converge
 * because a picker has no use for `version`, `pinned` or `rateSource`, and a
 * settings row has no use for `capturable`.
 */
export type PhoneCurrencySettings = {
  code: CurrencyCode;
  name: string;
  symbol: string;
  symbolPosition: string;
  decimals: number;
  rateSource: string | null;
  pinned: boolean;
  isPivot: boolean;
  version: number;
};

/**
 * A group the replica holds, for the create-account form's group picker.
 *
 * Structural rather than imported from `@waltning/ledger`, matching
 * `PhoneCurrency` above — the port is what keeps this package free of the
 * storage engine behind it.
 */
export type PhoneGroup = {
  id: Id<"accountGroups">;
  name: string;
  institution: string | null;
  sort: number;
};

export type PhoneRecentTransaction = {
  id: Id<"transactions">;
  date: AccountingDate;
  payee: string;
  categoryName: string | null;
  accountName: string;
  amount: Money;
  currency: CurrencyCode;
  decimals: number;
  isBusiness: boolean;
};

/**
 * The ledger's own vocabulary — `@waltning/schema`'s `TxnType`, restated
 * rather than imported: `packages/client` depends on `@waltning/core` alone
 * (`architecture/11`), matching `TransactionRow`'s own `TransactionType` in
 * `packages/ui`.
 */
export type TransactionType = "expense" | "income" | "transfer" | "adjustment";

/**
 * A leaf category the quick-add form can offer.
 *
 * Structural, like `PhoneCurrency` above — `kind` names the two draft types a
 * category can attach to (`transactions_category_shape`) without importing
 * the schema package's own enum.
 */
export type PhoneCategory = {
  id: Id<"categories">;
  name: string;
  kind: "income" | "expense";
};

/**
 * One node of the whole category tree — groups and leaves both — for S06's
 * sheet, which browses and filters by group rather than only offering the
 * flat leaf list `PhoneCategory` above carries.
 *
 * Structural, matching `PhoneCategory`: the port is what keeps this package
 * free of the storage engine behind it. **`parentId: null` names a root** —
 * ordinarily a group (`isLeaf: false`), except `Uncategorized`, the one leaf
 * `TAXONOMY.md` seeds at the root (R1/R2: a category is a group or a leaf,
 * two levels, never deeper).
 */
export type PhoneCategoryNode = {
  id: Id<"categories">;
  parentId: Id<"categories"> | null;
  name: string;
  kind: "income" | "expense";
  isLeaf: boolean;
  sort: number;
};

/**
 * A counterparty the quick-add form can attach a role to (§6.6), and S12,
 * S13 and S15's whole subject now that `#e2` gives the table a write path.
 * `PhoneCategoryNode`, plus what a picker never needs and S19's editor
 * always does — `archived` and the compare-and-swap `version` every
 * structural write below takes. `listCategoryTree`/`PhoneCategoryNode`
 * above stay archived-excluded and version-free, matching their one
 * consumer today (S06's picker, where an archived category must never
 * appear — `TAXONOMY.md` R2); this is the *other* read, for the one screen
 * where "offerable" is not the question.
 */
export type PhoneFullCategoryNode = {
  id: Id<"categories">;
  parentId: Id<"categories"> | null;
  name: string;
  kind: "income" | "expense";
  isLeaf: boolean;
  archived: boolean;
  sort: number;
  depth: number;
  version: number;
  /** The seed's own tag (`seed:uncategorized`, say) — see `LocalCategory`. */
  externalId: string | null;
};

/**
 * A near-duplicate pair — S19's collision finder (§9.2: *"trigram
 * similarity, ranked"*). Leaf-versus-leaf only: `merge_categories` refuses a
 * group on either side, so every candidate here is one the screen can
 * actually act on by opening the merge sheet.
 */
export type PhoneCategoryCollision = {
  a: { id: Id<"categories">; name: string; usageCount: number };
  b: { id: Id<"categories">; name: string; usageCount: number };
  score: number;
};

/**
 * S19's merge preview, exact — see `readCategoryReferenceCounts`. Read on
 * demand, matching `readPeriodSpend`'s own precedent below: this is a query
 * against one category, not a value every subscriber needs recomputed on
 * every write.
 */
export type PhoneCategoryReferenceCounts = {
  transactions: number;
  lines: number;
  rules: number;
};

/**
 * A counterparty the quick-add form can attach a role to (§6.6).
 *
 * `#e3` has not shipped a write path yet, so this list is ordinarily empty —
 * the form offers the field only when it is not (S05 §5).
 */
export type PhoneCounterparty = {
  id: Id<"counterparties">;
  name: string;
  kind: CounterpartyKind;
  settlementCurrency: CurrencyCode | null;
  /** S15's editor — the two free-text fields `create_counterparty`/`update_counterparty` also carry. */
  contact: string | null;
  note: string;
  archived: boolean;
  /** `update_counterparty`'s optimistic-concurrency check (`counterparties.staleVersion`). */
  version: number;
};

/** What settling with someone actually did — H9, never supplied, only returned. */
export type PhoneSettleDebtResult = {
  residual: Money;
  overSettled: boolean;
};

/**
 * S13's overflow — one merge into a counterparty, still live. Structural,
 * like `PhoneCounterparty` above: this package stays free of
 * `@waltning/ledger`.
 */
export type PhoneCounterpartyMerge = {
  mergeId: Id<"counterpartyMerges">;
  /** The absorbed counterparty's own name — archived, not deleted (S15 §9.2). */
  loserName: string;
  mergedAt: Date;
  /** How many transactions this merge repointed. */
  movedCount: number;
};

/**
 * §7, one row per counterparty per currency — S12's list. Structural, like
 * `PhoneCounterparty` above: `kind` and `bucket` are restated rather than
 * imported so this package stays free of `@waltning/schema` and
 * `@waltning/ledger` alike.
 */
export type PhoneCounterpartyBalance = {
  counterpartyId: Id<"counterparties">;
  name: string;
  kind: "person" | "company";
  settlementCurrency: CurrencyCode | null;
  currency: CurrencyCode;
  decimals: number;
  balance: Money;
  /** Companies only (O15) — `null` for a person, and for a company with nothing open. */
  ageDays: number | null;
  bucket: money.AgeBucket | null;
};

/** S10 §3 — the four values `SegmentControl` offers, exactly `SPEC.md` §6.7's partition. */
export type PhoneTransactionScope = "all" | "mine" | "shared" | "business";

/**
 * `searchTransactions`'s port-level filter — branded ids and a real
 * `AccountingDate`, mirroring `@waltning/ledger`'s `TransactionSearchFilter`
 * structurally (`architecture/11`: no value import across that seam). The
 * controller's own `TransactionFilterDraft`, below, is the plain-string shape
 * a screen builds; `searchTransactions` casts one into the other, the same
 * split `QuickAddDraft` → `CreateTransactionInput` already draws.
 */
export type PhoneSearchFilter = {
  text?: string;
  accountIds?: readonly Id<"accounts">[];
  categoryIds?: readonly Id<"categories">[];
  scope?: PhoneTransactionScope;
  from?: AccountingDate;
  to?: AccountingDate;
  /** S13's whole history — every row naming this counterparty, any role. */
  counterpartyId?: Id<"counterparties">;
  /** S13 §3's default toggle — `debt` only until "· N other rows" is opened. */
  counterpartyRole?: "debt" | "contribution" | "reference";
};

export type PhoneSearchCursor = { date: AccountingDate; id: Id<"transactions"> };

/** One row of a search page — every field S10's mobile row (or `TransferRow`) needs. */
export type PhoneSearchTransaction = {
  id: Id<"transactions">;
  date: AccountingDate;
  type: "income" | "expense" | "transfer" | "adjustment";
  payee: string;
  note: string;
  categoryName: string | null;
  accountId: Id<"accounts">;
  accountName: string;
  /** Present only on a transfer. */
  toAccountId: Id<"accounts"> | null;
  toAccountName: string | null;
  /** Already signed, the "from" leg. */
  amount: Money;
  currency: CurrencyCode;
  decimals: number;
  /** Already signed, the "to" leg. `null` off a transfer. */
  toAmount: Money | null;
  toCurrency: CurrencyCode | null;
  toDecimals: number | null;
  isBusiness: boolean;
  isCapital: boolean;
  /** `null` off any row with no counterparty at all — the ordinary case. */
  counterpartyRole: "debt" | "contribution" | "reference" | null;
};

export type PhoneCurrencyTotal = {
  currency: CurrencyCode;
  decimals: number;
  /** Every live row in range, this currency — both legs of a transfer counted separately. */
  sum: Money;
  /** The same sum with every `isCapital` row's leg left out — S10 §9. */
  sumExcludingCapital: Money;
  /** How many legs of `sum` were capital — 0 means the second total is not worth drawing. */
  capitalCount: number;
};

export type PhoneSearchPage = {
  rows: readonly PhoneSearchTransaction[];
  nextCursor: PhoneSearchCursor | undefined;
  /** Over the whole filtered set, every page — never a per-page figure (S10 §3). */
  total: { count: number; currencies: readonly PhoneCurrencyTotal[] };
};

/** One line of S09's optional breakdown (§10.3) — a receipt-free split too. */
export type PhoneTransactionLine = {
  id: Id<"transactionLines">;
  description: string;
  amount: Money;
  categoryId: Id<"categories"> | null;
  categoryName: string | null;
};

/**
 * S09's whole subject — the row, its account and category names, and its
 * `lines`. Structural, matching `PhoneRecentTransaction` above: the port is
 * what keeps this package free of the storage engine behind it, so this
 * mirrors `@waltning/ledger`'s `LocalTransactionDetail` field-for-field
 * rather than importing it.
 *
 * **`FxAmount`'s full basis, the receipt and the audit history are not
 * here.** `wave-3-shared.md` names all three unbuilt this wave — no rate
 * table (`#e3`), no receipts, no audit log on the phone — and `is_capital`
 * and the counterparty row are deferred too: `FieldsCard` does not offer
 * either yet (`#e3` has no counterparty write path, and `is_capital` has no
 * screen driving it this wave), so carrying them here would be a field with
 * nothing that reads it.
 */
export type PhoneTransactionDetail = {
  id: Id<"transactions">;
  date: AccountingDate;
  type: TransactionType;
  payee: string;
  note: string;
  isBusiness: boolean;
  accountId: Id<"accounts">;
  accountName: string;
  categoryId: Id<"categories"> | null;
  categoryName: string | null;
  /** Already signed, the `"from"` leg — same rule as `PhoneRecentTransaction`. */
  amount: Money;
  currency: CurrencyCode;
  decimals: number;
  version: number;
  lines: readonly PhoneTransactionLine[];
};

/**
 * §4's rate for one pair, as of a date — `readRate`'s answer, structural for
 * the same reason `PhoneCurrency` is (no `@waltning/ledger` import).
 */
export type PhoneRate = {
  rate: UnitsPerPivot;
  source: string;
  /** The rate row's own date — the day it was actually published or set. */
  asOf: AccountingDate;
  /** `date − asOf`. `0` means the rate is exact for the day asked about. */
  carriedDays: number;
};

/**
 * E5 — a reference rate between two arbitrary currencies, as of a date —
 * `readCrossRate`'s answer. The pivot (§7.0) never reaches this type: `rate`
 * is already triangulated, pivot-per-unit for this specific pair, the same
 * direction `TransferAmount`'s own `referenceRate` prop and `margin`'s
 * `fxRate`/`toFxRate` take.
 *
 * H2 — `legs`, not a flattened `source`/`asOf`/`carriedDays`: those three
 * used to be assembled from whichever leg was "worse" and whichever was
 * "manual" — not always the same row — inside `readCrossRate` itself. Each
 * leg's own provenance travels here whole; `crossRateProvenance`
 * (`ledger/cross-rate-provenance.ts`) is where a screen turns the two into
 * one honest display fact.
 */
export type PhoneCrossRate = {
  rate: money.PivotPerUnit;
  legs: { from: PhoneRate; to: PhoneRate };
};

/** S17 §8's coverage figure, per currency — `readCoverage`'s answer. */
export type PhoneCoverage = {
  code: CurrencyCode;
  source: string | null;
  firstDate: AccountingDate;
  /** The last *real* quote's date — `null` when every held row is `carried_forward` (H2). */
  lastDate: AccountingDate | null;
  days: number;
  /** Real (non-`carried_forward`) rows held (M3) — `CoverageTag`'s decision variable for *complete*, with `calendarDays`, never `days`. */
  realDays: number;
  /** Calendar days from `firstDate` to today, inclusive (H3). */
  calendarDays: number;
  coveragePct: number;
  /** L7 — rows held past today, excluded from every figure above (M4). */
  futureRows: number;
};

/** One row of S18's rate table — `listFxRates`'s answer. */
export type PhoneFxRateRow = {
  base: CurrencyCode;
  quote: CurrencyCode;
  date: AccountingDate;
  rate: UnitsPerPivot;
  source: string;
  /**
   * Only present on a `carried_forward` row — `RateTable`'s own age marker.
   * `null` (C2) means the origin is unlocatable; never `0`.
   */
  carriedDays?: number | null;
};

export type PhoneLedgerPort = {
  /** `includeArchived` — default `false`. S16's register loads them lazily, behind its own toggle. */
  listAccounts: (options?: { includeArchived?: boolean }) => readonly PhoneAccount[];
  listCurrencies: () => readonly PhoneCurrency[];
  /** S17, on demand — not carried in the snapshot, matching `readCoverage`/`listFxRates` below. */
  listCurrencySettings: (options?: {
    includeArchived?: boolean;
  }) => readonly PhoneCurrencySettings[];
  listGroups: () => readonly PhoneGroup[];
  listRecent: (limit: number) => readonly PhoneRecentTransaction[];
  listCategories: () => readonly PhoneCategory[];
  listCategoryTree: () => readonly PhoneCategoryNode[];
  /** `includeArchived` — default `false`, same toggle as `listAccounts`. */
  listCounterparties: (options?: { includeArchived?: boolean }) => readonly PhoneCounterparty[];
  /** D2's reader, on demand — D4b's proposal recomputes it only when the typed payee changes. */
  listPayeeHistory: () => readonly PhonePayeeHistoryRow[];
  /** §7 — S12's list. `today` is the caller's own accounting date, the same one `capture()` computes. */
  listCounterpartyBalances: (today: AccountingDate) => readonly PhoneCounterpartyBalance[];
  /** The whole tree, archived rows included — S19's editor. See `PhoneFullCategoryNode`. */
  listFullCategoryTree: () => readonly PhoneFullCategoryNode[];
  /** How many live rows touch each category — see `readCategoryUsage`. */
  listCategoryUsage: () => ReadonlyMap<Id<"categories">, number>;
  /** The merge preview's exact pre-write counts — see `readCategoryReferenceCounts`. */
  readCategoryReferenceCounts: (categoryId: Id<"categories">) => PhoneCategoryReferenceCounts;
  /** S13's overflow, on demand — merges into one counterparty, still live. */
  listCounterpartyMerges: (
    counterpartyId: Id<"counterparties">,
  ) => readonly PhoneCounterpartyMerge[];
  /** S15 §9.1's own table — read whole, on every refresh (it is small). */
  listDistinctCounterpartyPairs: () => readonly (readonly [
    Id<"counterparties">,
    Id<"counterparties">,
  ])[];
  listNetWorth: () => readonly PhoneNetWorth[];
  readPeriodSpend: (period: money.Period) => readonly PhonePeriodSpend[];
  listUnsettledClearing: () => readonly PhoneClearingAccount[];
  /** §2 as of a chosen date — `ReconcileSheet`'s live "Computed" figure, S16 §5. */
  balanceAsOf: (accountId: Id<"accounts">, asOf: AccountingDate) => Money;
  /** C4 — S10's list. A query, not a snapshot field. */
  searchTransactions: (filter: PhoneSearchFilter, cursor?: PhoneSearchCursor) => PhoneSearchPage;
  createAccount: (input: CreateAccountInput, capture: PhoneCapture) => void;
  createTransaction: (input: CreateTransactionInput, capture: PhoneCapture) => void;
  createCategory: (input: CreateCategoryInput, capture: PhoneCapture) => void;
  /** C4 — S10's swipe-categorize. One category over N ids, refused as a whole or not at all. */
  categorizeBatch: (input: CategorizeBatchInput, capture: PhoneCapture) => void;
  getTransaction: (id: Id<"transactions">) => PhoneTransactionDetail | null;
  updateTransaction: (input: UpdateTransactionInput, capture: PhoneCapture) => void;
  deleteTransaction: (input: DeleteTransactionInput, capture: PhoneCapture) => void;
  setTransactionLines: (input: SetTransactionLinesInput, capture: PhoneCapture) => void;
  updateAccount: (input: UpdateAccountInput, capture: PhoneCapture) => void;
  archiveAccount: (input: ArchiveAccountInput, capture: PhoneCapture) => void;
  reconcileAccount: (input: ReconcileAccountInput, capture: PhoneCapture) => void;
  createGroup: (input: CreateGroupInput, capture: PhoneCapture) => void;
  /* ── E3 · FX ──────────────────────────────────────────────────────────── */
  /** §7.7, as of a date — `undefined` past the ten-day carry cap, or with no rate held. */
  readRate: (pair: {
    base: CurrencyCode;
    quote: CurrencyCode;
    date: AccountingDate;
  }) => PhoneRate | null;
  /** E5 — S14 and S31's own reference line, triangulated through the invisible pivot (§7.0). */
  readCrossRate: (pair: {
    from: CurrencyCode;
    to: CurrencyCode;
    date: AccountingDate;
  }) => PhoneCrossRate | null;
  /** S17 §8, on demand — not carried in the snapshot; a settings screen asks for it. */
  readCoverage: (today: AccountingDate) => readonly PhoneCoverage[];
  /** S18's table, on demand, one pair at a time. */
  listFxRates: (range: {
    base: CurrencyCode;
    quote: CurrencyCode;
    from: AccountingDate;
    to: AccountingDate;
  }) => readonly PhoneFxRateRow[];
  addCurrency: (input: AddCurrencyInput, capture: PhoneCapture) => void;
  archiveCurrency: (input: ArchiveCurrencyInput, capture: PhoneCapture) => void;
  setRateSource: (input: SetRateSourceInput, capture: PhoneCapture) => void;
  setPinned: (input: SetPinnedInput, capture: PhoneCapture) => void;
  /** §7.0 — refused by the executor while any transaction exists (S29a). */
  changePivot: (input: ChangePivotInput, capture: PhoneCapture) => void;
  setManualRate: (
    input: SetManualRateInput,
    capture: PhoneCapture,
  ) => { written: number; replacedManual: number };
  clearManualRate: (input: ClearManualRateInput, capture: PhoneCapture) => { deleted: number };
  /** S17 §9.2 — cosmetic patch only: symbol, symbol position, decimals. */
  updateCurrency: (input: UpdateCurrencyInput, capture: PhoneCapture) => void;
  /* ── end E3 block ─────────────────────────────────────────────────────── */
  // ── E2 · counterparties and settlement ────────────────────────────────────
  createCounterparty: (input: CreateCounterpartyInput, capture: PhoneCapture) => void;
  updateCounterparty: (input: UpdateCounterpartyInput, capture: PhoneCapture) => void;
  mergeCounterparties: (input: MergeCounterpartiesInput, capture: PhoneCapture) => void;
  unmergeCounterparties: (input: UnmergeCounterpartiesInput, capture: PhoneCapture) => void;
  recordDistinctCounterparties: (
    input: RecordDistinctCounterpartiesInput,
    capture: PhoneCapture,
  ) => void;
  /**
   * The one port write with a real return value — `residual`/`overSettled`
   * are H9's whole point, computed server-side (or, with none yet, by the
   * executor) from live data, and never derivable from the input alone the
   * way every other write's `{ id }` success is.
   */
  settleDebt: (input: SettleDebtInput, capture: PhoneCapture) => PhoneSettleDebtResult;
  // ── end E2 block ─────────────────────────────────────────────────────────
  renameCategory: (input: RenameCategoryInput, capture: PhoneCapture) => void;
  reparentCategory: (input: ReparentCategoryInput, capture: PhoneCapture) => void;
  convertLeafGroup: (input: ConvertLeafGroupInput, capture: PhoneCapture) => void;
  mergeCategories: (input: MergeCategoriesInput, capture: PhoneCapture) => void;
  archiveCategory: (input: ArchiveCategoryInput, capture: PhoneCapture) => void;
  reset: () => void;
};

export type PhoneLedgerRuntime = {
  capture: () => PhoneCapture;
  id: <Table extends IdTable>() => Id<Table>;
  diagnostics?: ClientDiagnostics;
};

/**
 * One currency's balance across every account held in it.
 *
 * **Not a total, and there is no total.** Adding a złoty balance to a dollar one
 * needs a rate, and until `#e3` there is no rate table for that number to be
 * wrong against — inventing one here is H21 with nothing to check it. The
 * screen shows a subtotal per currency, each at its own scale, and the reader
 * does the only comparison anyone can honestly do.
 */
export type PhoneCurrencySubtotal = {
  currency: CurrencyCode;
  decimals: number;
  balance: Money;
};

/**
 * §3, per currency — C2's `DualTotal` hero. See `money.netWorth`.
 *
 * `hasShared` decides whether the screen hands `DualTotal` `ours` at all —
 * that component's own contract wants `null`, not the same figure as `mine`,
 * when no shared account exists (`LocalNetWorth`'s own comment says why it is
 * a field rather than a `mine === ours` comparison).
 */
export type PhoneNetWorth = {
  currency: CurrencyCode;
  decimals: number;
  mine: Money;
  ours: Money;
  hasShared: boolean;
};

/** §5's base figure, per currency — C2's *spent* and *net* `StatTile`s. See `money.periodSpend`. */
export type PhonePeriodSpend = money.PeriodSpendRow;

/**
 * §8's unsettled clearing accounts, FIFO attribution included — C2's
 * unsettled banner names a transaction when one is present (S04 §3). See
 * `money.unsettledClearing` and `readUnsettledClearing`'s own `fifoOldestOpen` call.
 */
export type PhoneClearingAccount = money.ClearingAccountRow & {
  oldestUnconsumedTransactionId: Id<"transactions"> | null;
  oldestDate: AccountingDate | null;
  oldestUnconsumedPayee: string | null;
};

/** S12's two direction totals, per currency. See `money.directionTotals`. */
export type PhoneDirectionTotal = money.DirectionTotalRow;

/** D2's history, read on demand for D4b's proposal — see `proposeCategory`. */
export type PhonePayeeHistoryRow = PayeeHistoryRow;

export type PhoneLedgerSnapshot = {
  /**
   * How many times `refresh()` has completed, success or failure — `0` until
   * the very first one has (H1). A screen that derives state from another
   * field of this snapshot (`currencies`, say, to find the pivot) cannot
   * tell "the replica genuinely holds nothing" from "no `refresh()` has run
   * yet" by looking at that field alone; `revision > 0` is that distinction,
   * named once here rather than re-derived per screen. It also doubles as
   * `useMemo`'s own invalidation key for a read outside the snapshot itself
   * (`searchTransactions`, on demand) — a write bumps it exactly when a
   * memoised read has gone stale (M2).
   */
  revision: number;
  accounts: readonly PhoneCapturableAccount[];
  /**
   * Empty until `loadArchived()` runs — S16's register loads them lazily,
   * behind its own toggle, rather than on every refresh nobody asked for.
   */
  archivedAccounts: readonly PhoneAccount[];
  currencies: readonly PhoneCurrency[];
  groups: readonly PhoneGroup[];
  recent: readonly PhoneRecentTransaction[];
  categories: readonly PhoneCategory[];
  categoryTree: readonly PhoneCategoryNode[];
  /** The whole tree, archived rows included — S19's editor. */
  fullCategoryTree: readonly PhoneFullCategoryNode[];
  categoryUsage: ReadonlyMap<Id<"categories">, number>;
  categoryCollisions: readonly PhoneCategoryCollision[];
  counterparties: readonly PhoneCounterparty[];
  /**
   * Empty until `loadArchivedCounterparties()` runs — the same lazy toggle
   * `archivedAccounts` / `loadArchived()` gives S16's register.
   */
  archivedCounterparties: readonly PhoneCounterparty[];
  /**
   * Ordered by the account list, so the currency of your first account leads.
   *
   * Deliberately **not** ordered by size. `12400` is a bigger number than `840`
   * and that says nothing about which holding is larger; ranking currencies by
   * their raw figures is a comparison the app cannot make, printed as though it
   * had.
   */
  subtotals: readonly PhoneCurrencySubtotal[];
  /** §3, mine and ours, per currency — `DualTotal`'s hero (C2). */
  netWorth: readonly PhoneNetWorth[];
  /** §8's unsettled clearing accounts — non-empty only when the banner shows (C2). */
  unsettledClearing: readonly PhoneClearingAccount[];
  /**
   * S15 §9.1 — every pair `record_distinct_counterparties` has recorded,
   * read whole on every `refresh()` (a small table). `nearMatches`' own
   * `distinctPairs` option, so a pair told apart once is never asked about
   * again, across sessions.
   */
  distinctCounterpartyPairs: readonly (readonly [Id<"counterparties">, Id<"counterparties">])[];
  /**
   * Set from a failed `refresh()`, cleared by the next successful one.
   *
   * **The rest of the snapshot is left as it was**, not blanked — `refresh()`
   * spreads the prior snapshot and adds this field, so the hero keeps its last
   * known figure while the ground panel shows `ErrorState(recoverable)`
   * (S04 §6). Never rendered verbatim: `describeDiagnosticError`'s message is
   * evidence for diagnostics, not catalogue text (`architecture/11`), so a
   * screen reacts to this field's presence and speaks through `en.ts`.
   */
  error?: string;
};

/**
 * Every field the quick-add screen — or S31's `TransferComposer` — can save,
 * plain-string ids and all.
 *
 * **The user-owned subset of `CreateTransactionInput`.** Everything else on
 * that schema is resolved by the server (`fxRate`, `source`, …). Ids stay
 * `string` rather than `Id<Table>` on purpose: this is the shape a form
 * hands back, and `createTransactionInput.parse` inside the controller is
 * where the brand and the format are actually checked — a screen that
 * pre-branded them would be asserting a claim it cannot verify.
 *
 * **E5 widens `type` to `"transfer"` and adds the destination leg.** S31 is
 * the one caller that ever sets `toAccountId`/`toAmount`/`toCurrency`/`fee` —
 * every other caller leaves them `undefined`, which is what keeps `type:
 * "transfer"` without them a Zod refusal rather than a silent half-row
 * (`transactions_transfer_shape`, mirrored by `transactionShapeIssues`).
 * `toFxRate` is never among them: §7.5 resolves it server-side at commit,
 * and the client never asserts the reference rate as truth (S31 §5).
 */
export type QuickAddDraft = {
  type: "expense" | "income" | "transfer";
  amount: string;
  accountId: string;
  categoryId: string | null;
  /** `AccountingDate`'s shape (`YYYY-MM-DD`), defaulted by the form to today. */
  date: string;
  /**
   * D4b's chip. **Optional**, not merely defaulted — `QuickAddForm`'s own
   * draft (`quick-add-form.tsx`, structurally distinct from this type) has no
   * payee field at all, and both it and D4b's composer call this same
   * controller method. `createTransactionInput`'s own `payee` already
   * defaults to `""`, so an absent field here is the same "not yet typed"
   * either path can mean.
   */
  payee?: string;
  note: string;
  isBusiness: boolean;
  counterpartyId: string | null;
  counterpartyRole: "debt" | "contribution" | "reference" | null;
  /** S31's destination leg (§7.5) — present only when `type === "transfer"`. */
  toAccountId?: string;
  toAmount?: string;
  toCurrency?: string;
  /** The bank's stated fee, distinct from the rate margin (S31 §9.1). */
  fee?: string;
};

/**
 * The full user-owned subset of `CreateAccountInput` — everything the form
 * asks for, and nothing the operation derives (`id`) or the migration alone
 * sets (`externalId`).
 *
 * Structural rather than imported from `@waltning/ui`, matching `PhoneCurrency`
 * and `PhoneGroup` above: `packages/client` and `packages/ui` are siblings on
 * the floor (`architecture/11-client-architecture.md`), and a value import
 * across that seam would be the first thread of a dependency neither package
 * is supposed to have on the other. `CreateAccountForm`'s own
 * `CreateAccountDraft` is the same shape by construction.
 */
export type CreateAccountDraft = {
  name: string;
  currency: CurrencyCode;
  kind: AccountKind;
  ownership: CreateAccountInput["ownership"];
  isBusiness: boolean;
  openingBalance: string;
  openingDate: string | null;
  memo: string;
  groupId: string | null;
};

/**
 * What S06's create-in-place row can save — a leaf, always (`create_category`
 * never sets `isLeaf: false`, see the executor). `parentId` names the group
 * it was created under, or `null` for the one root exception (`Uncategorized`
 * already exists; a person creating a new root-level leaf is the taxonomy
 * drifting, which is why the sheet scopes `+ New` to a chosen group — this
 * type stays permissive so the controller's own refusal, not the type, is
 * where that is decided).
 */
export type CreateCategoryDraft = {
  name: string;
  kind: "income" | "expense";
  parentId: string | null;
};

/**
 * S10's filter bar, plain-string ids and all — matching `QuickAddDraft`'s own
 * reasoning: this is the shape a screen builds from `MultiSelect`/`Chip`
 * values and a `DateField`'s typed text, and `searchTransactions` below is
 * where those get cast into `Id<Table>` and a real `AccountingDate` (or
 * dropped, for a date still mid-edit — see `validAccountingDate`).
 */
export type TransactionFilterDraft = {
  text?: string;
  accountIds?: readonly string[];
  categoryIds?: readonly string[];
  scope?: PhoneTransactionScope;
  from?: string;
  to?: string;
  counterpartyId?: string;
  counterpartyRole?: "debt" | "contribution" | "reference";
};

export type TransactionSearchCursorDraft = { date: string; id: string };

/**
 * What a swipe-categorize gesture saves — `categorize_batch`'s own input,
 * plain strings. No `id` to mint (every named row already exists), so the
 * controller's success shape is `{ count }` — how many rows the batch
 * touched — rather than B1's usual `{ id }`.
 */
export type CategorizeBatchDraft = { transactionIds: readonly string[]; categoryId: string };

/**
 * What `FieldsCard` can save — every key optional, so `updateTransaction`
 * sends only what changed (the executor refuses an empty patch). Matches
 * `update_transaction`'s own patch shape, narrowed to the fields the screen
 * exposes this wave: counterparty and `is_capital` are deferred — see
 * `PhoneTransactionDetail`.
 */
export type TransactionFieldPatch = {
  date?: string;
  accountId?: string;
  categoryId?: string | null;
  payee?: string;
  note?: string;
  isBusiness?: boolean;
};

/**
 * One line `LinesCard` can save. Ids stay plain `string`, like every other
 * draft here — `setTransactionLinesInput.parse` inside the controller is
 * where the brand and the shape are actually checked.
 */
export type TransactionLineDraft = {
  id: string;
  description: string;
  amount: string;
  categoryId?: string | null;
};
/** What S19's rename sheet can save. */
export type RenameCategoryDraft = { id: string; name: string };

/** What S19's move sheet can save — `parentId: null` moves to the root. */
export type MoveCategoryDraft = { id: string; parentId: string | null };

/** What S19's actions sheet can save for *Convert to group/leaf*. */
export type ConvertCategoryDraft = { id: string; to: "leaf" | "group" };

/** What S19's merge sheet can save, once the preview is confirmed. */
export type MergeCategoryDraft = { loserId: string; winnerId: string };

/** What S19's actions sheet can save for *Archive*. */
export type ArchiveCategoryDraft = { id: string };

/**
 * Only the fields `AccountEditor` actually changed — the executor refuses an
 * empty patch (`update-account.executor.ts`), and asking the screen to build
 * this diff itself would be a second place that decides what "changed" means.
 * `currency` is absent on purpose: S16 §7 has no in-place path for it.
 */
export type AccountPatch = Partial<{
  name: string;
  kind: AccountKind;
  groupId: string | null;
  ownership: CreateAccountInput["ownership"];
  memo: string;
  isBusiness: boolean;
  openingBalance: string;
  openingDate: string | null;
}>;

export type UpdateAccountDraft = {
  id: string;
  version: number;
  patch: AccountPatch;
};

export type ArchiveAccountDraft = {
  id: string;
  version: number;
};

/**
 * *"I counted, and it says this"* — S16 §5. `categoryId` is optional: absent,
 * the adjustment reads as uncategorised, same as any other transaction.
 */
export type ReconcileAccountDraft = {
  accountId: string;
  observedBalance: string;
  /** `AccountingDate`'s shape (`YYYY-MM-DD`), defaulted by the sheet to today. */
  asOf: string;
  note: string;
  categoryId: string | null;
};

export type CreateGroupDraft = {
  name: string;
  institution: string | null;
};

/* ── E3 · FX drafts ──────────────────────────────────────────────────────── */

export type AddCurrencyDraft = {
  code: string;
  name: string;
  symbol?: string;
  symbolPosition?: "P" | "S";
  decimals?: number;
  rateSource?: string | null;
  pinned?: boolean;
};

export type ArchiveCurrencyDraft = { code: string; version: number };
export type SetRateSourceDraft = { code: string; version: number; rateSource: string | null };
export type SetPinnedDraft = { code: string; version: number; pinned: boolean };
export type ChangePivotDraft = { code: string };

export type SetManualRateDraft = {
  base: string;
  quote: string;
  from: string;
  to: string;
  rate: string;
  overwriteManual?: boolean;
};

export type ClearManualRateDraft = { base: string; quote: string; from: string; to: string };

/** S17 §9.2's own row — only the cosmetic fields, never `code` or `version`'s siblings. */
export type CurrencyPatch = Partial<{
  symbol: string;
  symbolPosition: "P" | "S";
  decimals: number;
}>;

export type UpdateCurrencyDraft = { code: string; version: number; patch: CurrencyPatch };
/* ── E2 · counterparties and settlement ──────────────────────────────────── */

export type CreateCounterpartyDraft = {
  name: string;
  kind: CounterpartyKind;
  settlementCurrency: string | null;
  contact: string | null;
  note: string;
};

/** Only the fields `CounterpartyEditor` actually changed — the executor refuses an empty patch. */
export type CounterpartyPatch = Partial<{
  name: string;
  kind: CounterpartyKind;
  settlementCurrency: string | null;
  contact: string | null;
  note: string;
  /** No separate `archive_counterparty` exists — S15 §6, archiving is a field on this patch. */
  archived: boolean;
}>;

export type UpdateCounterpartyDraft = {
  id: string;
  version: number;
  patch: CounterpartyPatch;
};

export type MergeCounterpartiesDraft = {
  winnerId: string;
  loserId: string;
};

export type UnmergeCounterpartiesDraft = {
  mergeId: string;
};

export type RecordDistinctCounterpartiesDraft = {
  aId: string;
  bId: string;
};

/** S14 §3 — what the sheet actually asks for. No `residual`, no `rate`: both are derived (H9, §7.5). */
export type SettleDebtDraft = {
  counterpartyId: string;
  accountId: string;
  date: string;
  amount: string;
  currency: string;
  dischargesCurrency: string;
  dischargesAmount: string;
  note: string;
  categoryId: string | null;
};

export type PhoneLedgerController = {
  getSnapshot: () => PhoneLedgerSnapshot;
  subscribe: (listener: () => void) => () => void;
  refresh: () => void;
  /** S09's whole subject, read fresh — not carried in the snapshot. */
  getTransaction: (id: Id<"transactions">) => PhoneTransactionDetail | null;
  createAccount: (
    draft: CreateAccountDraft,
  ) => { id: Id<"accounts"> } | { fieldErrors: readonly FieldError[] };
  createTransaction: (
    draft: QuickAddDraft,
  ) => // #116 review, L2 — `deferred` marks a capture that saved (the outbox
  // entry committed) but could not yet value itself (no FX rate); absent
  // or `false` for an ordinary save. Never a reason to treat this as
  // anything but a success — `quick-add-screen.tsx` dismisses either way.
  { id: Id<"transactions">; deferred?: boolean } | { fieldErrors: readonly FieldError[] };
  createCategory: (
    draft: CreateCategoryDraft,
  ) => { id: Id<"categories"> } | { fieldErrors: readonly FieldError[] };
  renameCategory: (
    draft: RenameCategoryDraft,
  ) => { id: Id<"categories"> } | { fieldErrors: readonly FieldError[] };
  moveCategory: (
    draft: MoveCategoryDraft,
  ) => { id: Id<"categories"> } | { fieldErrors: readonly FieldError[] };
  convertCategory: (
    draft: ConvertCategoryDraft,
  ) => { id: Id<"categories"> } | { fieldErrors: readonly FieldError[] };
  mergeCategories: (
    draft: MergeCategoryDraft,
  ) => { id: Id<"categories"> } | { fieldErrors: readonly FieldError[] };
  archiveCategory: (
    draft: ArchiveCategoryDraft,
  ) => { id: Id<"categories"> } | { fieldErrors: readonly FieldError[] };
  /**
   * §5, on demand — not through the observable snapshot. `period` is the
   * screen's own state (S04 §7: only the lower row is period-scoped), so a
   * period change reads straight through the port rather than widening what
   * `refresh()` recomputes for every subscriber on every write.
   */
  readPeriodSpend: (period: money.Period) => readonly PhonePeriodSpend[];
  /**
   * §7, on demand — S12's list. Same reasoning as `readPeriodSpend` above:
   * `today` is a value the caller already has (the same accounting date
   * `capture()` computes), not state `refresh()` should own or a reason to
   * call the device's clock on every write elsewhere in the app.
   * `money.directionTotals(balances)` folds S12's two direction totals from
   * this call's own result — a pure function, not a second round trip.
   */
  listCounterpartyBalances: (today: AccountingDate) => readonly PhoneCounterpartyBalance[];
  /** S13's overflow, on demand — merges into one counterparty, still live. */
  listCounterpartyMerges: (
    counterpartyId: Id<"counterparties">,
  ) => readonly PhoneCounterpartyMerge[];
  /**
   * S16 §5, on demand — `ReconcileSheet`'s "Computed" figure, refolded every
   * time its own date field moves rather than fixed to the balance the sheet
   * opened with.
   */
  balanceAsOf: (accountId: Id<"accounts">, asOf: AccountingDate) => Money;
  /**
   * D4b's proposal, on demand — the composer calls this only when the typed
   * payee's fold changes, not on every keystroke or every `refresh()`.
   */
  listPayeeHistory: () => readonly PhonePayeeHistoryRow[];
  /**
   * S10, on demand — like `readPeriodSpend` above, a query rather than a
   * snapshot field: a filtered, paged list is asked for, not held for every
   * subscriber to recompute on every write.
   */
  searchTransactions: (
    filter: TransactionFilterDraft,
    cursor?: TransactionSearchCursorDraft,
  ) => PhoneSearchPage;
  categorizeBatch: (
    draft: CategorizeBatchDraft,
  ) => { count: number } | { fieldErrors: readonly FieldError[] };
  updateTransaction: (
    id: Id<"transactions">,
    version: number,
    patch: TransactionFieldPatch,
  ) => { id: Id<"transactions"> } | { fieldErrors: readonly FieldError[] };
  deleteTransaction: (
    id: Id<"transactions">,
    version: number,
  ) => { id: Id<"transactions"> } | { fieldErrors: readonly FieldError[] };
  setTransactionLines: (
    id: Id<"transactions">,
    version: number,
    lines: readonly TransactionLineDraft[],
  ) => { id: Id<"transactions"> } | { fieldErrors: readonly FieldError[] };
  updateAccount: (
    draft: UpdateAccountDraft,
  ) => { id: Id<"accounts"> } | { fieldErrors: readonly FieldError[] };
  archiveAccount: (
    draft: ArchiveAccountDraft,
  ) => { id: Id<"accounts"> } | { fieldErrors: readonly FieldError[] };
  reconcileAccount: (
    draft: ReconcileAccountDraft,
  ) => { id: Id<"transactions"> } | { fieldErrors: readonly FieldError[] };
  createGroup: (
    draft: CreateGroupDraft,
  ) => { id: Id<"accountGroups"> } | { fieldErrors: readonly FieldError[] };
  /** S16's archived toggle — the one query nobody pays for until they ask. */
  loadArchived: () => void;
  /* ── E3 · FX ──────────────────────────────────────────────────────────── */
  readRate: (pair: {
    base: CurrencyCode;
    quote: CurrencyCode;
    date: AccountingDate;
  }) => PhoneRate | null;
  readCrossRate: (pair: {
    from: CurrencyCode;
    to: CurrencyCode;
    date: AccountingDate;
  }) => PhoneCrossRate | null;
  /** S17, on demand — `readCurrencySettings`'s answer. */
  listCurrencySettings: (options?: {
    includeArchived?: boolean;
  }) => readonly PhoneCurrencySettings[];
  readCoverage: (today: AccountingDate) => readonly PhoneCoverage[];
  listFxRates: (range: {
    base: CurrencyCode;
    quote: CurrencyCode;
    from: AccountingDate;
    to: AccountingDate;
  }) => readonly PhoneFxRateRow[];
  addCurrency: (
    draft: AddCurrencyDraft,
  ) => { code: CurrencyCode } | { fieldErrors: readonly FieldError[] };
  archiveCurrency: (
    draft: ArchiveCurrencyDraft,
  ) => { code: CurrencyCode } | { fieldErrors: readonly FieldError[] };
  setRateSource: (
    draft: SetRateSourceDraft,
  ) => { code: CurrencyCode } | { fieldErrors: readonly FieldError[] };
  setPinned: (
    draft: SetPinnedDraft,
  ) => { code: CurrencyCode } | { fieldErrors: readonly FieldError[] };
  changePivot: (
    draft: ChangePivotDraft,
  ) => { code: CurrencyCode } | { fieldErrors: readonly FieldError[] };
  setManualRate: (
    draft: SetManualRateDraft,
  ) => { written: number; replacedManual: number } | { fieldErrors: readonly FieldError[] };
  clearManualRate: (
    draft: ClearManualRateDraft,
  ) => { deleted: number } | { fieldErrors: readonly FieldError[] };
  updateCurrency: (
    draft: UpdateCurrencyDraft,
  ) => { code: CurrencyCode } | { fieldErrors: readonly FieldError[] };
  /* ── end E3 block ─────────────────────────────────────────────────────── */
  // ── E2 · counterparties and settlement ────────────────────────────────────
  createCounterparty: (
    draft: CreateCounterpartyDraft,
  ) => { id: Id<"counterparties"> } | { fieldErrors: readonly FieldError[] };
  updateCounterparty: (
    draft: UpdateCounterpartyDraft,
  ) => { id: Id<"counterparties"> } | { fieldErrors: readonly FieldError[] };
  mergeCounterparties: (
    draft: MergeCounterpartiesDraft,
  ) => { id: Id<"counterpartyMerges"> } | { fieldErrors: readonly FieldError[] };
  unmergeCounterparties: (
    draft: UnmergeCounterpartiesDraft,
  ) => { id: Id<"counterpartyMerges"> } | { fieldErrors: readonly FieldError[] };
  recordDistinctCounterparties: (
    draft: RecordDistinctCounterpartiesDraft,
  ) =>
    | { aId: Id<"counterparties">; bId: Id<"counterparties"> }
    | { fieldErrors: readonly FieldError[] };
  /** The same lazy toggle as `loadArchived()`, for counterparties. */
  loadArchivedCounterparties: () => void;
  settleDebt: (
    draft: SettleDebtDraft,
  ) =>
    | { id: Id<"transactions">; residual: Money; overSettled: boolean }
    | { fieldErrors: readonly FieldError[] };
  // ── end E2 block ─────────────────────────────────────────────────────────
  /** S19's merge sheet, on demand — the same "not through the snapshot" call. */
  readCategoryReferenceCounts: (categoryId: string) => PhoneCategoryReferenceCounts;
  reset: () => void;
};

/**
 * A thrown executor refusal, as a form-level `fieldErrors` entry.
 *
 * `update_transaction`, `delete_transaction` and `set_transaction_lines`
 * have no `fieldErrors` channel of their own — a stale version or a lines
 * sum mismatch (§10.3) is a plain `Error` thrown from inside the write, the
 * same shape `createTransaction` above works around for an uncapturable
 * account. `path: ""` matches no form field on purpose: this screen's own
 * `KNOWN_PATHS` never lists one for "the row moved" or "the lines do not
 * sum", so the message belongs at form level, not pinned to a field that
 * did not cause it. A stale version gets `transactions.changedElsewhere`
 * (the shared plan names it); every other refusal surfaces its own text —
 * inventing a key for a message nobody has read yet would be translating
 * ahead of a decision to keep the wording.
 */
function refusalFromThrow<Caught>(error: Caught): readonly FieldError[] {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("stale version")
    ? [{ path: "", message, messageKey: "transactions.changedElsewhere" }]
    : [{ path: "", message }];
}

/**
 * Balances folded per currency, in the order the accounts arrive.
 *
 * `money.add` rather than `money.sum` over a filtered list: the accumulator is
 * built in one pass, and a currency's first account establishes both its place
 * in the order and its `decimals`.
 */
function subtotalsOf(accounts: readonly PhoneAccount[]): readonly PhoneCurrencySubtotal[] {
  const byCurrency = new Map<CurrencyCode, PhoneCurrencySubtotal>();

  for (const account of accounts) {
    const running = byCurrency.get(account.currency);
    byCurrency.set(
      account.currency,
      running === undefined
        ? { currency: account.currency, decimals: account.decimals, balance: account.balance }
        : { ...running, balance: money.add(running.balance, account.balance) },
    );
  }

  return [...byCurrency.values()];
}

/**
 * `update_account` and `archive_account`'s executor refusals, named onto a
 * field — `architecture/12`'s contract, extended to a throw the executor
 * makes rather than a `ZodError` the schema does. Neither refusal has a field
 * of its own in `AccountEditor` to attach a raw message to (there is no
 * `version` control on screen), so both carry a `messageKey` the screen
 * resolves through `useT()` instead of the executor's own developer-facing
 * text. `null` for anything else — an executor throw this controller does not
 * recognise is a bug to surface loudly, not a refusal to swallow.
 */
function accountWriteRefusal(error: unknown): FieldError | null {
  if (!(error instanceof Error)) return null;
  // `already archived` reaches here only from a race (a second tap before the
  // screen re-rendered without an archived account's *Archive* button) — the
  // account moved under the writer exactly the way a stale version did, so it
  // reads as the same refusal rather than a second message to translate.
  if (error.message.includes("stale version") || error.message.includes("already archived")) {
    return { path: "version", message: error.message, messageKey: "accounts.staleVersion" };
  }
  if (error.message.includes("never business")) {
    return {
      path: "isBusiness",
      message: error.message,
      messageKey: "accounts.sharedNotBusiness",
    };
  }
  return null;
}

/**
 * `create_transaction`'s own §6.7 mirror
 * (`create-transaction.executor.ts`'s `assertBusinessNotShared`) — named onto
 * `isBusiness`, the field `QuickAddComposer`'s scope chip actually renders it
 * under. A different message from `accountWriteRefusal`'s own "never
 * business" (that one is about the *account*, S16's editor; this one is about
 * the *row*, reached only if a caller somehow got past `ScopeSegments` and
 * the screen's own account-switch reset), so it carries its own `messageKey`.
 *
 * **`LocalDeferral` is not a refusal, and never reaches this mapper.** It is
 * caught first, at the call site (#116 review, L2) — see the comment there
 * for why: a *saved* capture routed through `fieldErrors` here used to read
 * as a failed one to both the caller and the screen.
 */
function createTransactionRefusal(error: unknown): FieldError | null {
  if (!(error instanceof Error)) return null;
  if (
    error.message.includes("cannot sit in a shared account") ||
    error.message.includes("cannot move into a shared account")
  ) {
    return {
      path: "isBusiness",
      message: error.message,
      messageKey: "transactions.sharedNeverBusiness",
    };
  }
  const scaleRefusal = amountScaleRefusal(error);
  if (scaleRefusal) return scaleRefusal;
  return null;
}

/**
 * M3 — a server-side WA016 refusal, routed to the field it actually named.
 *
 * `assert_amount_scale` (`0012_transaction_scale_and_category_kind.sql`)
 * raises the same SQLSTATE for `amount_original`, `to_amount` and `fee`
 * alike — the guarantee this controller's own H2 checks (above) already
 * refuse client-side before a write ever leaves the phone. A row reaching
 * Postgres by any other path (a future backend write, a race, a bug in one
 * of those client checks) surfaces here instead, and the message names its
 * own column first (`'amount_original % holds more decimal places …'`),
 * because the SQLSTATE alone cannot tell three columns apart. Reused
 * `transactions.tooManyDecimals` — this is the identical refusal the client
 * checks already carry that key for.
 */
const AMOUNT_SCALE_COLUMN_PATH: Readonly<Record<string, string>> = {
  amount_original: "amountOriginal",
  to_amount: "toAmount",
  fee: "fee",
};

const AMOUNT_SCALE_MESSAGE =
  /^(amount_original|to_amount|fee) \S+ holds more decimal places than (\S+) allows \((\d+)\)/;

function amountScaleRefusal(error: Error): FieldError | null {
  const match = AMOUNT_SCALE_MESSAGE.exec(error.message);
  if (!match) return null;
  const [, column, currency, decimals] = match;
  const path = column === undefined ? undefined : AMOUNT_SCALE_COLUMN_PATH[column];
  if (path === undefined) return null;
  return {
    path,
    message: error.message,
    messageKey: "transactions.tooManyDecimals",
    params: { currency: currency ?? "", decimals: decimals ?? "" },
  };
}

/** `reconcile_account`'s one refusal — S16 §5: a zero difference lands on `observedBalance`. */
function reconcileAccountRefusal(error: unknown): FieldError | null {
  if (!(error instanceof Error)) return null;
  if (error.message.includes("nothing to reconcile")) {
    return {
      path: "observedBalance",
      message: error.message,
      messageKey: "accounts.nothingToReconcile",
    };
  }
  return null;
}

/**
 * The six counterparty and settlement writes' refusal mappers, one contract
 * — the same shape `accountWriteRefusal` above already fixes on: a message
 * this mapper recognises names the field it belongs to and a `messageKey`
 * the screen resolves through `useT()`; a message it does not recognise
 * returns `null`. **Every caller below tries its mapper first and falls back
 * to `refusalFromThrow` on `null`** — never rethrows — so a refusal the
 * mapper has not met yet still reaches the screen as a form-level
 * `fieldErrors` entry instead of an unhandled throw out of the controller.
 */

/** `create_counterparty`'s one refusal — S15 §6: an exact collision lands on `name`. */
function createCounterpartyRefusal(error: unknown): FieldError | null {
  if (!(error instanceof Error)) return null;
  if (error.message.includes("collides with existing counterparty")) {
    return { path: "name", message: error.message, messageKey: "counterparties.nameCollision" };
  }
  return null;
}

/**
 * `update_counterparty`'s refusals — S15 §6: stale version, a renamed
 * folded-name collision (the same check `create_counterparty` runs), and
 * the archive gate.
 */
function counterpartyWriteRefusal(error: unknown): FieldError | null {
  if (!(error instanceof Error)) return null;
  if (error.message.includes("stale version")) {
    return { path: "version", message: error.message, messageKey: "counterparties.staleVersion" };
  }
  if (error.message.includes("collides with existing counterparty")) {
    return { path: "name", message: error.message, messageKey: "counterparties.nameCollision" };
  }
  if (error.message.includes("archiving is for settled relationships")) {
    return {
      path: "archived",
      message: error.message,
      messageKey: "counterparties.openBalance",
    };
  }
  return null;
}

/**
 * `merge_counterparties`'s refusals — S15 §9.1/§9.2: either side missing
 * lands on `counterpartyId`, either side already archived lands on
 * `archived`. A pair recorded distinct (§9.1) names no single field and is
 * left to `refusalFromThrow`'s form-level message.
 */
function mergeCounterpartiesRefusal(error: unknown): FieldError | null {
  if (!(error instanceof Error)) return null;
  if (error.message.includes("no counterparty")) {
    return {
      path: "counterpartyId",
      message: error.message,
      messageKey: "counterparties.mergeNoCounterparty",
    };
  }
  if (error.message.includes("archived")) {
    return {
      path: "archived",
      message: error.message,
      messageKey: "counterparties.mergeArchived",
    };
  }
  return null;
}

/** `unmerge_counterparties`'s refusals — S15 §9.2: both name the merge itself. */
function unmergeCounterpartiesRefusal(error: unknown): FieldError | null {
  if (!(error instanceof Error)) return null;
  if (error.message.includes("no merge") || error.message.includes("already unmerged")) {
    return {
      path: "mergeId",
      message: error.message,
      messageKey: "counterparties.mergeNotFound",
    };
  }
  return null;
}

/**
 * `settle_debt`'s refusals (H9) — a missing counterparty lands on
 * `counterpartyId`; a zero balance in the chosen currency lands on
 * `discharges.currency`, the field that picked a currency with nothing open
 * rather than the amount typed against it.
 *
 * **C1 — never falls through to `refusalFromThrow`'s raw English.** Every
 * other write in this file (`accountWriteRefusal` and friends) is allowed to
 * return `null` for an unrecognised message, because their own screens print
 * `refusalFromThrow`'s `path: ""` text as-is — a developer-facing string, but
 * one nobody has flagged. `settle_debt`'s own screen resolves every
 * `messageKey` through `useT()`, so an unrecognised executor message reaching
 * it unkeyed would be the one place that text leaks to a person. This mapper
 * therefore never returns `null`: an unrecognised message still lands
 * form-level (`path: ""`), carrying the shared `common.couldNotSave` key
 * instead.
 */
function settleDebtRefusal(error: unknown): FieldError {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("no counterparty")) {
    return { path: "counterpartyId", message, messageKey: "settleDebt.noCounterparty" };
  }
  if (message.includes("nothing to settle")) {
    return { path: "discharges.currency", message, messageKey: "settleDebt.nothingToSettle" };
  }
  return { path: "", message, messageKey: "common.couldNotSave" };
}

/**
 * `change_pivot`'s two refusals (C1) — already-the-pivot and the txn-count
 * gate are different situations and get their own text, never one fallback.
 */
function changePivotRefusal(error: unknown): FieldError | null {
  if (!(error instanceof Error)) return null;
  if (error.message.includes("is already the pivot")) {
    return { path: "", message: error.message, messageKey: "fx.pivotAlreadyPivot" };
  }
  if (error.message.includes("refused — a phone alone cannot re-rate")) {
    return { path: "", message: error.message, messageKey: "fx.pivotChangeRefused" };
  }
  return null;
}

/**
 * S19 §9.2's near-duplicate threshold — decided here rather than in the spec,
 * which names the mechanism (*"trigram similarity, ranked"*) but not a
 * number. `0.2` is D2's own threshold for a *loose* proposal (`Ania` should
 * surface `Nina`); a collision finder that flags a merge candidate wants to
 * be considerably more confident before naming two categories as possibly
 * the same thing, so this sits above it — but not so far above it that it
 * misses §9.2's own worked example: `jaccard(trigrams("groceries"),
 * trigrams("grocery"))` is `0.5` under this padding scheme, and a threshold
 * that let the spec's own motivating pair through unflagged would not be
 * doing its job.
 */
const COLLISION_THRESHOLD = 0.4;

/**
 * The ratio alone is not enough. `Taxi`/`Tax` — real, seeded, unrelated
 * leaves — score `0.5` under `COLLISION_THRESHOLD` too: a short name has few
 * trigrams (`Tax` has four), so sharing its first two or three inflates the
 * *ratio* without the pair sharing much of anything structurally. `jaccard`
 * cannot tell "these overlap a lot, proportionally, because they are both
 * three letters" from "these overlap a lot because one is the other plus an
 * `s`" — a **count**, not a ratio, is what separates them: `Taxi`/`Tax` share
 * 3 trigrams; `Groceries`/`Grocery` (§9.2's own example) share 6.
 *
 * A minimum *folded length* was the other option this could have used —
 * `Taxi`/`Tax` are both under 5 characters, so a length floor would exclude
 * them too. Rejected: length is a proxy for "few trigrams", one step removed
 * from the actual mechanism, and a short *pair that genuinely overlaps a lot*
 * (there is no such pair in the seeded taxonomy today, but nothing rules one
 * out) would be excluded by a length floor for no reason connected to why it
 * scored high. Counting the overlap directly stays correct if that ever
 * happens; a length floor would still be guessing.
 */
const MIN_SHARED_TRIGRAMS = 4;

function sharedTrigramCount(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let shared = 0;
  for (const gram of a) {
    if (b.has(gram)) shared++;
  }
  return shared;
}

/**
 * S19's collision finder. **Not scoped to one parent** — §9.2's own example
 * is `Groceries`/`Grocery`, "created months apart... under different
 * groups", which the sibling-uniqueness index cannot catch because it is
 * scoped to one parent (J12 §5). Scoped to **kind** and to **leaves**:
 * `merge_categories` refuses a group on either side, so a candidate outside
 * that scope is one the merge sheet could never act on.
 */
function collisionsOf(
  tree: readonly PhoneFullCategoryNode[],
  usage: ReadonlyMap<Id<"categories">, number>,
): readonly PhoneCategoryCollision[] {
  const leaves = tree.filter((node) => node.isLeaf && !node.archived);
  const grams = leaves.map((leaf) => trigrams(fold(leaf.name)));
  const collisions: PhoneCategoryCollision[] = [];

  for (let i = 0; i < leaves.length; i++) {
    const a = leaves[i];
    const aGrams = grams[i];
    if (!a || !aGrams) continue;
    for (let j = i + 1; j < leaves.length; j++) {
      const b = leaves[j];
      const bGrams = grams[j];
      if (!b || !bGrams || b.kind !== a.kind) continue;
      const score = jaccard(aGrams, bGrams);
      if (score < COLLISION_THRESHOLD) continue;
      if (sharedTrigramCount(aGrams, bGrams) < MIN_SHARED_TRIGRAMS) continue;
      collisions.push({
        a: { id: a.id, name: a.name, usageCount: usage.get(a.id) ?? 0 },
        b: { id: b.id, name: b.name, usageCount: usage.get(b.id) ?? 0 },
        score,
      });
    }
  }

  return collisions.sort((x, y) => y.score - x.score);
}

/** The category a draft names, or `undefined` — every write below refuses on a miss. */
function findCategory(
  tree: readonly PhoneFullCategoryNode[],
  id: string,
): PhoneFullCategoryNode | undefined {
  return tree.find((node) => node.id === id);
}

/**
 * Whether `targetParentId` is `categoryId` itself or one of its descendants —
 * `reparent_category`'s own `wouldCycle`, walked over the snapshot instead of
 * the replica so the refusal lands as a `fieldError` rather than a throw.
 */
function wouldCycle(
  tree: readonly PhoneFullCategoryNode[],
  targetParentId: string,
  categoryId: string,
): boolean {
  let cursor: string | null = targetParentId;
  const seen = new Set<string>();

  while (cursor !== null) {
    if (cursor === categoryId) return true;
    if (seen.has(cursor)) return false;
    seen.add(cursor);
    const node = findCategory(tree, cursor);
    cursor = node?.parentId ?? null;
  }
  return false;
}

export function createPhoneLedger(
  port: PhoneLedgerPort,
  runtime: PhoneLedgerRuntime,
): PhoneLedgerController {
  let snapshot: PhoneLedgerSnapshot = {
    revision: 0,
    accounts: [],
    archivedAccounts: [],
    currencies: [],
    groups: [],
    recent: [],
    categories: [],
    categoryTree: [],
    fullCategoryTree: [],
    categoryUsage: new Map(),
    categoryCollisions: [],
    counterparties: [],
    archivedCounterparties: [],
    subtotals: [],
    netWorth: [],
    unsettledClearing: [],
    distinctCounterpartyPairs: [],
  };
  const listeners = new Set<() => void>();
  const { diagnostics } = runtime;
  // Set once, by `loadArchived()` — S16's toggle. Kept across an ordinary
  // `refresh()` so a write made with the section open does not collapse it;
  // `reset()` below is the one place it goes back to `false`.
  let archivedRequested = false;
  /** The same toggle as `archivedRequested`, for `loadArchivedCounterparties()`. */
  let archivedCounterpartiesRequested = false;

  const refresh = () => {
    emitClientDiagnostic(diagnostics, {
      scope: "client_state",
      update: "phone_ledger_refresh",
      phase: "start",
    });
    try {
      const rows = archivedRequested
        ? port.listAccounts({ includeArchived: true })
        : port.listAccounts();
      const accounts = rows.filter((account) => !account.archived);
      const archivedAccounts = archivedRequested ? rows.filter((account) => account.archived) : [];
      const currencies = port.listCurrencies();
      const capturable = new Set(
        currencies.filter((currency) => currency.capturable).map((currency) => currency.code),
      );
      const counterpartyRows = archivedCounterpartiesRequested
        ? port.listCounterparties({ includeArchived: true })
        : port.listCounterparties();
      const counterparties = counterpartyRows.filter((counterparty) => !counterparty.archived);
      const archivedCounterparties = archivedCounterpartiesRequested
        ? counterpartyRows.filter((counterparty) => counterparty.archived)
        : [];
      const fullCategoryTree = port.listFullCategoryTree();
      const categoryUsage = port.listCategoryUsage();
      snapshot = {
        revision: snapshot.revision + 1,
        accounts: accounts.map((account) => ({
          ...account,
          capturable: capturable.has(account.currency),
        })),
        archivedAccounts,
        currencies,
        groups: port.listGroups(),
        recent: port.listRecent(5),
        categories: port.listCategories(),
        categoryTree: port.listCategoryTree(),
        archivedCounterparties,
        fullCategoryTree,
        categoryUsage,
        categoryCollisions: collisionsOf(fullCategoryTree, categoryUsage),
        counterparties,
        subtotals: subtotalsOf(accounts),
        netWorth: port.listNetWorth(),
        unsettledClearing: port.listUnsettledClearing(),
        distinctCounterpartyPairs: port.listDistinctCounterpartyPairs(),
      };
      for (const listener of listeners) listener();
      finish(diagnostics, { scope: "client_state", update: "phone_ledger_refresh" }, undefined);
    } catch (error) {
      emitClientDiagnostic(diagnostics, {
        scope: "client_state",
        update: "phone_ledger_refresh",
        phase: "failure",
        error: clientFailure(error),
      });
      // S04 §6: the hero keeps its last known figure rather than blanking, so
      // this spreads the prior snapshot instead of replacing it — only
      // `error` and `revision` are new (H1 — a failed attempt still counts as
      // one, or a screen gated on `revision > 0` would wait forever behind an
      // error `refresh()` never recovers from). Listeners still fire: a
      // screen already mounted needs to hear about this exactly as it hears
      // about a success, or `ErrorState` never appears until something
      // unrelated re-renders it.
      snapshot = {
        ...snapshot,
        revision: snapshot.revision + 1,
        error: clientFailure(error).message,
      };
      for (const listener of listeners) listener();
      throw error;
    }
  };

  refresh();

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh,
    readPeriodSpend: (period) => port.readPeriodSpend(period),
    listCounterpartyBalances: (today) => port.listCounterpartyBalances(today),
    listCounterpartyMerges: (counterpartyId) => port.listCounterpartyMerges(counterpartyId),
    balanceAsOf: (accountId, asOf) => port.balanceAsOf(accountId, asOf),
    listPayeeHistory: () => port.listPayeeHistory(),
    searchTransactions: (filter, cursor) =>
      port.searchTransactions(
        {
          ...(filter.text !== undefined ? { text: filter.text } : {}),
          ...(filter.accountIds
            ? { accountIds: filter.accountIds.map((accountId) => id<"accounts">(accountId)) }
            : {}),
          ...(filter.categoryIds
            ? { categoryIds: filter.categoryIds.map((categoryId) => id<"categories">(categoryId)) }
            : {}),
          ...(filter.scope ? { scope: filter.scope } : {}),
          // A `DateField` mid-edit is not yet a real date — dropped from the
          // filter rather than thrown, the same "not yet a value" treatment
          // `isRealCalendarDate` gives an in-progress typed date elsewhere.
          ...(filter.from !== undefined && isAccountingDate(filter.from)
            ? { from: accountingDate(filter.from) }
            : {}),
          ...(filter.to !== undefined && isAccountingDate(filter.to)
            ? { to: accountingDate(filter.to) }
            : {}),
          ...(filter.counterpartyId !== undefined
            ? { counterpartyId: id<"counterparties">(filter.counterpartyId) }
            : {}),
          ...(filter.counterpartyRole ? { counterpartyRole: filter.counterpartyRole } : {}),
        },
        cursor
          ? { date: accountingDate(cursor.date), id: id<"transactions">(cursor.id) }
          : undefined,
      ),
    categorizeBatch: (draft) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "categorize_batch",
        phase: "start",
      });
      try {
        const capture = runtime.capture();
        const parsed = categorizeBatchInput.safeParse({
          transactionIds: draft.transactionIds,
          categoryId: draft.categoryId,
        });
        if (!parsed.success) {
          return finish(
            diagnostics,
            { scope: "client_action", action: "categorize_batch" },
            { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] },
          );
        }
        port.categorizeBatch(parsed.data, capture);
        refresh();
        return finish(
          diagnostics,
          { scope: "client_action", action: "categorize_batch" },
          { count: parsed.data.transactionIds.length },
        );
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "categorize_batch",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    getTransaction: (id) => port.getTransaction(id),
    readCategoryReferenceCounts: (categoryId) =>
      port.readCategoryReferenceCounts(brandId<"categories">(categoryId)),
    createAccount: (draft) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "create_account",
        phase: "start",
      });
      try {
        const capture = runtime.capture();
        /**
         * M1 — `createAccountInput` validates `openingBalance`'s own shape,
         * but has no currency list in view and so cannot know *which*
         * currency's scale applies; the controller does, the same reason
         * `createTransaction`'s own H2 check lives here rather than in the
         * schema. Mirrors `accounts_balance_scale_matches_currency`
         * (`0012_transaction_scale_and_category_kind.sql`) — `opening_balance`
         * is the sharpest of the four columns that trigger covers, since it
         * shifts every balance computed from it, forever.
         */
        const openingCurrency = snapshot.currencies.find(
          (candidate) => candidate.code === draft.currency,
        );
        const parsedOpeningBalance = zMoney.safeParse(draft.openingBalance);
        if (
          openingCurrency !== undefined &&
          parsedOpeningBalance.success &&
          money.dec(parsedOpeningBalance.data).decimalPlaces() > openingCurrency.decimals
        ) {
          return finish(
            diagnostics,
            { scope: "client_action", action: "create_account" },
            {
              fieldErrors: [
                {
                  path: "openingBalance",
                  message: `${openingCurrency.code} holds ${openingCurrency.decimals} decimal places — this amount has more`,
                  messageKey: "transactions.tooManyDecimals",
                  params: {
                    currency: openingCurrency.code,
                    decimals: String(openingCurrency.decimals),
                  },
                },
              ],
            },
          );
        }

        const parsed = createAccountInput.safeParse({
          id: runtime.id<"accounts">(),
          ...draft,
          openingDate: draft.openingDate ?? undefined,
          groupId: draft.groupId ?? undefined,
        });
        if (!parsed.success) {
          return finish(
            diagnostics,
            { scope: "client_action", action: "create_account" },
            { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] },
          );
        }
        port.createAccount(parsed.data, capture);
        refresh();
        return finish(
          diagnostics,
          { scope: "client_action", action: "create_account" },
          { id: parsed.data.id },
        );
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "create_account",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    updateAccount: (draft) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "update_account",
        phase: "start",
      });
      try {
        const capture = runtime.capture();
        /** M1 — the same `openingBalance` mirror `createAccount` carries, above, against the account's own (unpatchable) currency. */
        const account = snapshot.accounts.find((candidate) => candidate.id === draft.id);
        const parsedPatchOpeningBalance =
          draft.patch.openingBalance === undefined
            ? undefined
            : zMoney.safeParse(draft.patch.openingBalance);
        if (
          account !== undefined &&
          parsedPatchOpeningBalance?.success === true &&
          money.dec(parsedPatchOpeningBalance.data).decimalPlaces() > account.decimals
        ) {
          return finish(
            diagnostics,
            { scope: "client_action", action: "update_account" },
            {
              fieldErrors: [
                {
                  path: "openingBalance",
                  message: `${account.currency} holds ${account.decimals} decimal places — this amount has more`,
                  messageKey: "transactions.tooManyDecimals",
                  params: { currency: account.currency, decimals: String(account.decimals) },
                },
              ],
            },
          );
        }

        const parsed = updateAccountInput.safeParse({
          id: draft.id,
          version: draft.version,
          patch: draft.patch,
        });
        if (!parsed.success) {
          return finish(
            diagnostics,
            { scope: "client_action", action: "update_account" },
            { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] },
          );
        }
        try {
          port.updateAccount(parsed.data, capture);
        } catch (refusal) {
          const fieldError = accountWriteRefusal(refusal);
          if (!fieldError) throw refusal;
          return finish(
            diagnostics,
            { scope: "client_action", action: "update_account" },
            { fieldErrors: [fieldError] },
          );
        }
        refresh();
        return finish(
          diagnostics,
          { scope: "client_action", action: "update_account" },
          { id: parsed.data.id },
        );
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "update_account",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    archiveAccount: (draft) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "archive_account",
        phase: "start",
      });
      try {
        const capture = runtime.capture();
        const parsed = archiveAccountInput.safeParse({ id: draft.id, version: draft.version });
        if (!parsed.success) {
          return finish(
            diagnostics,
            { scope: "client_action", action: "archive_account" },
            { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] },
          );
        }
        try {
          port.archiveAccount(parsed.data, capture);
        } catch (refusal) {
          const fieldError = accountWriteRefusal(refusal);
          if (!fieldError) throw refusal;
          return finish(
            diagnostics,
            { scope: "client_action", action: "archive_account" },
            { fieldErrors: [fieldError] },
          );
        }
        refresh();
        return finish(
          diagnostics,
          { scope: "client_action", action: "archive_account" },
          { id: parsed.data.id },
        );
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "archive_account",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    reconcileAccount: (draft) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "reconcile_account",
        phase: "start",
      });
      try {
        const capture = runtime.capture();
        /**
         * M1 — `observedBalance` is what `reconcile_account`'s executor
         * writes onto `accounts.expected_balance` (S16 §5); the same
         * `accounts_balance_scale_matches_currency` trigger `openingBalance`
         * mirrors, above, covers that column too.
         */
        const reconcileAccount = snapshot.accounts.find(
          (candidate) => candidate.id === draft.accountId,
        );
        const parsedObservedBalance = zMoney.safeParse(draft.observedBalance);
        if (
          reconcileAccount !== undefined &&
          parsedObservedBalance.success &&
          money.dec(parsedObservedBalance.data).decimalPlaces() > reconcileAccount.decimals
        ) {
          return finish(
            diagnostics,
            { scope: "client_action", action: "reconcile_account" },
            {
              fieldErrors: [
                {
                  path: "observedBalance",
                  message: `${reconcileAccount.currency} holds ${reconcileAccount.decimals} decimal places — this amount has more`,
                  messageKey: "transactions.tooManyDecimals",
                  params: {
                    currency: reconcileAccount.currency,
                    decimals: String(reconcileAccount.decimals),
                  },
                },
              ],
            },
          );
        }

        const parsed = reconcileAccountInput.safeParse({
          accountId: draft.accountId,
          adjustmentId: runtime.id<"transactions">(),
          observedBalance: draft.observedBalance,
          asOf: draft.asOf,
          note: draft.note,
          categoryId: draft.categoryId ?? undefined,
        });
        if (!parsed.success) {
          return finish(
            diagnostics,
            { scope: "client_action", action: "reconcile_account" },
            { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] },
          );
        }
        try {
          port.reconcileAccount(parsed.data, capture);
        } catch (refusal) {
          const fieldError = reconcileAccountRefusal(refusal);
          if (!fieldError) throw refusal;
          return finish(
            diagnostics,
            { scope: "client_action", action: "reconcile_account" },
            { fieldErrors: [fieldError] },
          );
        }
        refresh();
        return finish(
          diagnostics,
          { scope: "client_action", action: "reconcile_account" },
          { id: parsed.data.adjustmentId },
        );
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "reconcile_account",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    createGroup: (draft) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "create_group",
        phase: "start",
      });
      try {
        const capture = runtime.capture();
        const parsed = createGroupInput.safeParse({
          id: runtime.id<"accountGroups">(),
          name: draft.name,
          institution: draft.institution,
        });
        if (!parsed.success) {
          return finish(
            diagnostics,
            { scope: "client_action", action: "create_group" },
            { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] },
          );
        }
        port.createGroup(parsed.data, capture);
        refresh();
        return finish(
          diagnostics,
          { scope: "client_action", action: "create_group" },
          { id: parsed.data.id },
        );
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "create_group",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    loadArchived: () => {
      archivedRequested = true;
      refresh();
    },
    // ── E2 · counterparties and settlement ──────────────────────────────────
    createCounterparty: (draft) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "create_counterparty",
        phase: "start",
      });
      try {
        const capture = runtime.capture();
        const parsed = createCounterpartyInput.safeParse({
          id: runtime.id<"counterparties">(),
          name: draft.name,
          kind: draft.kind,
          settlementCurrency: draft.settlementCurrency,
          contact: draft.contact,
          note: draft.note,
        });
        if (!parsed.success) {
          return finish(
            diagnostics,
            { scope: "client_action", action: "create_counterparty" },
            { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] },
          );
        }
        try {
          port.createCounterparty(parsed.data, capture);
        } catch (refusal) {
          const fieldError = createCounterpartyRefusal(refusal);
          return finish(
            diagnostics,
            { scope: "client_action", action: "create_counterparty" },
            { fieldErrors: fieldError ? [fieldError] : refusalFromThrow(refusal) },
          );
        }
        refresh();
        return finish(
          diagnostics,
          { scope: "client_action", action: "create_counterparty" },
          { id: parsed.data.id },
        );
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "create_counterparty",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    updateCounterparty: (draft) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "update_counterparty",
        phase: "start",
      });
      try {
        const capture = runtime.capture();
        const parsed = updateCounterpartyInput.safeParse({
          id: draft.id,
          version: draft.version,
          patch: draft.patch,
        });
        if (!parsed.success) {
          return finish(
            diagnostics,
            { scope: "client_action", action: "update_counterparty" },
            { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] },
          );
        }
        try {
          port.updateCounterparty(parsed.data, capture);
        } catch (refusal) {
          const fieldError = counterpartyWriteRefusal(refusal);
          return finish(
            diagnostics,
            { scope: "client_action", action: "update_counterparty" },
            { fieldErrors: fieldError ? [fieldError] : refusalFromThrow(refusal) },
          );
        }
        refresh();
        return finish(
          diagnostics,
          { scope: "client_action", action: "update_counterparty" },
          { id: parsed.data.id },
        );
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "update_counterparty",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    mergeCounterparties: (draft) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "merge_counterparties",
        phase: "start",
      });
      try {
        const capture = runtime.capture();

        // R2 H5 — computed here, from the replica this controller can see
        // right now, and carried on the payload rather than left for the
        // executor to recompute at apply time (by which point another write
        // may have moved a different set than this one saw). Paged fully:
        // S13's whole history for this counterparty, every role.
        const movedTransactionIds: Id<"transactions">[] = [];
        let cursor: PhoneSearchCursor | undefined;
        for (;;) {
          const page = port.searchTransactions(
            { counterpartyId: id<"counterparties">(draft.loserId) },
            cursor,
          );
          movedTransactionIds.push(...page.rows.map((row) => row.id));
          cursor = page.nextCursor;
          if (!cursor) break;
        }

        const parsed = mergeCounterpartiesInput.safeParse({
          mergeId: runtime.id<"counterpartyMerges">(),
          winnerId: draft.winnerId,
          loserId: draft.loserId,
          movedTransactionIds,
        });
        if (!parsed.success) {
          return finish(
            diagnostics,
            { scope: "client_action", action: "merge_counterparties" },
            { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] },
          );
        }
        try {
          port.mergeCounterparties(parsed.data, capture);
        } catch (writeError) {
          const fieldError = mergeCounterpartiesRefusal(writeError);
          return finish(
            diagnostics,
            { scope: "client_action", action: "merge_counterparties" },
            { fieldErrors: fieldError ? [fieldError] : refusalFromThrow(writeError) },
          );
        }
        refresh();
        return finish(
          diagnostics,
          { scope: "client_action", action: "merge_counterparties" },
          { id: parsed.data.mergeId },
        );
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "merge_counterparties",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    unmergeCounterparties: (draft) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "unmerge_counterparties",
        phase: "start",
      });
      try {
        const capture = runtime.capture();
        const parsed = unmergeCounterpartiesInput.safeParse({ mergeId: draft.mergeId });
        if (!parsed.success) {
          return finish(
            diagnostics,
            { scope: "client_action", action: "unmerge_counterparties" },
            { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] },
          );
        }
        try {
          port.unmergeCounterparties(parsed.data, capture);
        } catch (writeError) {
          const fieldError = unmergeCounterpartiesRefusal(writeError);
          return finish(
            diagnostics,
            { scope: "client_action", action: "unmerge_counterparties" },
            { fieldErrors: fieldError ? [fieldError] : refusalFromThrow(writeError) },
          );
        }
        refresh();
        return finish(
          diagnostics,
          { scope: "client_action", action: "unmerge_counterparties" },
          { id: parsed.data.mergeId },
        );
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "unmerge_counterparties",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    recordDistinctCounterparties: (draft) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "record_distinct_counterparties",
        phase: "start",
      });
      try {
        const capture = runtime.capture();
        const parsed = recordDistinctCounterpartiesInput.safeParse({
          aId: draft.aId,
          bId: draft.bId,
        });
        if (!parsed.success) {
          return finish(
            diagnostics,
            { scope: "client_action", action: "record_distinct_counterparties" },
            { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] },
          );
        }
        try {
          port.recordDistinctCounterparties(parsed.data, capture);
        } catch (writeError) {
          // No mapper of its own: the executor is idempotent (S15 §9.1) and
          // backed only by a primary key, so nothing it throws in ordinary
          // operation names a field a form could point at — every refusal
          // here is already the fallback `refusalFromThrow` gives the other
          // five writes for a message their own mapper does not recognise.
          return finish(
            diagnostics,
            { scope: "client_action", action: "record_distinct_counterparties" },
            { fieldErrors: refusalFromThrow(writeError) },
          );
        }
        refresh();
        return finish(
          diagnostics,
          { scope: "client_action", action: "record_distinct_counterparties" },
          { aId: parsed.data.aId, bId: parsed.data.bId },
        );
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "record_distinct_counterparties",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    loadArchivedCounterparties: () => {
      archivedCounterpartiesRequested = true;
      refresh();
    },
    settleDebt: (draft) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "settle_debt",
        phase: "start",
      });
      try {
        /**
         * **Refused here, so it cannot throw from inside the write.**
         *
         * The same guard `createTransaction` runs above (§14.6): `settle_debt`'s
         * executor derives a pivot valuation the same way `create_transaction`'s
         * does, and refuses mid-write once the outbox entry has already
         * committed. Declining first is the difference between "not yet" and a
         * silent loss. Only checked when the account is known locally — an
         * unrecognised `accountId` is left to the schema/executor exactly as
         * before, this guard adds nothing there.
         */
        const account = snapshot.accounts.find((candidate) => candidate.id === draft.accountId);
        if (account && !account.capturable) {
          emitClientDiagnostic(diagnostics, {
            scope: "client_action",
            action: "settle_debt",
            phase: "failure",
            error: clientFailure(new Error("transactions.needsRate")),
          });
          return {
            fieldErrors: [
              {
                path: "accountId",
                message: `${account.currency} needs an exchange rate before a transaction can be recorded in it`,
                messageKey: "transactions.needsRate",
                params: { currency: account.currency },
              },
            ],
          };
        }

        /**
         * **#116 review, M3 — refused, never silently rewritten (SPEC.md
         * §6.5: a transaction's currency is its account's).** This used to
         * read `const currency = account?.currency ?? draft.currency`,
         * unconditionally: a `draft.currency` that named dollars while the
         * picked account only ever holds złoty was quietly corrected to the
         * account's own currency rather than told to the person who typed
         * it — exactly the silent-until-drain failure `settle-debt.executor.ts`'s
         * own H3 check exists to catch on retry, reached here first instead.
         * Only checked when the account is known locally, the same as the
         * `capturable` guard above.
         */
        if (account && draft.currency !== account.currency) {
          emitClientDiagnostic(diagnostics, {
            scope: "client_action",
            action: "settle_debt",
            phase: "success",
          });
          return {
            fieldErrors: [
              {
                path: "currency",
                message: `This account only holds ${account.currency} — settle in that currency.`,
                messageKey: "settleDebt.currencyMismatch",
                params: { accountCurrency: account.currency },
              },
            ],
          };
        }

        /**
         * M — `settle_debt`'s own `amount` (the "Into"/"From" leg, in the
         * *account's* currency) had no client mirror at all — only
         * `discharges.amount` (below) did. Same guarantee, same shape as
         * `createTransaction`'s own `amountOriginal` guard above: refused
         * here, on the account's own scale, before the write rather than
         * discovered as a silently truncated figure.
         *
         * M4 — `zMoney.safeParse` first, not `money.toMoney` directly:
         * `toMoney` calls `Decimal`'s own constructor, which throws
         * `DecimalError` on a malformed string (`"abc"`) rather than
         * returning one — this controller would throw instead of refusing.
         * A malformed `draft.amount` falls through to `settleDebtInput`'s
         * own parse below, which reports it as an ordinary `fieldErrors`
         * refusal the same way every other malformed field here already
         * does.
         */
        const parsedSettleAmount = zMoney.safeParse(draft.amount);
        if (
          account !== undefined &&
          parsedSettleAmount.success &&
          money.dec(parsedSettleAmount.data).decimalPlaces() > account.decimals
        ) {
          emitClientDiagnostic(diagnostics, {
            scope: "client_action",
            action: "settle_debt",
            phase: "failure",
            error: clientFailure(new Error("transactions.tooManyDecimals")),
          });
          return {
            fieldErrors: [
              {
                path: "amount",
                message: `${account.currency} holds ${account.decimals} decimal places — this amount has more`,
                messageKey: "transactions.tooManyDecimals",
                params: { currency: account.currency, decimals: String(account.decimals) },
              },
            ],
          };
        }

        /**
         * M — the H2 guarantee (`createTransaction`, above) checked
         * `amount_original` only; `settle_debt`'s own `discharges` maps onto
         * `debt_amount`/`debt_currency` (S14's settlement coalesce) and can
         * carry the same defect, in a currency that need not be any
         * account's own — `snapshot.currencies`, not `snapshot.accounts`,
         * is what has its scale. Matches the extended
         * `assert_amount_scale` trigger
         * (`0012_transaction_scale_and_category_kind.sql`).
         */
        const dischargesCurrency = snapshot.currencies.find(
          (candidate) => candidate.code === draft.dischargesCurrency,
        );
        // M4 — same `zMoney.safeParse` guard as `draft.amount` above: a
        // malformed `draft.dischargesAmount` falls through to the schema
        // parse below rather than throwing out of `money.toMoney`.
        const parsedDischargesAmount = zMoney.safeParse(draft.dischargesAmount);
        if (
          dischargesCurrency !== undefined &&
          parsedDischargesAmount.success &&
          money.dec(parsedDischargesAmount.data).decimalPlaces() > dischargesCurrency.decimals
        ) {
          emitClientDiagnostic(diagnostics, {
            scope: "client_action",
            action: "settle_debt",
            phase: "failure",
            error: clientFailure(new Error("transactions.tooManyDecimals")),
          });
          return {
            fieldErrors: [
              {
                // `settleDebtInput`'s own nested path (`discharges.amount`,
                // `discharges: z.object({...})`), matching `settle-sheet.tsx`'s
                // own `byField["discharges.currency"]` read of the schema's
                // own refusal on the sibling field.
                path: "discharges.amount",
                message: `${dischargesCurrency.code} holds ${dischargesCurrency.decimals} decimal places — this amount has more`,
                messageKey: "transactions.tooManyDecimals",
                params: {
                  currency: dischargesCurrency.code,
                  decimals: String(dischargesCurrency.decimals),
                },
              },
            ],
          };
        }

        const capture = runtime.capture();

        // R2 H4 — `type` is read here, from the balance the controller can
        // see right now, and carried on the payload rather than left for the
        // executor to derive at apply time (which may run after other writes
        // have moved the balance the sheet showed).
        //
        // R2 L2 — compared at `balance.decimals`, the same rounding
        // `settle-debt.executor.ts` applies before it reads the live sign.
        // An unrounded compare here could pick a `type` a raw dust balance
        // agrees with but the executor's own rounded read does not — the
        // write would then meet H4's "the balance moved, reload" refusal for
        // a balance that, in every unit either side renders, never moved.
        const balance = port
          .listCounterpartyBalances(capture.date)
          .find(
            (row) =>
              row.counterpartyId === draft.counterpartyId &&
              row.currency === draft.dischargesCurrency,
          );
        const type: "income" | "expense" =
          balance && money.cmp(money.round(balance.balance, balance.decimals), money.ZERO) < 0
            ? "expense"
            : "income";

        // R2 H3 — a mismatch already refused above when the account is
        // known, so this agrees with `draft.currency` whenever it runs;
        // `account?.currency` only still matters for an account this
        // replica does not recognise, left to the schema/executor exactly
        // as the `capturable` guard above already does.
        const currency = account?.currency ?? draft.currency;

        const parsed = settleDebtInput.safeParse({
          id: runtime.id<"transactions">(),
          counterpartyId: draft.counterpartyId,
          accountId: draft.accountId,
          date: draft.date,
          amount: draft.amount,
          currency,
          type,
          discharges: { currency: draft.dischargesCurrency, amount: draft.dischargesAmount },
          note: draft.note,
          categoryId: draft.categoryId ?? undefined,
        });
        if (!parsed.success) {
          emitClientDiagnostic(diagnostics, {
            scope: "client_action",
            action: "settle_debt",
            phase: "failure",
            error: clientFailure(parsed.error),
          });
          return { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] };
        }
        let settled: PhoneSettleDebtResult;
        try {
          settled = port.settleDebt(parsed.data, capture);
        } catch (refusal) {
          emitClientDiagnostic(diagnostics, {
            scope: "client_action",
            action: "settle_debt",
            phase: "failure",
            error: clientFailure(refusal),
          });
          return { fieldErrors: [settleDebtRefusal(refusal)] };
        }
        refresh();
        return finish(
          diagnostics,
          { scope: "client_action", action: "settle_debt" },
          { id: parsed.data.id, residual: settled.residual, overSettled: settled.overSettled },
        );
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "settle_debt",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    // ── end E2 block ─────────────────────────────────────────────────────────
    createTransaction: (draft) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "create_transaction",
        phase: "start",
      });
      try {
        const account = snapshot.accounts.find((candidate) => candidate.id === draft.accountId);
        if (!account) {
          // L — a refusal is not a success (the same fix `tooManyDecimals`
          // below already carries): every early return here bounces the
          // write, and `phase: "success"` misreported every one of them.
          emitClientDiagnostic(diagnostics, {
            scope: "client_action",
            action: "create_transaction",
            phase: "failure",
            error: clientFailure(new Error("accountId required")),
          });
          return {
            fieldErrors: [{ path: "accountId", message: "Choose an account before saving" }],
          };
        }

        /**
         * **Refused here, so it cannot throw from inside the write.**
         *
         * `provisionalFxRate` already refuses this — every row carries a pivot
         * valuation and there is no rate to compute one from — but it refuses
         * mid-transaction, after the outbox entry has been committed, with a
         * message written for a sync log rather than for a person. On a phone
         * with no backend that entry drains nowhere, so the capture becomes an
         * invisible row. Declining first is the difference between "not yet"
         * and a silent loss.
         */
        if (!account.capturable) {
          emitClientDiagnostic(diagnostics, {
            scope: "client_action",
            action: "create_transaction",
            phase: "failure",
            error: clientFailure(new Error("transactions.needsRate")),
          });
          return {
            fieldErrors: [
              {
                path: "accountId",
                message: `${account.currency} needs an exchange rate before a transaction can be recorded in it`,
                messageKey: "transactions.needsRate",
                params: { currency: account.currency },
              },
            ],
          };
        }

        /**
         * M4 — `zMoney.safeParse` first, not `money.toMoney` directly, the
         * same reason `draft.toAmount`/`draft.fee` below are: `toMoney`
         * calls `Decimal`'s own constructor, which throws `DecimalError` on
         * a malformed string (`"abc"`) rather than returning one — this
         * controller would throw instead of refusing. `quick-add-screen.tsx`
         * always hands `draft.amount` through `parseAmount` first, but this
         * is a controller boundary, not a component.
         */
        const parsedAmount = zMoney.safeParse(draft.amount);
        if (!parsedAmount.success) {
          emitClientDiagnostic(diagnostics, {
            scope: "client_action",
            action: "create_transaction",
            phase: "failure",
            error: clientFailure(parsedAmount.error),
          });
          // A field error named onto `amountOriginal` — `fieldErrorsFromZod`
          // would report a bare schema's own empty path, which lands
          // form-level rather than on the field a person is looking at.
          return {
            fieldErrors: [{ path: "amountOriginal", message: "Amount must be a decimal number" }],
          };
        }
        const normalized = parsedAmount.data;
        if (money.dec(normalized).lte(0)) {
          emitClientDiagnostic(diagnostics, {
            scope: "client_action",
            action: "create_transaction",
            phase: "failure",
            error: clientFailure(new Error("amount must be greater than zero")),
          });
          return {
            fieldErrors: [{ path: "amountOriginal", message: "Amount must be greater than zero" }],
          };
        }

        /**
         * H2 — `createTransactionInput` validates the amount's own shape, but
         * has no account in view and so cannot know *which* currency's scale
         * applies; the controller does, the same reason `account.capturable`
         * above is checked here rather than left to the schema. Refused on
         * `amountOriginal` before the write, not discovered as a silently
         * truncated figure the day someone reads the row back.
         */
        if (money.dec(normalized).decimalPlaces() > account.decimals) {
          // L — a refusal is not a success: `phase` used to read "success" on
          // every early return here, which reported a validation bounce the
          // same way a completed write would.
          emitClientDiagnostic(diagnostics, {
            scope: "client_action",
            action: "create_transaction",
            phase: "failure",
            error: clientFailure(new Error("transactions.tooManyDecimals")),
          });
          return {
            fieldErrors: [
              {
                path: "amountOriginal",
                message: `${account.currency} holds ${account.decimals} decimal places — this amount has more`,
                messageKey: "transactions.tooManyDecimals",
                params: { currency: account.currency, decimals: String(account.decimals) },
              },
            ],
          };
        }

        /**
         * M — the H2 guarantee above checked `amountOriginal` only; a
         * transfer's destination leg (§7.5) can carry the same defect in its
         * own currency, and the client-side check must cover the same
         * ground the extended `assert_amount_scale` trigger now does
         * (`0012_transaction_scale_and_category_kind.sql`). Only checked
         * when the destination account is known locally, matching the
         * source account's own guard above.
         *
         * L — `money.toMoney` throws on anything that is not a decimal
         * (`Decimal` does), and `draft.toAmount` is a raw string this
         * controller does not otherwise validate before this point. The
         * screen always hands it through `parseAmount` first, but this is a
         * controller boundary, not a component — `zMoney.safeParse` is that
         * same shape check, run here rather than assumed.
         */
        const parsedToAmount =
          draft.toAmount === undefined ? undefined : zMoney.safeParse(draft.toAmount);
        if (draft.toAmount !== undefined && draft.toAccountId !== undefined) {
          const toAccount = snapshot.accounts.find(
            (candidate) => candidate.id === draft.toAccountId,
          );
          if (
            toAccount !== undefined &&
            parsedToAmount?.success === true &&
            money.dec(parsedToAmount.data).decimalPlaces() > toAccount.decimals
          ) {
            emitClientDiagnostic(diagnostics, {
              scope: "client_action",
              action: "create_transaction",
              phase: "failure",
              error: clientFailure(new Error("transactions.tooManyDecimals")),
            });
            return {
              fieldErrors: [
                {
                  path: "toAmount",
                  message: `${toAccount.currency} holds ${toAccount.decimals} decimal places — this amount has more`,
                  messageKey: "transactions.tooManyDecimals",
                  params: { currency: toAccount.currency, decimals: String(toAccount.decimals) },
                },
              ],
            };
          }
        }

        /**
         * M — `fee` (S31 §9.1) carries no currency of its own; it is always
         * the row's own `currency`, so it is checked against `account`'s
         * own scale (the same account `amountOriginal` above is checked
         * against), matching the extended `assert_amount_scale` trigger
         * (`0012_transaction_scale_and_category_kind.sql`).
         */
        if (draft.fee !== undefined) {
          const parsedFee = zMoney.safeParse(draft.fee);
          if (parsedFee.success && money.dec(parsedFee.data).decimalPlaces() > account.decimals) {
            emitClientDiagnostic(diagnostics, {
              scope: "client_action",
              action: "create_transaction",
              phase: "failure",
              error: clientFailure(new Error("transactions.tooManyDecimals")),
            });
            return {
              fieldErrors: [
                {
                  path: "fee",
                  message: `${account.currency} holds ${account.decimals} decimal places — this amount has more`,
                  messageKey: "transactions.tooManyDecimals",
                  params: { currency: account.currency, decimals: String(account.decimals) },
                },
              ],
            };
          }
        }

        /**
         * H1-b — `createTransactionInput` has no category tree in view and
         * so cannot know a category's own `kind`; the controller does
         * (`snapshot.categories`), the same reason the two checks above live
         * here rather than in the schema. Refused on `categoryId` before the
         * write — the guarantee this mirrors is
         * `transactions_category_kind_matches_type`
         * (`0012_transaction_scale_and_category_kind.sql`), broken once
         * there to prove it fires even if this refusal is ever bypassed.
         */
        if (draft.categoryId !== null && (draft.type === "income" || draft.type === "expense")) {
          const category = snapshot.categories.find(
            (candidate) => candidate.id === draft.categoryId,
          );
          if (category !== undefined && category.kind !== draft.type) {
            emitClientDiagnostic(diagnostics, {
              scope: "client_action",
              action: "create_transaction",
              phase: "failure",
              error: clientFailure(new Error("transactions.categoryKindMismatch")),
            });
            return {
              fieldErrors: [
                {
                  path: "categoryId",
                  message: `This category doesn't match ${draft.type}`,
                  messageKey: "transactions.categoryKindMismatch",
                  params: { type: draft.type },
                },
              ],
            };
          }
        }

        const capture = runtime.capture();
        const parsed = createTransactionInput.safeParse({
          id: runtime.id<"transactions">(),
          // The form's date, not the device's `capture().date` — this is the
          // `capturedTz` card's editable-date half. `capture()` above still
          // runs, because the outbox entry needs its own timestamp and zone
          // regardless of which accounting date the row lands on.
          date: draft.date,
          type: draft.type,
          accountId: draft.accountId,
          amountOriginal: normalized,
          currency: account.currency,
          categoryId: draft.categoryId ?? undefined,
          payee: draft.payee ?? "",
          note: draft.note,
          isBusiness: draft.isBusiness,
          counterpartyId: draft.counterpartyId ?? undefined,
          counterpartyRole: draft.counterpartyRole ?? undefined,
          // S31's destination leg (§7.5) — absent on every other caller, and
          // `createTransactionInput`'s own shape refusal is what catches a
          // `type: "transfer"` missing one of these, not this method.
          ...(draft.toAccountId === undefined ? {} : { toAccountId: draft.toAccountId }),
          // L — `zMoney` (`toAmount`'s own field type) is `z.string()` and
          // does its own parse-and-transform; passing the raw string lets a
          // malformed `toAmount` land as an ordinary `fieldErrors` refusal
          // from `safeParse` below, the same as every other field here, in
          // place of `money.toMoney` throwing before this call is even made.
          ...(draft.toAmount === undefined ? {} : { toAmount: draft.toAmount }),
          ...(draft.toCurrency === undefined ? {} : { toCurrency: draft.toCurrency }),
          // `zMoney` (`fee`'s own field type) is `z.string()` and does its
          // own parse-and-transform, the same reason `toAmount` above is
          // passed raw rather than pre-converted.
          ...(draft.fee === undefined ? {} : { fee: draft.fee }),
        });
        if (!parsed.success) {
          emitClientDiagnostic(diagnostics, {
            scope: "client_action",
            action: "create_transaction",
            phase: "failure",
            error: clientFailure(parsed.error),
          });
          return { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] };
        }
        try {
          port.createTransaction(parsed.data, capture);
        } catch (refusal) {
          /**
           * **#116 review, L2 — a `LocalDeferral` is a saved outcome, not a
           * refusal, and is caught here rather than reaching
           * `createTransactionRefusal` at all.** `write.ts` commits the
           * outbox entry before `apply` ever runs, so a no-rate deferral
           * still means the capture is on the outbox — only not yet valued.
           * Reporting it as `fieldErrors` used to leave the draft on screen
           * with a field marked invalid; the person's only visible move was
           * Save again, which minted a *second*, genuinely new capture on
           * top of the first — `runtime.id()` above runs again on every call,
           * it does not remember the first attempt's id. `deferred: true` on
           * the success shape tells the caller this happened without a
           * second outcome shape to add: `quick-add-screen.tsx` dismisses
           * exactly as it would for an ordinary save and shows
           * `transactions.deferredNoRate` as a toast instead of a field
           * error. Matched on `error.name` rather than `instanceof
           * LocalDeferral`: this file is deliberately structural against
           * `@waltning/ledger` (see `PhoneCurrency`'s own comment above), and
           * `LocalDeferral`'s `name` is fixed by its class field.
           */
          if (refusal instanceof Error && refusal.name === "LocalDeferral") {
            refresh();
            emitClientDiagnostic(diagnostics, {
              scope: "client_action",
              action: "create_transaction",
              phase: "success",
            });
            return { id: parsed.data.id, deferred: true };
          }
          const fieldError = createTransactionRefusal(refusal);
          if (!fieldError) throw refusal;
          emitClientDiagnostic(diagnostics, {
            scope: "client_action",
            action: "create_transaction",
            phase: "failure",
            error: clientFailure(refusal),
          });
          return { fieldErrors: [fieldError] };
        }
        refresh();
        return finish(
          diagnostics,
          { scope: "client_action", action: "create_transaction" },
          { id: parsed.data.id },
        );
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "create_transaction",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    createCategory: (draft) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "create_category",
        phase: "start",
      });
      try {
        /**
         * **Refused here, before the write.** `S06-category-sheet.md` §6: a
         * failed create "lands inline on the field, naming the existing
         * sibling." The executor has no field-scoped refusal channel — it
         * throws a plain `Error`, the same shape `create_transaction`'s own
         * capturable-account check works around — so the collision is caught
         * proactively against the snapshot's own tree, the same pattern the
         * amount and account checks above already use.
         *
         * Folded (`D1`'s `fold`), scoped to the exact parent and kind: a
         * sibling is a name collision *within one group* (`TAXONOMY.md` R3
         * reads "no name appears twice in the tree", but S06 §6 and the
         * executor's own parent checks both operate one level at a time).
         */
        const target = fold(draft.name);
        const collision = snapshot.categoryTree.find(
          (node) =>
            node.parentId === (draft.parentId ?? null) &&
            node.kind === draft.kind &&
            fold(node.name) === target,
        );
        if (collision) {
          return finish(
            diagnostics,
            { scope: "client_action", action: "create_category" },
            {
              fieldErrors: [{ path: "name", message: `"${collision.name}" already exists here` }],
            },
          );
        }

        const capture = runtime.capture();
        const parsed = createCategoryInput.safeParse({
          id: runtime.id<"categories">(),
          name: draft.name,
          kind: draft.kind,
          parentId: draft.parentId,
        });
        if (!parsed.success) {
          return finish(
            diagnostics,
            { scope: "client_action", action: "create_category" },
            { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] },
          );
        }
        port.createCategory(parsed.data, capture);
        refresh();
        return finish(
          diagnostics,
          { scope: "client_action", action: "create_category" },
          { id: parsed.data.id },
        );
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "create_category",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    updateTransaction: (id, version, patch) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "update_transaction",
        phase: "start",
      });
      try {
        const parsed = updateTransactionInput.safeParse({
          id,
          version,
          patch: {
            ...(patch.date !== undefined ? { date: patch.date } : {}),
            ...(patch.accountId !== undefined ? { accountId: patch.accountId } : {}),
            ...("categoryId" in patch ? { categoryId: patch.categoryId } : {}),
            ...(patch.payee !== undefined ? { payee: patch.payee } : {}),
            ...(patch.note !== undefined ? { note: patch.note } : {}),
            ...(patch.isBusiness !== undefined ? { isBusiness: patch.isBusiness } : {}),
          },
        });
        if (!parsed.success) {
          return finish(
            diagnostics,
            { scope: "client_action", action: "update_transaction" },
            { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] },
          );
        }
        try {
          port.updateTransaction(parsed.data, runtime.capture());
        } catch (writeError) {
          // A version the row moved out from under, or a shape refusal — the
          // one refusal channel `update_transaction`'s executor has is a
          // throw. Caught here, not left to propagate: S09 §6 keeps the
          // draft on the screen and states the refusal on the field, which
          // needs a `fieldErrors` return, not an exception.
          return finish(
            diagnostics,
            { scope: "client_action", action: "update_transaction" },
            { fieldErrors: refusalFromThrow(writeError) },
          );
        }
        refresh();
        return finish(
          diagnostics,
          { scope: "client_action", action: "update_transaction" },
          { id: parsed.data.id },
        );
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "update_transaction",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    deleteTransaction: (id, version) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "delete_transaction",
        phase: "start",
      });
      try {
        const parsed = deleteTransactionInput.safeParse({ id, version });
        if (!parsed.success) {
          return finish(
            diagnostics,
            { scope: "client_action", action: "delete_transaction" },
            { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] },
          );
        }
        try {
          port.deleteTransaction(parsed.data, runtime.capture());
        } catch (writeError) {
          return finish(
            diagnostics,
            { scope: "client_action", action: "delete_transaction" },
            { fieldErrors: refusalFromThrow(writeError) },
          );
        }
        refresh();
        return finish(
          diagnostics,
          { scope: "client_action", action: "delete_transaction" },
          { id: parsed.data.id },
        );
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "delete_transaction",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    setTransactionLines: (id, version, lines) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "set_transaction_lines",
        phase: "start",
      });
      try {
        const parsed = setTransactionLinesInput.safeParse({
          transactionId: id,
          version,
          lines: lines.map((line) => ({
            id: line.id,
            description: line.description,
            amount: line.amount,
            ...(line.categoryId ? { categoryId: line.categoryId } : {}),
          })),
        });
        if (!parsed.success) {
          return finish(
            diagnostics,
            { scope: "client_action", action: "set_transaction_lines" },
            { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] },
          );
        }
        /**
         * H3 — `setTransactionLinesInput` validates each line's amount as a
         * decimal string, but has no parent row in view and so cannot know
         * *which* currency's scale applies — the controller does, the same
         * reason `createTransaction`'s own H2 checks live here rather than
         * in the schema. Mirrors `transaction_lines_amount_scale_matches_currency`
         * (`0012_transaction_scale_and_category_kind.sql`), refused on the
         * offending line before the write rather than discovered as a
         * silently truncated figure the day the breakdown is read back.
         */
        const parent = port.getTransaction(id);
        if (parent !== null) {
          const overScale = parsed.data.lines
            .map((line, index) => ({ line, index }))
            .filter(({ line }) => money.dec(line.amount).decimalPlaces() > parent.decimals);
          if (overScale.length > 0) {
            const fieldErrors = overScale.map(({ index }) => ({
              path: `lines.${index}.amount`,
              message: `${parent.currency} holds ${parent.decimals} decimal places — this amount has more`,
              messageKey: "transactions.tooManyDecimals",
              params: { currency: parent.currency, decimals: String(parent.decimals) },
            }));
            return finish(
              diagnostics,
              { scope: "client_action", action: "set_transaction_lines" },
              { fieldErrors },
            );
          }
        }
        try {
          port.setTransactionLines(parsed.data, runtime.capture());
        } catch (writeError) {
          // `set_transaction_lines` throws on a sum mismatch (§10.3) the same
          // way `update_transaction` throws on a stale version — caught here
          // so the refusal lands on the breakdown card rather than a crash.
          return finish(
            diagnostics,
            { scope: "client_action", action: "set_transaction_lines" },
            { fieldErrors: refusalFromThrow(writeError) },
          );
        }
        refresh();
        return finish(
          diagnostics,
          { scope: "client_action", action: "set_transaction_lines" },
          { id: parsed.data.transactionId },
        );
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "set_transaction_lines",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    /* ── E3 · FX ──────────────────────────────────────────────────────────── */
    readRate: (pair) => port.readRate(pair),
    readCrossRate: (pair) => port.readCrossRate(pair),
    listCurrencySettings: (options) => port.listCurrencySettings(options),
    readCoverage: (today) => port.readCoverage(today),
    listFxRates: (range) => port.listFxRates(range),
    addCurrency: (draft) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "add_currency",
        phase: "start",
      });
      try {
        const parsed = addCurrencyInput.safeParse({
          code: draft.code,
          name: draft.name,
          symbol: draft.symbol,
          symbolPosition: draft.symbolPosition,
          decimals: draft.decimals,
          rateSource: draft.rateSource ?? null,
          pinned: draft.pinned,
        });
        if (!parsed.success) {
          return finish(
            diagnostics,
            { scope: "client_action", action: "add_currency" },
            { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] },
          );
        }
        try {
          port.addCurrency(parsed.data, runtime.capture());
        } catch (writeError) {
          return finish(
            diagnostics,
            { scope: "client_action", action: "add_currency" },
            { fieldErrors: refusalFromThrow(writeError) },
          );
        }
        refresh();
        return finish(
          diagnostics,
          { scope: "client_action", action: "add_currency" },
          { code: parsed.data.code },
        );
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "add_currency",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    archiveCurrency: (draft) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "archive_currency",
        phase: "start",
      });
      try {
        const parsed = archiveCurrencyInput.safeParse({ code: draft.code, version: draft.version });
        if (!parsed.success) {
          return finish(
            diagnostics,
            { scope: "client_action", action: "archive_currency" },
            { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] },
          );
        }
        try {
          port.archiveCurrency(parsed.data, runtime.capture());
        } catch (writeError) {
          return finish(
            diagnostics,
            { scope: "client_action", action: "archive_currency" },
            { fieldErrors: refusalFromThrow(writeError) },
          );
        }
        refresh();
        return finish(
          diagnostics,
          { scope: "client_action", action: "archive_currency" },
          { code: parsed.data.code },
        );
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "archive_currency",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    setRateSource: (draft) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "set_rate_source",
        phase: "start",
      });
      try {
        const parsed = setRateSourceInput.safeParse({
          code: draft.code,
          version: draft.version,
          rateSource: draft.rateSource,
        });
        if (!parsed.success) {
          return finish(
            diagnostics,
            { scope: "client_action", action: "set_rate_source" },
            { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] },
          );
        }
        try {
          port.setRateSource(parsed.data, runtime.capture());
        } catch (writeError) {
          return finish(
            diagnostics,
            { scope: "client_action", action: "set_rate_source" },
            { fieldErrors: refusalFromThrow(writeError) },
          );
        }
        refresh();
        return finish(
          diagnostics,
          { scope: "client_action", action: "set_rate_source" },
          { code: parsed.data.code },
        );
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "set_rate_source",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    setPinned: (draft) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "set_pinned",
        phase: "start",
      });
      try {
        const parsed = setPinnedInput.safeParse({
          code: draft.code,
          version: draft.version,
          pinned: draft.pinned,
        });
        if (!parsed.success) {
          return finish(
            diagnostics,
            { scope: "client_action", action: "set_pinned" },
            { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] },
          );
        }
        try {
          port.setPinned(parsed.data, runtime.capture());
        } catch (writeError) {
          return finish(
            diagnostics,
            { scope: "client_action", action: "set_pinned" },
            { fieldErrors: refusalFromThrow(writeError) },
          );
        }
        refresh();
        return finish(
          diagnostics,
          { scope: "client_action", action: "set_pinned" },
          { code: parsed.data.code },
        );
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "set_pinned",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    changePivot: (draft) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "change_pivot",
        phase: "start",
      });
      try {
        const parsed = changePivotInput.safeParse({ code: draft.code });
        if (!parsed.success) {
          return finish(
            diagnostics,
            { scope: "client_action", action: "change_pivot" },
            { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] },
          );
        }
        try {
          port.changePivot(parsed.data, runtime.capture());
        } catch (writeError) {
          const fieldError = changePivotRefusal(writeError);
          return finish(
            diagnostics,
            { scope: "client_action", action: "change_pivot" },
            { fieldErrors: fieldError ? [fieldError] : refusalFromThrow(writeError) },
          );
        }
        refresh();
        return finish(
          diagnostics,
          { scope: "client_action", action: "change_pivot" },
          { code: parsed.data.code },
        );
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "change_pivot",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    setManualRate: (draft) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "set_manual_rate",
        phase: "start",
      });
      try {
        const parsed = setManualRateInput.safeParse({
          base: draft.base,
          quote: draft.quote,
          from: draft.from,
          to: draft.to,
          rate: draft.rate,
          overwriteManual: draft.overwriteManual,
        });
        if (!parsed.success) {
          return finish(
            diagnostics,
            { scope: "client_action", action: "set_manual_rate" },
            { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] },
          );
        }
        let result: { written: number; replacedManual: number };
        try {
          result = port.setManualRate(parsed.data, runtime.capture());
        } catch (writeError) {
          return finish(
            diagnostics,
            { scope: "client_action", action: "set_manual_rate" },
            { fieldErrors: refusalFromThrow(writeError) },
          );
        }
        refresh();
        return finish(diagnostics, { scope: "client_action", action: "set_manual_rate" }, result);
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "set_manual_rate",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    clearManualRate: (draft) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "clear_manual_rate",
        phase: "start",
      });
      try {
        const parsed = clearManualRateInput.safeParse({
          base: draft.base,
          quote: draft.quote,
          from: draft.from,
          to: draft.to,
        });
        if (!parsed.success) {
          return finish(
            diagnostics,
            { scope: "client_action", action: "clear_manual_rate" },
            { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] },
          );
        }
        let result: { deleted: number };
        try {
          result = port.clearManualRate(parsed.data, runtime.capture());
        } catch (writeError) {
          return finish(
            diagnostics,
            { scope: "client_action", action: "clear_manual_rate" },
            { fieldErrors: refusalFromThrow(writeError) },
          );
        }
        refresh();
        return finish(diagnostics, { scope: "client_action", action: "clear_manual_rate" }, result);
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "clear_manual_rate",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    updateCurrency: (draft) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "update_currency",
        phase: "start",
      });
      try {
        const parsed = updateCurrencyInput.safeParse({
          code: draft.code,
          version: draft.version,
          patch: draft.patch,
        });
        if (!parsed.success) {
          return finish(
            diagnostics,
            { scope: "client_action", action: "update_currency" },
            { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] },
          );
        }
        try {
          port.updateCurrency(parsed.data, runtime.capture());
        } catch (writeError) {
          return finish(
            diagnostics,
            { scope: "client_action", action: "update_currency" },
            { fieldErrors: refusalFromThrow(writeError) },
          );
        }
        refresh();
        return finish(
          diagnostics,
          { scope: "client_action", action: "update_currency" },
          { code: parsed.data.code },
        );
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "update_currency",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    /* ── end E3 block ─────────────────────────────────────────────────────── */
    renameCategory: (draft) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "rename_category",
        phase: "start",
      });
      try {
        const current = findCategory(snapshot.fullCategoryTree, draft.id);
        if (!current) {
          return { fieldErrors: [{ path: "id", message: "This category no longer exists" }] };
        }

        /**
         * **Refused here, before the write.** The executor has no
         * field-scoped refusal channel — same pattern `createCategory` uses
         * for the identical sibling-uniqueness index (J12 §5), scoped to
         * parent and kind and excluding the node's own current name.
         */
        const target = fold(draft.name);
        const collision = snapshot.fullCategoryTree.find(
          (node) =>
            node.id !== current.id &&
            node.parentId === current.parentId &&
            node.kind === current.kind &&
            fold(node.name) === target,
        );
        if (collision) {
          return {
            fieldErrors: [{ path: "name", message: `"${collision.name}" already exists here` }],
          };
        }

        const capture = runtime.capture();
        const parsed = renameCategoryInput.safeParse({
          id: draft.id,
          version: current.version,
          name: draft.name,
        });
        if (!parsed.success) {
          return { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] };
        }
        port.renameCategory(parsed.data, capture);
        refresh();
        return finish(
          diagnostics,
          { scope: "client_action", action: "rename_category" },
          { id: parsed.data.id },
        );
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "rename_category",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    moveCategory: (draft) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "reparent_category",
        phase: "start",
      });
      try {
        const current = findCategory(snapshot.fullCategoryTree, draft.id);
        if (!current) {
          return { fieldErrors: [{ path: "id", message: "This category no longer exists" }] };
        }

        // TAXONOMY.md R2 — two levels only. A group may sit at the root and
        // nowhere else; the actions sheet never offers Move for one, but the
        // executor's own guarantee stays mirrored here too.
        if (!current.isLeaf && draft.parentId !== null) {
          return {
            fieldErrors: [
              {
                path: "parentId",
                message: `"${current.name}" is a group — a group may only sit at the root`,
              },
            ],
          };
        }

        if (draft.parentId !== null) {
          const parent = findCategory(snapshot.fullCategoryTree, draft.parentId);
          if (!parent) {
            return { fieldErrors: [{ path: "parentId", message: "Choose a group" }] };
          }
          if (parent.isLeaf) {
            return {
              fieldErrors: [{ path: "parentId", message: `"${parent.name}" is not a group` }],
            };
          }
          if (parent.kind !== current.kind) {
            return {
              fieldErrors: [
                {
                  path: "parentId",
                  message: `"${parent.name}" is a ${parent.kind} group — refused across kinds`,
                },
              ],
            };
          }
          if (wouldCycle(snapshot.fullCategoryTree, draft.parentId, draft.id)) {
            return {
              fieldErrors: [
                {
                  path: "parentId",
                  message: `"${parent.name}" is inside "${current.name}" — that would make the tree a cycle`,
                },
              ],
            };
          }
        }

        const capture = runtime.capture();
        const parsed = reparentCategoryInput.safeParse({
          id: draft.id,
          version: current.version,
          parentId: draft.parentId,
        });
        if (!parsed.success) {
          return { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] };
        }
        port.reparentCategory(parsed.data, capture);
        refresh();
        return finish(
          diagnostics,
          { scope: "client_action", action: "reparent_category" },
          { id: parsed.data.id },
        );
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "reparent_category",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    convertCategory: (draft) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "convert_leaf_group",
        phase: "start",
      });
      try {
        const current = findCategory(snapshot.fullCategoryTree, draft.id);
        if (!current) {
          return { fieldErrors: [{ path: "id", message: "This category no longer exists" }] };
        }

        if (draft.to === "group") {
          /**
           * **The same usage count the `Tag` already shows the person**, not
           * a second, raw reference count — the number this refusal names is
           * the one they have already seen, and the executor stays the final
           * authority if a leftover reference this count does not see (a
           * split transaction's now-unused top-level category, §6) still
           * refuses the write.
           */
          const referenced = snapshot.categoryUsage.get(current.id) ?? 0;
          if (referenced > 0) {
            return {
              fieldErrors: [
                {
                  path: "id",
                  message: `${referenced} transaction(s) use "${current.name}" — recategorise or merge first`,
                },
              ],
            };
          }
        } else {
          const children = snapshot.fullCategoryTree.filter(
            (node) => node.parentId === current.id,
          ).length;
          if (children > 0) {
            return {
              fieldErrors: [
                {
                  path: "id",
                  message: `"${current.name}" has ${children} categor${children === 1 ? "y" : "ies"} inside it`,
                },
              ],
            };
          }
        }

        const capture = runtime.capture();
        const parsed = convertLeafGroupInput.safeParse({
          id: draft.id,
          version: current.version,
          to: draft.to,
        });
        if (!parsed.success) {
          return { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] };
        }
        port.convertLeafGroup(parsed.data, capture);
        refresh();
        return finish(
          diagnostics,
          { scope: "client_action", action: "convert_leaf_group" },
          { id: parsed.data.id },
        );
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "convert_leaf_group",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    mergeCategories: (draft) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "merge_categories",
        phase: "start",
      });
      try {
        const loser = findCategory(snapshot.fullCategoryTree, draft.loserId);
        const winner = findCategory(snapshot.fullCategoryTree, draft.winnerId);
        if (!loser || !winner) {
          return {
            fieldErrors: [{ path: "winnerId", message: "Choose a category to merge into" }],
          };
        }
        if (loser.id === winner.id) {
          return { fieldErrors: [{ path: "winnerId", message: "Choose a different category" }] };
        }
        if (loser.archived) {
          return {
            fieldErrors: [{ path: "loserId", message: `"${loser.name}" is already archived` }],
          };
        }
        if (winner.archived) {
          return {
            fieldErrors: [{ path: "winnerId", message: `"${winner.name}" is archived` }],
          };
        }
        if (!loser.isLeaf || !winner.isLeaf) {
          return {
            fieldErrors: [
              { path: "winnerId", message: "Only leaves hold transactions — refused on a group" },
            ],
          };
        }
        if (loser.kind !== winner.kind) {
          return {
            fieldErrors: [
              {
                path: "winnerId",
                message: `"${winner.name}" is ${winner.kind}, "${loser.name}" is ${loser.kind} — refused across kinds`,
              },
            ],
          };
        }

        const capture = runtime.capture();
        const parsed = mergeCategoriesInput.safeParse({
          loserId: draft.loserId,
          winnerId: draft.winnerId,
        });
        if (!parsed.success) {
          return { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] };
        }
        port.mergeCategories(parsed.data, capture);
        refresh();
        return finish(
          diagnostics,
          { scope: "client_action", action: "merge_categories" },
          { id: parsed.data.winnerId },
        );
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "merge_categories",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    archiveCategory: (draft) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "archive_category",
        phase: "start",
      });
      try {
        const current = findCategory(snapshot.fullCategoryTree, draft.id);
        if (!current) {
          return { fieldErrors: [{ path: "id", message: "This category no longer exists" }] };
        }
        if (current.archived) {
          return {
            fieldErrors: [{ path: "id", message: `"${current.name}" is already archived` }],
          };
        }
        if (!current.isLeaf) {
          const unarchivedChildren = snapshot.fullCategoryTree.filter(
            (node) => node.parentId === current.id && !node.archived,
          ).length;
          if (unarchivedChildren > 0) {
            return {
              fieldErrors: [
                {
                  path: "id",
                  message: `"${current.name}" has ${unarchivedChildren} unarchived categor${unarchivedChildren === 1 ? "y" : "ies"} inside it`,
                },
              ],
            };
          }
        }

        const capture = runtime.capture();
        const parsed = archiveCategoryInput.safeParse({ id: draft.id, version: current.version });
        if (!parsed.success) {
          return { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] };
        }
        port.archiveCategory(parsed.data, capture);
        refresh();
        return finish(
          diagnostics,
          { scope: "client_action", action: "archive_category" },
          { id: parsed.data.id },
        );
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "archive_category",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    reset: () => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "reset_preview",
        phase: "start",
      });
      try {
        port.reset();
        // A wiped ledger has nothing archived to show — both toggles start
        // collapsed again, the same as a fresh launch.
        archivedRequested = false;
        archivedCounterpartiesRequested = false;
        refresh();
        finish(diagnostics, { scope: "client_action", action: "reset_preview" }, undefined);
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "reset_preview",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
  };
}
