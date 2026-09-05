/**
 * S10 · the whole ledger — searchable, filterable, grouped by day, with a
 * running total and a swipe to recategorise. Replaces the stub.
 *
 * **One screen, both surfaces**, per `wave-3-shared.md` §3 — a real second
 * layout, not a style tweak, branched on `useBreakpoint()` at the top of the
 * return rather than in `tabs-shell.tsx`, which swaps the shell's own
 * furniture and never the screen body. Below `desk`, the mobile layout
 * `S10-transactions-list.md` §3 describes; at `desk`, §3's own density-first
 * table — `<LedgerTable>`, a filter rail instead of the chip row, sort by
 * column header, shift-click range select, and `categorize_batch` behind
 * one confirm (§7 web). Both branches share every hook above the return —
 * the filter state, the search page, the category tree — so a write on
 * either surface is the one path `useTransactionSearch`'s own `subscribe`
 * already refreshes.
 *
 * **The phone branch builds day sections and the `FlatList`** — see
 * `group-by-day.ts`'s own doc for why that split is not `TransactionList`'s
 * job. The desk branch hands `<LedgerTable>` its own flat, sorted row list
 * instead — a table has no days to group by.
 */

import type {
  CategorizeBatchDraft,
  PhoneCurrencyTotal,
  PhoneSearchTransaction,
} from "@waltning/client/ledger/create-phone-ledger";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import {
  type FilterExclusionCounts,
  useFilterExclusionCounts,
} from "@waltning/client/ledger/use-filter-exclusion-counts";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import {
  type LedgerFilterState,
  useLedgerFilters,
} from "@waltning/client/ledger/use-ledger-filters";

import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import { useTransactionSearch } from "@waltning/client/ledger/use-transaction-search";
import { groupByDay } from "@waltning/client/transactions/group-by-day";
import { useLedgerTableSelection } from "@waltning/client/transactions/use-ledger-table-selection";
import { useLedgerTableSort } from "@waltning/client/transactions/use-ledger-table-sort";
import {
  accountingDate,
  addDays,
  isAccountingDate,
  shiftMonth,
  type YearMonth,
  yearMonth,
} from "@waltning/core/date";
import * as money from "@waltning/core/money";
import { CategorySheet } from "@waltning/ui/categories/category-sheet";
import { Amount } from "@waltning/ui/fx/amount";
import { decimalMark, monthLabel } from "@waltning/ui/i18n/locales";
import { useLocale, useT } from "@waltning/ui/i18n/provider";
import { Chip } from "@waltning/ui/primitives/chip";
import { DateField } from "@waltning/ui/primitives/date-field";
import { SearchField } from "@waltning/ui/primitives/search-field";
import { type Segment, SegmentControl } from "@waltning/ui/primitives/segment-control";
import { MultiSelect, type SelectOption } from "@waltning/ui/primitives/select";
import { useBreakpoint } from "@waltning/ui/primitives/use-breakpoint";
import { BottomSheet } from "@waltning/ui/shell/bottom-sheet";
import { Card, GroundPanel } from "@waltning/ui/shell/card";
import { Banner } from "@waltning/ui/states/banner";
import { EmptyState } from "@waltning/ui/states/empty-state";
import { ErrorState } from "@waltning/ui/states/error-state";
import { Skeleton } from "@waltning/ui/states/skeleton";
import { text } from "@waltning/ui/theme/fonts";
import { makeStyles } from "@waltning/ui/theme/styles";
import { hairline, radius, space, touchTarget } from "@waltning/ui/tokens";
import {
  CategorizeSelectionConfirm,
  type CategorizeSelectionConfirmState,
} from "@waltning/ui/transactions/categorize-selection-confirm";
import { LedgerFilterRail } from "@waltning/ui/transactions/ledger-filter-rail";
import { LedgerSelectionBar } from "@waltning/ui/transactions/ledger-selection-bar";
import {
  LedgerTable,
  type LedgerTableColumn,
  type LedgerTableRow,
  sortLedgerTableRows,
} from "@waltning/ui/transactions/ledger-table";
import { SwipeableRow } from "@waltning/ui/transactions/swipeable-row";
import { TransactionRow } from "@waltning/ui/transactions/transaction-row";
import { TransferRow } from "@waltning/ui/transactions/transfer-row";
import { type Href, router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, Text, type TextInput, View } from "react-native";

const SKELETON_ROW_KEYS = ["a", "b", "c", "d", "e"] as const;

/**
 * §6.7's four-way partition, named once. Both `SegmentControl` and
 * `<LedgerFilterRail>` are generic over it, so this is the type that travels
 * from the segments through the control and back into `setScope` (L8).
 */
type LedgerFilterScope = LedgerFilterState["scope"];

/**
 * S09's route — C5, running in parallel (`wave-3-shared.md` §3b). This
 * worktree's `app/` has no `transaction/[id].tsx` yet, so expo-router's own
 * generated `Href` union (`.expo/types/router.d.ts`, rebuilt from the actual
 * route files) has no literal for it — `Href` and this object share no
 * member, which is why the cast has to go through `unknown` rather than
 * straight across. Once C5 lands, its route file regenerates that union
 * to include this literal and the `unknown` step stops being necessary,
 * though it stays harmless if it is not removed.
 */
function handlePressRoute(id: string) {
  router.push({ pathname: "/transaction/[id]", params: { id } } as unknown as Href);
}

