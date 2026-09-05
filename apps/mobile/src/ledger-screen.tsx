/**
 * S10 · the whole ledger — searchable, filterable, grouped by day, with a
 * running total and a swipe to recategorise. Replaces the stub.
 *
 * **One screen, both surfaces**, per `wave-3-shared.md` §3 — the mobile
 * layout `S10-transactions-list.md` §3 describes. The web table (§3's
 * ≥1024px density-first layout) is not this PR: `DeskBand`'s breakpoint
 * swaps the *shell* furniture already (`tabs-shell.tsx`), never the screen
 * body, so a virtualised table is a real second layout, not a style tweak —
 * and this phone list is the first honest data point for the desk table's
 * own virtualisation risk (the gate task names this explicitly).
 *
 * **The screen builds day sections and the `FlatList`** — see
 * `group-by-day.ts`'s own doc for why that split is not `TransactionList`'s
 * job.
 */

import type {
  CategorizeBatchDraft,
  PhoneCurrencyTotal,
  PhoneSearchTransaction,
  TransactionFilterDraft,
} from "@waltning/client/ledger/create-phone-ledger";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import { useTransactionSearch } from "@waltning/client/ledger/use-transaction-search";
import { groupByDay } from "@waltning/client/transactions/group-by-day";
import { addDays } from "@waltning/core/date";
import * as money from "@waltning/core/money";
import { CategorySheet } from "@waltning/ui/categories/category-sheet";
import { Amount } from "@waltning/ui/fx/amount";
import { decimalMark } from "@waltning/ui/i18n/locales";
import { useLocale, useT } from "@waltning/ui/i18n/provider";
import { Chip } from "@waltning/ui/primitives/chip";
import { DateField } from "@waltning/ui/primitives/date-field";
import { SearchField } from "@waltning/ui/primitives/search-field";
import { type Segment, SegmentControl } from "@waltning/ui/primitives/segment-control";
import { MultiSelect, type SelectOption } from "@waltning/ui/primitives/select";
import { BottomSheet } from "@waltning/ui/shell/bottom-sheet";
import { GroundPanel } from "@waltning/ui/shell/card";
import { EmptyState } from "@waltning/ui/states/empty-state";
import { ErrorState } from "@waltning/ui/states/error-state";
import { Skeleton } from "@waltning/ui/states/skeleton";
import { text } from "@waltning/ui/theme/fonts";
import { makeStyles } from "@waltning/ui/theme/styles";
import { hairline, space, touchTarget } from "@waltning/ui/tokens";
import { SwipeableRow } from "@waltning/ui/transactions/swipeable-row";
import { TransactionRow } from "@waltning/ui/transactions/transaction-row";
import { TransferRow } from "@waltning/ui/transactions/transfer-row";
import { type Href, router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

const SKELETON_ROW_KEYS = ["a", "b", "c", "d", "e"] as const;

/** `SegmentControl`'s scope options — `SPEC.md` §6.7's own four-way partition. */
type Scope = "all" | "mine" | "shared" | "business";

type FilterState = {
  text: string;
  accountIds: readonly string[];
  categoryIds: readonly string[];
  scope: Scope;
  from: string;
  to: string;
};

const EMPTY_FILTER: FilterState = {
  text: "",
  accountIds: [],
  categoryIds: [],
  scope: "all",
  from: "",
  to: "",
};

function hasActiveFilter(filter: FilterState): boolean {
  return (
    filter.accountIds.length > 0 ||
    filter.categoryIds.length > 0 ||
    filter.scope !== "all" ||
    filter.from !== "" ||
    filter.to !== ""
  );
}

function toDraft(filter: FilterState): TransactionFilterDraft {
  return {
    text: filter.text,
    accountIds: filter.accountIds,
    categoryIds: filter.categoryIds,
    scope: filter.scope,
    from: filter.from,
    to: filter.to,
  };
}

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

export default function Ledger() {
  const t = useT();
  const styles = useStyles();
  const ledger = useLedgerController();
  const snapshot = usePhoneLedger(ledger);
  const { account } = useLocalSearchParams<{ account?: string }>();

  const [filter, setFilter] = useState<FilterState>(() => ({
    ...EMPTY_FILTER,
    accountIds: account ? [account] : [],
  }));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [categorizeSheet, setCategorizeSheet] = useState<{
    transactionId: string;
    kind: "income" | "expense";
  } | null>(null);

  const draft = useMemo(() => toDraft(filter), [filter]);
  const search = useTransactionSearch(ledger, draft);

  const today = deviceRuntime().capture().date;
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

  const handleOpenSheet = useCallback(() => setSheetOpen(true), []);
  const handleDismissSheet = useCallback(() => setSheetOpen(false), []);
  const handleClearAll = useCallback(() => setFilter(EMPTY_FILTER), []);
  const handleRemoveAccount = useCallback((id: string) => {
    setFilter((current) => ({
      ...current,
      accountIds: current.accountIds.filter((existing) => existing !== id),
    }));
  }, []);
  const handleRemoveCategory = useCallback((id: string) => {
    setFilter((current) => ({
      ...current,
      categoryIds: current.categoryIds.filter((existing) => existing !== id),
    }));
  }, []);
  const handleRemoveScope = useCallback(() => {
    setFilter((current) => ({ ...current, scope: "all" }));
  }, []);
  const handleRemoveDateRange = useCallback(() => {
    setFilter((current) => ({ ...current, from: "", to: "" }));
  }, []);

  const handleChangeText = useCallback((next: string) => {
    setFilter((current) => ({ ...current, text: next }));
  }, []);
  const handleChangeAccountIds = useCallback((next: readonly string[]) => {
    setFilter((current) => ({ ...current, accountIds: next }));
  }, []);
  const handleChangeCategoryIds = useCallback((next: readonly string[]) => {
    setFilter((current) => ({ ...current, categoryIds: next }));
  }, []);
  const handleChangeScope = useCallback((next: string) => {
    setFilter((current) => ({ ...current, scope: next as Scope }));
  }, []);
  const handleChangeFrom = useCallback((next: string) => {
    setFilter((current) => ({ ...current, from: next }));
  }, []);
  const handleChangeTo = useCallback((next: string) => {
    setFilter((current) => ({ ...current, to: next }));
  }, []);

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

  const activeFilters = activeFilterChips(t, filter, {
    accounts: snapshot.accounts,
    categories: snapshot.categories,
    onRemoveAccount: handleRemoveAccount,
    onRemoveCategory: handleRemoveCategory,
    onRemoveScope: handleRemoveScope,
    onRemoveDateRange: handleRemoveDateRange,
  });

  const filtered = hasActiveFilter(filter);
  const showEmpty = search.loaded && search.error === undefined && search.rows.length === 0;
  // Only asked for when the empty state needs it — an unfiltered count on
  // every render would be a second query nothing else on screen wants.
  const excludedCount = showEmpty && filtered ? ledger.searchTransactions({}).total.count : 0;

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

  return (
    <GroundPanel scroll="own">
      <SearchField
        value={filter.text}
        onChangeText={handleChangeText}
        placeholder={t("transactions.searchPlaceholder")}
      />
      <View style={styles.chipRow}>
        {activeFilters.map((chip) => (
          <ActiveFilterChip key={chip.key} label={chip.label} onRemove={chip.onRemove} />
        ))}
        <Chip placeholder={t("transactions.addFilter")} onPress={handleOpenSheet} />
        {filtered ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("transactions.clearAllFilters")}
            onPress={handleClearAll}
            style={styles.clearAll}
          >
            <Text style={styles.clearAllText}>{t("transactions.clearAllFilters")}</Text>
          </Pressable>
        ) : null}
      </View>

      {search.loaded ? <RunningTotal total={search.total} /> : <TotalSkeleton />}

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
        filtered ? (
          <EmptyState
            variant="filtered"
            title={t("transactions.emptyFilteredTitle")}
            body={t("transactions.emptyFilteredBody")}
            count={excludedCount}
            primaryAction={{ label: t("transactions.clearFilters"), onPress: handleClearAll }}
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
          onChange={handleChangeAccountIds}
          searchable
        />
        <MultiSelect
          label={t("transactions.filterCategory")}
          placeholder={t("transactions.filterCategory")}
          options={categoryOptions}
          values={filter.categoryIds}
          onChange={handleChangeCategoryIds}
          searchable
        />
        <SegmentControl
          segments={scopeSegments(t)}
          value={filter.scope}
          onChange={handleChangeScope}
        />
        <DateField
          label={t("transactions.filterFrom")}
          value={filter.from}
          onChange={handleChangeFrom}
          today={today}
        />
        <DateField
          label={t("transactions.filterTo")}
          value={filter.to}
          onChange={handleChangeTo}
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

function scopeSegments(t: ReturnType<typeof useT>): [Segment, Segment, Segment, Segment] {
  return [
    { value: "all", label: t("shell.scopeAll") },
    { value: "mine", label: t("shell.scopeMine") },
    { value: "shared", label: t("shell.scopeShared") },
    { value: "business", label: t("shell.scopeBusiness") },
  ];
}

/* ── Active filter chips ──────────────────────────────────────────────── */

type ActiveFilterChipDescriptor = { key: string; label: string; onRemove: () => void };

type ActiveFilterDeps = {
  accounts: readonly { id: string; name: string }[];
  categories: readonly { id: string; name: string }[];
  onRemoveAccount: (id: string) => void;
  onRemoveCategory: (id: string) => void;
  onRemoveScope: () => void;
  onRemoveDateRange: () => void;
};

/** Every active filter, as a chip descriptor — one per account, category, the scope, and the date range. */
function activeFilterChips(
  t: ReturnType<typeof useT>,
  filter: FilterState,
  deps: ActiveFilterDeps,
): readonly ActiveFilterChipDescriptor[] {
  const chips: ActiveFilterChipDescriptor[] = [];

  for (const id of filter.accountIds) {
    const account = deps.accounts.find((candidate) => candidate.id === id);
    chips.push({
      key: `account-${id}`,
      label: account?.name ?? id,
      onRemove: () => deps.onRemoveAccount(id),
    });
  }
  for (const id of filter.categoryIds) {
    const category = deps.categories.find((candidate) => candidate.id === id);
    chips.push({
      key: `category-${id}`,
      label: category?.name ?? id,
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
    chips.push({ key: "scope", label, onRemove: deps.onRemoveScope });
  }
  if (filter.from !== "" || filter.to !== "") {
    const label = [filter.from, filter.to].filter((value) => value !== "").join(" → ");
    chips.push({ key: "date-range", label, onRemove: deps.onRemoveDateRange });
  }

  return chips;
}

type ActiveFilterChipProps = { label: string; onRemove: () => void };

/**
 * The whole chip is the remove target — `select.tsx`'s `Token` makes the same
 * choice for the same reason: an ×-only target would be a 10px button
 * wearing a 44px costume. Editing a filter's *value* happens through
 * `+ Filter`; tapping an already-active chip only ever removes it.
 */
function ActiveFilterChip({ label, onRemove }: ActiveFilterChipProps) {
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
      <View style={styles.activeChipCross}>
        <View style={[styles.activeChipCrossBar, styles.activeChipCrossBarA]} />
        <View style={[styles.activeChipCrossBar, styles.activeChipCrossBarB]} />
      </View>
    </Pressable>
  );
}

/* ── The running total — S10 §3, §9 ──────────────────────────────────────── */

type RunningTotalProps = { total: { count: number; currencies: readonly PhoneCurrencyTotal[] } };

function RunningTotal({ total }: RunningTotalProps) {
  const t = useT();
  const styles = useStyles();
  if (total.count === 0) return null;
  const countLabel =
    total.count === 1
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
}));