/**
 * A `PhoneSearchTransaction` reshaped into `<LedgerTable>`'s own row —
 * `packages/ui` may not import `@waltning/client` (the architecture floor:
 * siblings), so this join happens here, the one layer that already depends
 * on both. `scope` reads the *account's* `ownership` — `isBusiness` is a
 * property of the row, not the account, and takes precedence the same way
 * the scope `SegmentControl`'s four values partition (`SPEC.md` §6.7).
 *
 * **The ownership lookup must cover archived accounts** (DESK3 review round
 * 1, H4). Archiving an account does not delete its transactions, and
 * `snapshot.accounts` holds only the live ones — so a row in an archived
 * *shared* account found no account here and fell through a `?.` to
 * "Mine", while the scope *filter* (`search-transactions.ts`'s own SQL join,
 * which never excludes archived) correctly classed the same row `Shared`.
 * Two answers to §6.7's partition on one screen, and the wrong one silently
 * called shared money your own.
 *
 * `snapshot.accountOwnership` is every account, archived included, present
 * from the very first snapshot — round 2's L6, and that field's own doc has
 * why it is a map rather than `loadArchived()` in an effect. A row whose
 * account is **not** in that map — the one case left, and one nothing on
 * this screen can currently produce — has no honest scope to state, so it
 * states none: `—`, never "Mine", which was the specific lie H4 was.
 */
function toDeskRow(
  row: PhoneSearchTransaction,
  accountOwnership: ReadonlyMap<string, string>,
  t: ReturnType<typeof useT>,
): LedgerTableRow {
  const ownership = accountOwnership.get(row.accountId);
  const scope = row.isBusiness
    ? t("shell.scopeBusiness")
    : ownership === undefined
      ? "—"
      : ownership === "shared"
        ? t("shell.scopeShared")
        : t("shell.scopeMine");
  // §6.1 — a transfer stays one row; both accounts read here rather than
  // only the "from" leg, so a re-pair a person would otherwise have to do
  // by eye never comes up.
  const accountLabel =
    row.type === "transfer" && row.toAccountName
      ? `${row.accountName} → ${row.toAccountName}`
      : row.accountName;

  return {
    id: row.id,
    date: row.date,
    payee: row.payee,
    category: row.categoryName ?? "",
    account: accountLabel,
    scope,
    amountValue: row.amount,
    currency: row.currency,
    decimals: row.decimals,
    type: row.type,
    isBusiness: row.isBusiness,
    // §14.4b — the same key the phone row already draws its `BrandIcon`
    // from, resolved offline at write time. Straight through: this screen
    // never matches a payee itself.
    brandKey: row.brandKey,
    // `transactions_category_shape` — only income and expense ever take a category.
    selectable: row.type === "income" || row.type === "expense",
  };
}

/** The desk categorize-selection flow's own state machine — one `useState`, six shapes. */
type DeskCategorizeState =
  | { phase: "picking"; kind: "income" | "expense" }
  | {
      phase: "confirming" | "applying" | "error";
      categoryId: string;
      categoryName: string;
      count: number;
      transactionIds: readonly string[];
      /** Distinct categories the batch is leaving, already display-resolved (M, round 1). */
      fromCategories: readonly string[];
      /** How many of `count` already carry `categoryName` — the confirm says so. */
      alreadyMatching: number;
    }
  | { phase: "approved"; count: number };

/**
 * What kind of category the current selection can take — `null` when nothing
 * is selected, `"mixed"` when it spans both (C2 layer 1, round 1).
 *
 * A batch of income and expense rows has no single valid tree to offer: the
 * screen used to open the *expense* tree for anything that was not
 * entirely income, so one income row picked up among expenses got an expense
 * category written onto it locally, and the outbox carried it to Postgres to
 * be refused by WA017 days later with no field on screen to attach the
 * refusal to. Three layers refuse it now and this is the first: the tree is
 * never offered at all.
 */
type DeskSelectionKind = "income" | "expense" | "mixed" | null;

function deskSelectionKind(rows: readonly PhoneSearchTransaction[]): DeskSelectionKind {
  let kind: DeskSelectionKind = null;
  for (const row of rows) {
    if (row.type !== "income" && row.type !== "expense") continue;
    if (kind === null) kind = row.type;
    else if (kind !== row.type) return "mixed";
  }
  return kind;
}

/**
 * The desk rail's period label, derived from the filter rather than kept
 * beside it (H5, round 1).
 *
 * `periodMonth` used to be its own `useState`, coupled to `from`/`to` only
 * by the stepper's own handler — so the first paint read "September 2026"
 * over a table covering every transaction ever, and "Clear all filters" left
 * the label naming a month it no longer filtered. One state means the label
 * can only ever say what the query is actually doing: a whole calendar month
 * names the month, no range at all says so, and anything else prints its own
 * two ends.
 */
function periodMonthOf(from: string, to: string): YearMonth | null {
  if (!isAccountingDate(from) || !isAccountingDate(to)) return null;
  const month = yearMonth(from.slice(0, 7));
  const bounds = monthRange(month);
  return from === bounds.from && to === bounds.to ? month : null;
}

/**
 * One calendar month as a filter range, inclusive on both ends. The month's
 * last day is "the day before the first of the next month" rather than a
 * table of lengths — `core/date`'s `shiftMonth`/`addDays` are the sanctioned
 * helpers, and they carry the year rollover and February in a leap year.
 * `periodMonthOf` is this function read backwards, which is why they sit
 * together: a range this built must be a range that one recognises.
 */
function monthRange(month: YearMonth): { from: string; to: string } {
  return {
    from: `${month}-01`,
    to: addDays(accountingDate(`${shiftMonth(month, 1)}-01`), -1),
  };
}

function deskCategorizeConfirmState(
  phase: Exclude<DeskCategorizeState["phase"], "picking">,
): CategorizeSelectionConfirmState {
  return phase === "confirming" ? "pending" : phase;
}

export default function Ledger() {
  const t = useT();
  const locale = useLocale();
  const styles = useStyles();
  const breakpoint = useBreakpoint();
  const isDesk = breakpoint === "desk";
  const ledger = useLedgerController();
  const today = deviceRuntime().capture().date;
  const currentMonth = yearMonth(today.slice(0, 7));

  const snapshot = usePhoneLedger(ledger);
  const { account } = useLocalSearchParams<{ account?: string }>();

  /**
   * `useLedgerFilters`'s own initial value is read once, on mount, the same
   * way the `useState` it replaced only ever read `account` once — a param
   * arriving later would not retroactively seed a filter already in use.
   *
   * **The desk branch opens on the current month** (H5/M1). S10 §3 web is a
   * reconciliation surface and "the whole ledger, unbounded" is not a period
   * anyone reconciles — but the month belongs in the *initial state*, not in
   * an effect that applies it after the first query has already gone out
   * unbounded. Seeded here, the very first `searchTransactions` carries the
   * month's two dates, and there is no ref, no second render and no window
   * in which the label and the rows disagree. "Clear all" still clears it:
   * this is a starting point, not a floor. The phone branch is untouched —
   * it opens on everything, as it always has.
   *
   * **It is read at mount and never again, resize included** (L6, round 3).
   * `isDesk` is live — widening a window past `breakpoint.desk` swaps the
   * layout on the very next render — but `initial` here is a `useState`
   * initialiser, so a phone-width mount dragged out to desk width arrives at
   * the table showing every transaction rather than this month, and a
   * desk-width mount narrowed to phone keeps the month it opened with.
   * Both are deliberate: the seed is a *starting point* for a reader who has
   * not touched the rail, and re-applying it on a resize would silently
   * re-narrow a filter that reader had just widened on purpose — the exact
   * shape of H5, arriving through a different door. Neither state is silent
   * either, because the label is derived from the filter (`periodMonthOf`):
   * it reads "All time" or it names the month, and never the other one's
   * story. The ordinary way in is a mount at one width or the other; a drag
   * across the breakpoint mid-session is the case being traded away.
   */
  const filters = useLedgerFilters(
    isDesk
      ? { accountIds: account ? [account] : [], ...monthRange(currentMonth) }
      : { accountIds: account ? [account] : [] },
  );
  const { filter } = filters;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [categorizeSheet, setCategorizeSheet] = useState<{
    transactionId: string;
    kind: "income" | "expense";
  } | null>(null);

  /**
   * The desk table loads the whole filtered period, the phone list pages on
   * scroll (C1, round 1). A table sorts by column header, and a sort over
   * only the first fifty rows reorders those fifty under a header that
   * counts a thousand — the arrow, the order and the count all agreeing on a
   * wrong answer. `use-transaction-search.ts`'s own doc holds the rest,
   * `SEARCH_LOAD_ALL_CAP` included.
   */
  const search = useTransactionSearch(ledger, filters.draft, { loadAll: isDesk });

  const yesterday = addDays(today, -1);
  const sections = useMemo(
    () =>
      groupByDay(search.rows, {
        today,
        yesterday,
        todayLabel: t("shell.today"),
        yesterdayLabel: t("common.yesterday"),
      }),
    [search.rows, today, yesterday, t],
  );
  const entries = useMemo(() => flattenSections(sections), [sections]);

  /* ── Desk (S10 §3 web): the table's own rows, sorted and selectable ──── */
  const deskSort = useLedgerTableSort<LedgerTableColumn>();
  const unsortedDeskRows = useMemo(
    () => search.rows.map((row) => toDeskRow(row, snapshot.accountOwnership, t)),
    [search.rows, snapshot.accountOwnership, t],
  );
  const deskRows = useMemo(
    () => sortLedgerTableRows(unsortedDeskRows, deskSort.sort),
    [unsortedDeskRows, deskSort.sort],
  );
  const deskSelection = useLedgerTableSelection(deskRows);

  const [deskCategorize, setDeskCategorize] = useState<DeskCategorizeState | null>(null);
  // Memoised for real now that `useLedgerTableSelection` hands back one
  // object per state change rather than a fresh literal per render (L7).
  const selectedRows = useMemo(
    () => search.rows.filter((row) => deskSelection.isSelected(row.id)),
    [search.rows, deskSelection],
  );
  const selectionKind = deskSelectionKind(selectedRows);
  const handleOpenCategorizeSelection = useCallback(() => {
    // Nothing opens for a mixed batch — `deskSelectionKind`'s own doc says
    // why, and the banner below the bar says it to the reader.
    if (selectionKind !== "income" && selectionKind !== "expense") return;
    setDeskCategorize({ phase: "picking", kind: selectionKind });
  }, [selectionKind]);
  const handleDismissDeskCategorize = useCallback(() => setDeskCategorize(null), []);
  const handlePickDeskCategory = useCallback(
    (categoryId: string) => {
      const category = snapshot.categories.find((candidate) => candidate.id === categoryId);
      const categoryName = category?.name ?? "";
      // What each selected row is leaving, de-duplicated in encounter order —
      // the confirm's own "from X, Y → Z" line (M, round 1).
      const fromCategories: string[] = [];
      let alreadyMatching = 0;
      for (const row of selectedRows) {
        const current = row.categoryName ?? t("transactions.uncategorised");
        if (row.categoryName === categoryName) {
          // Already the target — counted as unchanged, and *not* listed as
          // a category the batch is leaving (L4). "from Groceries → Groceries"
          // named the destination as an origin and read as a no-op.
          alreadyMatching += 1;
          continue;
        }
        if (!fromCategories.includes(current)) fromCategories.push(current);
      }
      setDeskCategorize({
        phase: "confirming",
        categoryId,
        categoryName,
        count: selectedRows.length,
        transactionIds: selectedRows.map((row) => row.id),
        fromCategories,
        alreadyMatching,
      });
    },
    [selectedRows, snapshot.categories, t],
  );
  const handleDeclineDeskCategorize = useCallback(() => setDeskCategorize(null), []);
  const handleApproveDeskCategorize = useCallback(() => {
    if (deskCategorize?.phase !== "confirming") return;
    // Every field but `phase` carried across, named rather than spread —
    // the three destinations below differ only in which phase they are in.
    const batch = {
      categoryId: deskCategorize.categoryId,
      categoryName: deskCategorize.categoryName,
      count: deskCategorize.count,
      transactionIds: deskCategorize.transactionIds,
      fromCategories: deskCategorize.fromCategories,
      alreadyMatching: deskCategorize.alreadyMatching,
    };
    setDeskCategorize({ phase: "applying", ...batch });
    try {
      const result = ledger.categorizeBatch({
        transactionIds: batch.transactionIds,
        categoryId: batch.categoryId,
      });
      if ("fieldErrors" in result) {
        setDeskCategorize({ phase: "error", ...batch });
        return;
      }
      deskSelection.clear();
      setDeskCategorize({ phase: "approved", count: result.count });
    } catch {
      setDeskCategorize({ phase: "error", ...batch });
    }
  }, [deskCategorize, ledger, deskSelection]);

  /* ── Desk rail: the period stepper (§3 web) — one state with the filter ── */
  // The label *is* the filter — `periodMonthOf`'s own doc has the reasoning.
  const periodMonth = periodMonthOf(filter.from, filter.to);
  const { setRange } = filters;
  const applyPeriodMonth = useCallback(
    (month: YearMonth) => {
      const { from, to } = monthRange(month);
      setRange(from, to);
    },
    [setRange],
  );
  // Stepping from "All time" or from a custom range starts at the current
  // month — there is no month to step *from*, and inventing one from a
  // range's first day would name a month the filter does not cover.
  const steppedFrom = periodMonth ?? currentMonth;
  const handlePeriodPrevious = useCallback(
    () => applyPeriodMonth(shiftMonth(steppedFrom, -1)),
    [steppedFrom, applyPeriodMonth],
  );
  const handlePeriodNext = useCallback(
    () => applyPeriodMonth(shiftMonth(steppedFrom, 1)),
    [steppedFrom, applyPeriodMonth],
  );
  const handlePeriodToday = useCallback(
    () => applyPeriodMonth(currentMonth),
    [currentMonth, applyPeriodMonth],
  );
  const periodLabel =
    periodMonth !== null
      ? monthLabel(periodMonth, locale)
      : filter.from === "" && filter.to === ""
        ? t("transactions.periodAllTime")
        : t("transactions.periodCustomRange", {
            from: filter.from || "…",
            to: filter.to || "…",
          });

  const periodControl = {
    label: periodLabel,
    isCurrent: periodMonth === currentMonth,
    onPrevious: handlePeriodPrevious,
    onNext: handlePeriodNext,
    onToday: handlePeriodToday,
  };

  // `F` — S10 §7 web. `SearchField`'s own `ref` prop (React 19, no `forwardRef`)
  // reaches the real `TextInput.focus()` this needs.
  const searchInputRef = useRef<TextInput>(null);
  const handleFocusRail = useCallback(() => searchInputRef.current?.focus(), []);

  const handleOpenSheet = useCallback(() => setSheetOpen(true), []);
  const handleDismissSheet = useCallback(() => setSheetOpen(false), []);

  const handleShortSwipe = useCallback(
    (id: string) => {
      const row = search.rows.find((candidate) => candidate.id === id);
      if (!row || (row.type !== "income" && row.type !== "expense")) return;
      setCategorizeSheet({ transactionId: id, kind: row.type });
    },
    [search.rows],
  );
  const handleDismissCategorize = useCallback(() => setCategorizeSheet(null), []);
  const handlePickCategory = useCallback(
    (categoryId: string) => {
      if (!categorizeSheet) return;
      const categorizeDraft: CategorizeBatchDraft = {
        transactionIds: [categorizeSheet.transactionId],
        categoryId,
      };
      ledger.categorizeBatch(categorizeDraft);
      setCategorizeSheet(null);
    },
    [categorizeSheet, ledger],
  );

  const accountOptions: SelectOption[] = snapshot.accounts.map((acc) => ({
    value: acc.id,
    label: acc.name,
  }));
  const categoryOptions: SelectOption[] = snapshot.categories.map((category) => ({
    value: category.id,
    label: category.name,
  }));
  /**
   * §4's remaining two dimensions, for the desk rail. Both lead with an
   * explicit "every one of them" option rather than a clear affordance
   * beside the control: `Select`'s own value is `string | null`, and "" is
   * the one value `useLedgerFilters` already reads as no filter.
   */
  const currencyOptions: SelectOption[] = [
    { value: "", label: t("transactions.filterEveryCurrency") },
    ...snapshot.currencies.map((currency) => ({
      value: currency.code,
      label: currency.code,
    })),
  ];
  const counterpartyOptions: SelectOption[] = [
    { value: "", label: t("transactions.filterEveryCounterparty") },
    ...snapshot.counterparties.map((counterparty) => ({
      value: counterparty.id,
      label: counterparty.name,
    })),
  ];

  // Everything `<LedgerFilterRail>` offers, in one object — the rail is a
  // component in `packages/ui` and cannot reach the snapshot itself.
  const railOptions = {
    accounts: accountOptions,
    categories: categoryOptions,
    currencies: currencyOptions,
    counterparties: counterpartyOptions,
    scopes: scopeSegments(t),
  };

  /**
   * §4's "each filter reports the count it excludes" — one number per active
   * control, one query each, memoised on the applied filter's own shape.
   * Both surfaces read it: the rail draws a note under each control, the
   * phone's chip row draws it on the chip (`05-composites.md` §5.6).
   */
  const exclusions = useFilterExclusionCounts(ledger, filters.applied, {
    count: search.total.count,
    // Which filter that count answers to — a subtraction across two of them
    // is a wrong number, and `answersTo` is how the hook tells (M2, round 3).
    answersTo: search.answersTo,
  });

  const activeFilters = activeFilterChips(t, filter, {
    accounts: snapshot.accounts,
    categories: snapshot.categories,
    counterparties: snapshot.counterparties,
    exclusions,
    onRemoveAccount: filters.removeAccount,
    onRemoveCategory: filters.removeCategory,
    onRemoveScope: filters.removeScope,
    onRemoveCurrency: filters.removeCurrency,
    onRemoveCounterparty: filters.removeCounterparty,
    onRemoveDateRange: filters.removeDateRange,
  });

  const filtered = filters.hasActiveFilter;
  const showEmpty = search.loaded && search.error === undefined && search.rows.length === 0;
  /**
   * How many rows the ledger holds with no filter at all — asked for only
   * when the empty state needs it, since an unfiltered count on every render
   * would be a query nothing else on screen wants, and asked `countOnly`
   * (M3, round 3): this is a count over the *whole* ledger, and folding
   * every row of it to read one integer is the worst case that mode exists
   * for.
   */
  const unfilteredCount = showEmpty
    ? ledger.searchTransactions({}, undefined, { countOnly: true }).total.count
    : 0;
  /**
   * **An empty ledger is a first run even under a filter** (L1, round 3).
   * The desk branch opens on the current month, so `hasActiveFilter` is true
   * from the first paint — which on a brand-new install offered *"No
   * transactions match these filters · Clear filters"* to someone who has
   * no transactions to filter. Clearing them would have changed nothing.
   * The unfiltered count is what tells the two apart, and it is already
   * being asked for: zero rows in the whole ledger is a first run whatever
   * the rail says, and only a non-empty ledger can be filtered down to
   * nothing.
   */
  const emptyIsFirstRun = unfilteredCount === 0;

  const renderItem = useCallback(
    ({ item }: { item: ListEntry }) =>
      item.kind === "header" ? (
        <DayHeader label={item.label} />
      ) : (
        <LedgerRowItem
          row={item.row}
          onPress={handlePressRoute}
          onShortSwipe={handleShortSwipe}
          onLongSwipe={handlePressRoute}
        />
      ),
    [handleShortSwipe],
  );
  const keyExtractor = useCallback((entry: ListEntry) => entry.key, []);
  const handleEndReached = useCallback(() => {
    if (search.hasMore) search.loadMore();
  }, [search]);

  if (breakpoint === "desk") {
    const emptyState =
      filtered && !emptyIsFirstRun ? (
        <EmptyState
          variant="filtered"
          title={t("transactions.emptyFilteredTitle")}
          body={t("transactions.emptyFilteredBody")}
          count={unfilteredCount}
          primaryAction={{ label: t("transactions.clearFilters"), onPress: filters.clearAll }}
        />
      ) : (
        <EmptyState
          variant="first-run"
          title={t("transactions.emptyFirstRunTitle")}
          body={t("transactions.emptyFirstRunBody")}
          primaryAction={{ label: t("routes.expense"), onPress: handleOpenSheet }}
        />
      );

    return (
      <GroundPanel scroll="own">
        <View style={styles.deskLayout}>
          {/*
            `scroll="own"`, not the panel's default page scroll: both
            children of this row own their own scroll and their own height —
            the rail is a bounded `ScrollView`, the table a `flex: 1`
            `FlatList` — and a page scroller around them would leave both
            unbounded and collapse the table to nothing.
          */}
          <LedgerFilterRail
            value={filter}
            options={railOptions}
            exclusions={exclusions}
            period={periodControl}
            today={today}
            searchRef={searchInputRef}
            onChangeText={filters.setText}
            onChangeAccountIds={filters.setAccountIds}
            onChangeCategoryIds={filters.setCategoryIds}
            onChangeScope={filters.setScope}
            onChangeCurrency={filters.setCurrency}
            onChangeCounterpartyId={filters.setCounterpartyId}
            onChangeFrom={filters.setFrom}
            onChangeTo={filters.setTo}
            onClearAll={filtered ? filters.clearAll : undefined}
          />

          <View style={styles.deskMain}>
            {search.loaded && search.total.count === 0 ? null : (
              <Card>
                {search.loaded ? (
                  <RunningTotal total={search.total} shown={search.rows.length} />
                ) : (
                  <TotalSkeleton />
                )}
              </Card>
            )}
            {search.capped ? (
              <Banner
                tone="warn"
                message={t("transactions.narrowTheFilter", { count: search.rows.length })}
              />
            ) : null}
            {/*
              L2 (round 2) — a drain that stopped on an empty page is not a
              drain that hit the cap, and "narrow the filter" is advice that
              would not help. Two endings, two messages.
            */}
            {search.incomplete ? (
              <Banner
                tone="warn"
                message={t("transactions.searchIncomplete", { count: search.rows.length })}
              />
            ) : null}
            <LedgerSelectionBar
              count={deskSelection.count}
              onCategorize={handleOpenCategorizeSelection}
              onClear={deskSelection.clear}
            />
            {/*
              L10 (round 2) — *Categorise* used to be a dead button for both
              of these: a mixed batch and a selection of rows that can carry
              no category at all (a transfer range, reachable through a
              shift-click). The refusal is now stated in both cases, before
              the button is pressed rather than after.
            */}
            {deskSelection.count > 0 && selectionKind === "mixed" ? (
              <Banner tone="warn" message={t("transactions.mixedKindSelection")} />
            ) : null}
            {deskSelection.count > 0 && selectionKind === null ? (
              <Banner tone="warn" message={t("transactions.uncategorisableSelection")} />
            ) : null}
            {deskCategorize && deskCategorize.phase !== "picking" ? (
              <CategorizeSelectionConfirm
                count={deskCategorize.count}
                categoryName={"categoryName" in deskCategorize ? deskCategorize.categoryName : ""}
                fromCategories={
                  "fromCategories" in deskCategorize ? deskCategorize.fromCategories : []
                }
                alreadyMatching={
                  "alreadyMatching" in deskCategorize ? deskCategorize.alreadyMatching : 0
                }
                state={deskCategorizeConfirmState(deskCategorize.phase)}
                onApprove={handleApproveDeskCategorize}
                onDecline={handleDeclineDeskCategorize}
                onDismiss={handleDismissDeskCategorize}
              />
            ) : null}
            {!search.loaded ? (
              <View style={styles.skeletonList}>
                {SKELETON_ROW_KEYS.map((key) => (
                  <Skeleton key={key} shape="row" label={t("transactions.loadingTransactions")} />
                ))}
              </View>
            ) : search.error !== undefined ? (
              <ErrorState
                variant="recoverable"
                what={t("transactions.loadFailedTitle")}
                why={t("transactions.loadFailedWhy")}
                action={{ label: t("common.retry"), onPress: search.retry }}
              />
            ) : (
              <LedgerTable
                rows={deskRows}
                sort={deskSort.sort}
                onSortColumn={deskSort.onSortColumn}
                selection={deskSelection}
                onOpenRow={handlePressRoute}
                onFocusRail={handleFocusRail}
                emptyState={emptyState}
              />
            )}
          </View>
        </View>

        <CategorySheet
          visible={deskCategorize?.phase === "picking"}
          kind={deskCategorize?.phase === "picking" ? deskCategorize.kind : "expense"}
          tree={snapshot.categoryTree}
          onPick={handlePickDeskCategory}
          onDismiss={handleDismissDeskCategorize}
        />
      </GroundPanel>
    );
  }

  return (
    <GroundPanel scroll="own">
      <SearchField
        value={filter.text}
        onChangeText={filters.setText}
        placeholder={t("transactions.searchPlaceholder")}
      />
      <View style={styles.chipRow}>
        {activeFilters.map((chip) => (
          <ActiveFilterChip
            key={chip.key}
            label={chip.label}
            excludes={chip.excludes}
            onRemove={chip.onRemove}
          />
        ))}
        <Chip placeholder={t("transactions.addFilter")} onPress={handleOpenSheet} />
        {filtered ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("transactions.clearAllFilters")}
            onPress={filters.clearAll}
            style={styles.clearAll}
          >
            <Text style={styles.clearAllText}>{t("transactions.clearAllFilters")}</Text>
          </Pressable>
        ) : null}
      </View>

      {search.loaded && search.total.count === 0 ? null : (
        <Card>{search.loaded ? <RunningTotal total={search.total} /> : <TotalSkeleton />}</Card>
      )}

      {!search.loaded ? (
        <View style={styles.skeletonList}>
          {SKELETON_ROW_KEYS.map((key) => (
            <Skeleton key={key} shape="row" label={t("transactions.loadingTransactions")} />
          ))}
        </View>
      ) : search.error !== undefined ? (
        <ErrorState
          variant="recoverable"
          what={t("transactions.loadFailedTitle")}
          why={t("transactions.loadFailedWhy")}
          action={{ label: t("common.retry"), onPress: search.retry }}
        />
      ) : showEmpty ? (
        filtered && !emptyIsFirstRun ? (
          <EmptyState
            variant="filtered"
            title={t("transactions.emptyFilteredTitle")}
            body={t("transactions.emptyFilteredBody")}
            count={unfilteredCount}
            primaryAction={{ label: t("transactions.clearFilters"), onPress: filters.clearAll }}
          />
        ) : (
          <EmptyState
            variant="first-run"
            title={t("transactions.emptyFirstRunTitle")}
            body={t("transactions.emptyFirstRunBody")}
            primaryAction={{ label: t("routes.expense"), onPress: handleOpenSheet }}
          />
        )
      ) : (
        <FlatList
          data={entries}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
          style={styles.list}
        />
      )}

      <BottomSheet
        visible={sheetOpen}
        title={t("transactions.filterSheetTitle")}
        onDismiss={handleDismissSheet}
      >
        <MultiSelect
          label={t("transactions.filterAccount")}
          placeholder={t("transactions.filterAccount")}
          options={accountOptions}
          values={filter.accountIds}
          onChange={filters.setAccountIds}
          searchable
        />
        <MultiSelect
          label={t("transactions.filterCategory")}
          placeholder={t("transactions.filterCategory")}
          options={categoryOptions}
          values={filter.categoryIds}
          onChange={filters.setCategoryIds}
          searchable
        />
        <SegmentControl
          segments={scopeSegments(t)}
          value={filter.scope}
          onChange={filters.setScope}
        />
        <DateField
          label={t("transactions.filterFrom")}
          value={filter.from}
          onChange={filters.setFrom}
          today={today}
        />
        <DateField
          label={t("transactions.filterTo")}
          value={filter.to}
          onChange={filters.setTo}
          today={today}
        />
      </BottomSheet>

      <CategorySheet
        visible={categorizeSheet !== null}
        kind={categorizeSheet?.kind ?? "expense"}
        tree={snapshot.categoryTree}
        onPick={handlePickCategory}
        onDismiss={handleDismissCategorize}
      />
    </GroundPanel>
  );
}

/**
 * §6.7's partition, as segments. Typed by the scope union rather than by
 * `string` (L8, round 3) — that is what lets both `SegmentControl` and
 * `<LedgerFilterRail>` hand `filters.setScope` its own value back with no
 * cast in between.
 */
function scopeSegments(
  t: ReturnType<typeof useT>,
): [
  Segment<LedgerFilterScope>,
  Segment<LedgerFilterScope>,
  Segment<LedgerFilterScope>,
  Segment<LedgerFilterScope>,
] {
  return [
    { value: "all", label: t("shell.scopeAll") },
    { value: "mine", label: t("shell.scopeMine") },
    { value: "shared", label: t("shell.scopeShared") },
    { value: "business", label: t("shell.scopeBusiness") },
  ];
}

/* ── Active filter chips ──────────────────────────────────────────────── */

type ActiveFilterChipDescriptor = {
  key: string;
  label: string;
  /** §4's own number for the dimension this chip belongs to — absent, or 0, draws nothing. */
  excludes?: number | undefined;
  onRemove: () => void;
};

type ActiveFilterDeps = {
  accounts: readonly { id: string; name: string }[];
  categories: readonly { id: string; name: string }[];
  counterparties: readonly { id: string; name: string }[];
  /** One count per dimension — every chip of a dimension carries that dimension's number. */
  exclusions: FilterExclusionCounts;
  onRemoveAccount: (id: string) => void;
  onRemoveCategory: (id: string) => void;
  onRemoveScope: () => void;
  onRemoveCurrency: () => void;
  onRemoveCounterparty: () => void;
  onRemoveDateRange: () => void;
};

/**
 * Every active filter, as a chip descriptor — one per account, one per
 * category, and one each for the scope, the currency, the counterparty and
 * the date range.
 *
 * **Currency and counterparty earn chips too** (L5, round 2). They joined
 * the filter state for the desk rail (§4), and a filter the phone can hold
 * but cannot see or remove is worse than one it does not have: the rows
 * would narrow with nothing on screen saying why, and "Clear all" would be
 * the only way out.
 */
function activeFilterChips(
  t: ReturnType<typeof useT>,
  filter: LedgerFilterState,
  deps: ActiveFilterDeps,
): readonly ActiveFilterChipDescriptor[] {
  const chips: ActiveFilterChipDescriptor[] = [];

  for (const id of filter.accountIds) {
    const account = deps.accounts.find((candidate) => candidate.id === id);
    chips.push({
      key: `account-${id}`,
      label: account?.name ?? id,
      excludes: deps.exclusions.accountIds,
      onRemove: () => deps.onRemoveAccount(id),
    });
  }
  for (const id of filter.categoryIds) {
    const category = deps.categories.find((candidate) => candidate.id === id);
    chips.push({
      key: `category-${id}`,
      label: category?.name ?? id,
      excludes: deps.exclusions.categoryIds,
      onRemove: () => deps.onRemoveCategory(id),
    });
  }
  if (filter.scope !== "all") {
    const label =
      filter.scope === "mine"
        ? t("shell.scopeMine")
        : filter.scope === "shared"
          ? t("shell.scopeShared")
          : t("shell.scopeBusiness");
    chips.push({
      key: "scope",
      label,
      excludes: deps.exclusions.scope,
      onRemove: deps.onRemoveScope,
    });
  }
  if (filter.currency !== "") {
    chips.push({
      key: "currency",
      // The code *is* the label — a currency has no second name on this
      // screen, and there is no id here to resolve into one.
      label: filter.currency,
      excludes: deps.exclusions.currency,
      onRemove: deps.onRemoveCurrency,
    });
  }
  if (filter.counterpartyId !== "") {
    const counterparty = deps.counterparties.find(
      (candidate) => candidate.id === filter.counterpartyId,
    );
    chips.push({
      key: "counterparty",
      label: counterparty?.name ?? filter.counterpartyId,
      excludes: deps.exclusions.counterpartyId,
      onRemove: deps.onRemoveCounterparty,
    });
  }
  if (filter.from !== "" || filter.to !== "") {
    const label = [filter.from, filter.to].filter((value) => value !== "").join(" → ");
    chips.push({
      key: "date-range",
      label,
      excludes: deps.exclusions.dateRange,
      onRemove: deps.onRemoveDateRange,
    });
  }

  return chips;
}

type ActiveFilterChipProps = { label: string; excludes?: number | undefined; onRemove: () => void };

/**
 * The whole chip is the remove target — `select.tsx`'s `Token` makes the same
 * choice for the same reason: an ×-only target would be a 10px button
 * wearing a 44px costume. Editing a filter's *value* happens through
 * `+ Filter`; tapping an already-active chip only ever removes it.
 */
function ActiveFilterChip({ label, excludes, onRemove }: ActiveFilterChipProps) {
  const t = useT();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("common.remove", { value: label })}
      onPress={onRemove}
      style={styles.activeChip}
    >
      <Text style={styles.activeChipText}>{label}</Text>
      {/*
        §4's exclusion count, on the chip rather than beside it — the phone's
        chip row is its filter bar, and `05-composites.md` §5.6 asks the same
        of it as §4 asks of the desk rail. Nothing at zero: a chip that hides
        nothing has nothing to report.
      */}
      {excludes !== undefined && excludes > 0 ? (
        <Text style={styles.activeChipExcludes}>
          {/* The plural is the resolver's — `ExcludesNote`'s own doc (L4). */}
          {t("transactions.filterExcludes", { count: excludes })}
        </Text>
      ) : null}
      <View style={styles.activeChipCross}>
        <View style={[styles.activeChipCrossBar, styles.activeChipCrossBarA]} />
        <View style={[styles.activeChipCrossBar, styles.activeChipCrossBarB]} />
      </View>
    </Pressable>
  );
}

/* ── The running total — S10 §3, §9 ──────────────────────────────────────── */

type RunningTotalProps = {
  total: { count: number; currencies: readonly PhoneCurrencyTotal[] };
  /**
   * How many rows are actually loaded. Equal to `total.count` once the desk
   * drain has run to the end, and less than it when the drain hit its cap —
   * in which case the header says both numbers rather than the one that is
   * no longer true of what is on screen (C1, round 1). Absent on the phone,
   * whose list pages and whose count has always meant "matching", not
   * "loaded".
   */
  shown?: number;
};

function RunningTotal({ total, shown }: RunningTotalProps) {
  const t = useT();
  const styles = useStyles();
  if (total.count === 0) return null;
  const countLabel =
    shown !== undefined && shown < total.count
      ? t("transactions.showingOfTotal", { shown, count: total.count })
      : total.count === 1
        ? t("transactions.totalCountOne", { count: total.count })
        : t("transactions.totalCountMany", { count: total.count });

  return (
    <View style={styles.total}>
      <Text style={styles.totalCount}>{countLabel}</Text>
      {total.currencies.map((currency) => (
        <CurrencyTotalLine key={currency.currency} currency={currency} />
      ))}
    </View>
  );
}

function CurrencyTotalLine({ currency }: { currency: PhoneCurrencyTotal }) {
  const t = useT();
  const locale = useLocale();
  const styles = useStyles();
  return (
    <View style={styles.totalLine}>
      <Amount
        value={currency.sum}
        currency={currency.currency}
        decimals={currency.decimals}
        size="large"
      />
      {currency.capitalCount > 0 ? (
        <Text style={styles.totalExcluding}>
          {currency.capitalCount === 1
            ? t("transactions.totalExcludingCapitalOne", {
                amount: money.forDisplay(
                  currency.sumExcludingCapital,
                  currency.decimals,
                  decimalMark(locale),
                ),
                count: currency.capitalCount,
              })
            : t("transactions.totalExcludingCapitalMany", {
                amount: money.forDisplay(
                  currency.sumExcludingCapital,
                  currency.decimals,
                  decimalMark(locale),
                ),
                count: currency.capitalCount,
              })}
        </Text>
      ) : null}
    </View>
  );
}

function TotalSkeleton() {
  const t = useT();
  return <Skeleton shape="row" label={t("transactions.loadingTransactions")} />;
}

/* ── Day sections, flattened for `FlatList` ──────────────────────────────── */

type ListEntry =
  | { key: string; kind: "header"; label: string }
  | { key: string; kind: "row"; row: PhoneSearchTransaction };

function flattenSections(
  sections: readonly { label: string; rows: readonly PhoneSearchTransaction[] }[],
): readonly ListEntry[] {
  const entries: ListEntry[] = [];
  for (const section of sections) {
    entries.push({
      key: `header-${section.label}-${section.rows[0]?.id}`,
      kind: "header",
      label: section.label,
    });
    for (const row of section.rows) {
      entries.push({ key: row.id, kind: "row", row });
    }
  }
  return entries;
}

function DayHeader({ label }: { label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.dayHeader}>
      <Text style={styles.dayHeaderText}>{label}</Text>
    </View>
  );
}

/* ── One list row — a transaction or a transfer, tap and swipe both wired ─── */

type LedgerRowItemProps = {
  row: PhoneSearchTransaction;
  onPress: (id: string) => void;
  onShortSwipe: (id: string) => void;
  onLongSwipe: (id: string) => void;
};

function LedgerRowItem({ row, onPress, onShortSwipe, onLongSwipe }: LedgerRowItemProps) {
  const styles = useStyles();
  const handlePress = useCallback(() => onPress(row.id), [onPress, row.id]);
  const handleShortSwipe = useCallback(() => onShortSwipe(row.id), [onShortSwipe, row.id]);
  const handleLongSwipe = useCallback(() => onLongSwipe(row.id), [onLongSwipe, row.id]);

  const body =
    row.type === "transfer" && row.toAccountName && row.toAmount && row.toCurrency ? (
      <TransferRow
        date={row.date}
        fromAccountName={row.accountName}
        toAccountName={row.toAccountName}
        amount={row.amount}
        currency={row.currency}
        decimals={row.decimals}
        toAmount={row.toAmount}
        toCurrency={row.toCurrency}
        toDecimals={row.toDecimals ?? row.decimals}
      />
    ) : (
      <TransactionRow
        date={row.date}
        payee={row.payee}
        category={row.categoryName}
        account={row.accountName}
        amount={row.amount}
        currency={row.currency}
        decimals={row.decimals}
        type={row.type}
        isBusiness={row.isBusiness}
        brandKey={row.brandKey}
      />
    );

  const pressable = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={row.payee || row.accountName}
      onPress={handlePress}
      style={styles.rowSeparator}
    >
      {body}
    </Pressable>
  );

  // Categorising a transfer or an adjustment has no meaning (`transactions_category_shape`) —
  // those rows stay tap-only rather than carrying a swipe gesture with nothing to do.
  if (row.type !== "income" && row.type !== "expense") return pressable;

  return (
    <SwipeableRow onShortSwipe={handleShortSwipe} onLongSwipe={handleLongSwipe}>
      {pressable}
    </SwipeableRow>
  );
}

const useStyles = makeStyles((theme) => ({
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  clearAll: {
    minHeight: touchTarget.min,
    justifyContent: "center",
    paddingHorizontal: space.md,
  },
  clearAllText: { color: theme.textMuted, ...text.ui("bodySm", 600) },
  activeChip: {
    minHeight: touchTarget.min,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    borderWidth: 1,
    borderColor: theme.accentFillBorder,
    backgroundColor: theme.accentFill,
    borderRadius: 8,
    paddingHorizontal: space.x3,
  },
  activeChipText: { color: theme.accentText, ...text.ui("bodySm", 600) },
  activeChipExcludes: { color: theme.accentText, ...text.ui("caption") },
  activeChipCross: { width: 10, height: 10, alignItems: "center", justifyContent: "center" },
  activeChipCrossBar: {
    position: "absolute",
    width: 11,
    height: 1.5,
    backgroundColor: theme.accentText,
  },
  activeChipCrossBarA: { transform: [{ rotate: "45deg" }] },
  activeChipCrossBarB: { transform: [{ rotate: "-45deg" }] },
  total: { gap: space.xs },
  totalCount: { color: theme.textMuted, ...text.ui("bodySm", 600) },
  totalLine: { gap: space.xs },
  totalExcluding: { color: theme.textMuted, ...text.ui("caption") },
  skeletonList: { gap: space.md },
  list: { flex: 1 },
  dayHeader: { paddingTop: space.x3, paddingBottom: space.xs },
  dayHeaderText: { color: theme.textMuted, ...text.ui("kicker") },
  rowSeparator: { borderTopWidth: hairline.width, borderTopColor: theme.hairline },
  // S10 §3 web — "the filter bar as a persistent left rail" beside the table.
  deskLayout: { flex: 1, flexDirection: "row", gap: space.x5 },
  deskMain: { flex: 1, gap: space.md, borderRadius: radius.md },
}));
