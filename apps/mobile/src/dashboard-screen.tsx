/**
 * S01 · Dashboard — the desk's landing screen (≥1024px), answering "where do
 * I stand and what needs action" with the widgets the phone-alone ledger can
 * feed: balances (A1), recent, debt (E3), spend by category and income vs
 * expense (both new class-S folds reimplemented as replica folds for this
 * arc — `computations.md` §0, §6, §12). `app/(tabs)/index.tsx` is the one
 * file that chooses between this screen and `today-screen.tsx` by breakpoint.
 *
 * **The grid comes from `dashboard_layouts`, never from this file's own
 * arrangement.** `useDashboardLayout` reads the one row `DESK4`'s migration
 * seeds (`SPEC.md` §14.5); `WIDGET_NODES` below only says how to *render*
 * each known `kind`, in whatever order and size the table gives. Read but not
 * rearranged this arc — S24 writes a layout. A layout naming a kind this
 * build has no renderer for is dropped **and reported** — silently rendering
 * fewer widgets than the table names is how S24's first new widget would go
 * missing without a single line in the log.
 *
 * **The lead currency is §7.0's display currency, and every widget names
 * it.** Not the alphabetically first entry in `netWorth`, which is what this
 * screen used to pick: a single dormant `CHF` account sorts ahead of a PLN
 * ledger and turned a month of forty transactions into "Nothing spent this
 * period", under a header that named no currency at all. Figures in any other
 * currency are listed on their own rows, unconverted — arc-phone has no rate
 * table, and a converted total would be a number invented to look tidy.
 *
 * **The band's scope segment reaches three of the five widgets.** `S01` §3
 * anticipates exactly this — *"with a scope segment in the shell that a widget
 * may or may not inherit, the frame has to be local"* — so `balances`,
 * `spend_by_category` and `income_vs_expense` follow the control, `recent` and
 * `debt` state `All` because their readers carry neither `ownership` nor
 * `is_business`, and all five say in their own header which one they applied.
 *
 * **The unallocated banner is page-level, not a widget** — `S01` §4 draws
 * `Banner(warn)` beside `WidgetGrid`, never inside a `WidgetCard`, the same
 * shape `today-screen.tsx` and `debt-screen.tsx` already render it in. All
 * three now share one model (`packages/client`) and one component
 * (`packages/ui`): this was the third use, which is when the rule says to
 * extract.
 */

import { useDisplayCurrency } from "@waltning/client/currencies/display-currency";
import { useDevicePreference } from "@waltning/client/device/use-device-preference";
import { clientFailure, emitClientDiagnostic } from "@waltning/client/diagnostics";
import { DEFAULT_DESK_SCOPE } from "@waltning/client/ledger/desk-scope";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { useDashboardLayout } from "@waltning/client/ledger/use-dashboard-layout";
import { useIncomeVsExpense } from "@waltning/client/ledger/use-income-vs-expense";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import { useSpendByCategory } from "@waltning/client/ledger/use-spend-by-category";
import { useUnsettledBanner } from "@waltning/client/ledger/use-unsettled-banner";
import { accountingDate, shiftMonth, yearMonth } from "@waltning/core/date";
import * as money from "@waltning/core/money";
import { BalancesWidget } from "@waltning/ui/dashboard/balances-widget";
import { DashboardGrid, type DashboardGridSlot } from "@waltning/ui/dashboard/dashboard-grid";
import { DebtWidget } from "@waltning/ui/dashboard/debt-widget";
import { IncomeVsExpenseWidget } from "@waltning/ui/dashboard/income-vs-expense-widget";
import type { OtherCurrencyRow } from "@waltning/ui/dashboard/other-currencies";
import { RecentWidget } from "@waltning/ui/dashboard/recent-widget";
import { SpendByCategoryWidget } from "@waltning/ui/dashboard/spend-by-category-widget";
import { dayLabel, monthLabel } from "@waltning/ui/i18n/locales";
import { useLocale, useT } from "@waltning/ui/i18n/provider";
import { GroundPanel } from "@waltning/ui/shell/card";
import { UnsettledBanner } from "@waltning/ui/shell/unsettled-banner";
import { EmptyState } from "@waltning/ui/states/empty-state";
import { ErrorState } from "@waltning/ui/states/error-state";
import { Skeleton } from "@waltning/ui/states/skeleton";
import { makeStyles } from "@waltning/ui/theme/styles";
import { space } from "@waltning/ui/tokens";
import { router } from "expo-router";
import { useEffect, useMemo } from "react";
import { View } from "react-native";
import { mobileDiagnostics } from "./diagnostics.ts";
import { deskScope, displayCurrency } from "./platform";

/**
 * The trailing months `income_vs_expense` charts (§12) — five **complete**
 * ones plus the current, incomplete one, which is charted beside them and
 * named apart rather than dropped. Ending the range a month back would hide
 * today; ending it here without saying so read as an income collapse on the
 * 2nd of every month.
 */
const COMPLETE_FLOW_MONTHS = 5;
const FLOW_MONTHS = COMPLETE_FLOW_MONTHS + 1;
/** §7.2 — five named segments, the sixth-and-on folded into "Other". */
const TOP_CATEGORIES = 5;

/** Every `kind` this build can draw. A layout naming anything else is reported, not silently shortened. */
const WIDGET_KINDS = ["balances", "recent", "debt", "spend_by_category", "income_vs_expense"];

const SCOPE_LABEL_KEY = {
  all: "shell.scopeAll",
  mine: "shell.scopeMine",
  shared: "shell.scopeShared",
  business: "shell.scopeBusiness",
} as const satisfies Record<money.LedgerScope, string>;

function handleCreateAccount() {
  router.push({ pathname: "/account/new", params: { returnTo: "today" } });
}

/** Every Recent row opens S09, the same target `today-screen.tsx`'s own Recent card uses. */
function handleOpenTransaction(id: string) {
  router.push({ pathname: "/transaction/[id]", params: { id } });
}

export default function Dashboard() {
  const t = useT();
  const locale = useLocale();
  const styles = useStyles();
  const ledger = useLedgerController();
  const snapshot = usePhoneLedger(ledger);
  const display = useDisplayCurrency(displayCurrency);
  const storedScope = useDevicePreference(deskScope);
  const leadCurrency = display.currency;
  const scope = storedScope.value ?? DEFAULT_DESK_SCOPE;

  const currentMonth = yearMonth(deviceRuntime().capture().date.slice(0, 7));
  const period = useMemo<money.Period>(
    () => ({
      start: accountingDate(`${currentMonth}-01`),
      end: accountingDate(`${shiftMonth(currentMonth, 1)}-01`),
    }),
    [currentMonth],
  );
  const buckets = useMemo(
    () => money.trailingMonthBuckets(currentMonth, FLOW_MONTHS),
    [currentMonth],
  );

  const layout = useDashboardLayout(ledger, snapshot.revision);
  const spendRows = useSpendByCategory(ledger, period, scope, snapshot.revision);
  const flowRows = useIncomeVsExpense(ledger, buckets, scope, snapshot.revision);
  const unsettledModel = useUnsettledBanner(snapshot.unsettledClearing);

  const today = deviceRuntime().capture().date;
  // H1 — `listCounterpartyBalances` is a live controller read, never cached
  // in the snapshot; `snapshot.revision` is the dependency that means "a
  // write could have changed this" (the same reasoning `debt-screen.tsx`
  // gives its own identical memo).
  // biome-ignore lint/correctness/useExhaustiveDependencies: snapshot.revision invalidates this memo by identity, not by being read.
  const debtBalances = useMemo(
    () => ledger.listCounterpartyBalances(today),
    [ledger, snapshot.revision, today],
  );
  const debtTotalsResult = useMemo(():
    | { ok: true; rows: readonly money.DirectionTotalRow[] }
    | { ok: false; reason: ReturnType<typeof clientFailure> } => {
    try {
      return { ok: true, rows: money.directionTotals(debtBalances) };
    } catch (error) {
      return { ok: false, reason: clientFailure(error) };
    }
  }, [debtBalances]);
  const debtFailureReason = debtTotalsResult.ok ? undefined : debtTotalsResult.reason;
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the failure's own message, not the reason object's identity.
  useEffect(() => {
    if (debtFailureReason === undefined) return;
    emitClientDiagnostic(mobileDiagnostics, {
      scope: "client_state",
      update: "counterparty_direction_totals",
      phase: "failure",
      error: debtFailureReason,
    });
  }, [debtFailureReason?.message]);

  // M4 — both silent failures the grid could have, reported. A missing layout
  // draws an `ErrorState` below rather than a blank page — the seed migration
  // exists so that state cannot happen, which makes it a failure rather than
  // an empty ledger. An unknown kind is dropped, which is the only thing this
  // build can do with it, but never without saying so.
  const layoutMissing = layout === null && snapshot.revision > 0;
  useEffect(() => {
    if (!layoutMissing) return;
    emitClientDiagnostic(mobileDiagnostics, {
      scope: "client_state",
      update: "dashboard_active_layout",
      phase: "failure",
      error: clientFailure(
        new Error("no active dashboard layout — SPEC.md §14.5's seed is absent"),
      ),
    });
  }, [layoutMissing]);

  const unknownKinds = (layout?.widgets ?? [])
    .map((widget) => widget.kind)
    .filter((kind) => !WIDGET_KINDS.includes(kind))
    .join(",");
  useEffect(() => {
    if (unknownKinds === "") return;
    emitClientDiagnostic(mobileDiagnostics, {
      scope: "client_state",
      update: "dashboard_unknown_widget_kind",
      phase: "failure",
      error: clientFailure(new Error(`no renderer for widget kinds: ${unknownKinds}`)),
    });
  }, [unknownKinds]);

  const hasAccounts = snapshot.accounts.length > 0;
  const handleRetry = () => {
    try {
      ledger.refresh();
    } catch {
      // The snapshot already carries the new failure — see `today-screen.tsx`'s identical comment.
    }
  };

  const handleOpenUnsettled = () => {
    if (!unsettledModel) return;
    const target = unsettledModel.openTarget;
    if (target.kind === "transaction") {
      router.push({ pathname: "/transaction/[id]", params: { id: target.transactionId } });
      return;
    }
    router.push({ pathname: "/ledger", params: { account: target.accountId } });
  };
  const unsettledBanner = <UnsettledBanner model={unsettledModel} onOpen={handleOpenUnsettled} />;

  if (snapshot.error) {
    return (
      <GroundPanel>
        <ErrorState
          variant="recoverable"
          what={t("shell.balanceQueryFailed")}
          why={t("shell.balanceQueryFailedBody")}
          action={{ label: t("common.retry"), onPress: handleRetry }}
        />
      </GroundPanel>
    );
  }

  // Loading — `snapshot.revision === 0` until the first `refresh()` settles,
  // the same signal `debt-screen.tsx` reads for the identical reason.
  if (snapshot.revision === 0) {
    return (
      <GroundPanel>
        <View style={styles.root}>
          <Skeleton shape="block" label={t("dashboard.balances")} />
          <Skeleton shape="block" label={t("shell.recent")} />
        </View>
      </GroundPanel>
    );
  }

  // S01 §6 — `EmptyState(first-run)` replaces the whole grid, never a per-widget empty.
  if (!hasAccounts) {
    return (
      <GroundPanel>
        <EmptyState
          variant="first-run"
          title={t("shell.noAccounts")}
          body={t("shell.noAccountsBody")}
          primaryAction={{ label: t("routes.createAccount"), onPress: handleCreateAccount }}
        />
      </GroundPanel>
    );
  }

  const scopeLabel = t(SCOPE_LABEL_KEY[scope]);
  const allLabel = t("shell.scopeAll");
  const periodLabel = monthLabel(currentMonth, locale);
  const asOfLabel = t("dashboard.asOf", { date: dayLabel(today, locale) });
  const flowRangeLabel = t("dashboard.flowRange", { count: COMPLETE_FLOW_MONTHS });

  const categoryNameOf = new Map<string, string>(
    snapshot.categoryTree.map((category) => [category.id, category.name]),
  );
  const spendForLead = spendRows.filter((row) => row.currency === leadCurrency);
  const { top: topSpend, restTotal: otherTotal } = money.topByAmount(spendForLead, TOP_CATEGORIES);
  const spendSegments = [
    ...topSpend.map((row) => ({
      key: row.categoryId ?? "uncategorized",
      label: row.categoryId
        ? (categoryNameOf.get(row.categoryId) ?? t("dashboard.uncategorized"))
        : t("dashboard.uncategorized"),
      amount: row.amount,
      currency: row.currency,
      decimals: row.decimals,
    })),
    ...(!money.isZero(otherTotal)
      ? [
          {
            key: "other",
            label: t("dashboard.other"),
            amount: otherTotal,
            currency: leadCurrency,
            decimals: topSpend[0]?.decimals ?? 2,
          },
        ]
      : []),
  ];

  // Every currency the fold returned that the chart above could not draw —
  // one row each, its own scale, no rate invented.
  const spendOtherTotals = new Map<string, { decimals: number; total: money.Money }>();
  for (const row of spendRows) {
    if (row.currency === leadCurrency) continue;
    const running = spendOtherTotals.get(row.currency);
    spendOtherTotals.set(row.currency, {
      decimals: row.decimals,
      total: running ? money.add(running.total, row.amount) : row.amount,
    });
  }
  const spendOthers: readonly OtherCurrencyRow[] = [...spendOtherTotals.entries()].map(
    ([currency, entry]) => ({
      currency,
      decimals: entry.decimals,
      figures: [{ value: entry.total, kind: "spend" as const }],
    }),
  );

  const flowBars = flowRows
    .filter((row) => row.currency === leadCurrency)
    .map((row) => ({
      label:
        row.label === currentMonth
          ? t("dashboard.monthToDate", { month: monthLabel(yearMonth(row.label), locale) })
          : monthLabel(yearMonth(row.label), locale),
      income: row.income,
      expense: row.expense,
      currency: row.currency,
      decimals: row.decimals,
      partial: row.label === currentMonth,
    }));

  const flowOtherTotals = new Map<
    string,
    { decimals: number; income: money.Money; expense: money.Money }
  >();
  for (const row of flowRows) {
    if (row.currency === leadCurrency) continue;
    const running = flowOtherTotals.get(row.currency);
    flowOtherTotals.set(row.currency, {
      decimals: row.decimals,
      income: running ? money.add(running.income, row.income) : row.income,
      expense: running ? money.add(running.expense, row.expense) : row.expense,
    });
  }
  const flowOthers: readonly OtherCurrencyRow[] = [...flowOtherTotals.entries()].map(
    ([currency, entry]) => ({
      currency,
      decimals: entry.decimals,
      figures: [
        { value: entry.income, kind: "income" as const },
        { value: entry.expense, kind: "spend" as const },
      ],
    }),
  );

  const balancesRows = snapshot.accounts
    .filter((account) => money.inScope(account, scope))
    .map((account) => ({
      id: account.id,
      name: account.name,
      balance: account.balance,
      currency: account.currency,
      decimals: account.decimals,
    }));

  const recentRows = snapshot.recent.map((row) => ({
    id: row.id,
    payee: row.payee,
    meta: row.categoryName ?? row.accountName,
    amount: row.amount,
    currency: row.currency,
    decimals: row.decimals,
    kind: "auto" as const,
  }));

  const WIDGET_NODES: Record<string, React.ReactNode> = {
    balances: (
      <BalancesWidget
        title={t("dashboard.balances")}
        currency={leadCurrency}
        period={asOfLabel}
        scope={scopeLabel}
        rows={balancesRows}
        emptyLabel={t("dashboard.noBalances")}
      />
    ),
    // `All`, stated rather than inherited: `PhoneRecentTransaction` carries no
    // `ownership`, so this reader cannot answer *mine* or *shared* at all.
    recent: (
      <RecentWidget
        title={t("shell.recent")}
        currency={leadCurrency}
        period={asOfLabel}
        scope={allLabel}
        rows={recentRows}
        emptyLabel={t("dashboard.noRecent")}
        onPress={handleOpenTransaction}
      />
    ),
    // `All` for the same reason: a counterparty balance belongs to a person,
    // not to an account whose ownership could be read.
    debt: (
      <DebtWidget
        title={t("dashboard.debt")}
        currency={leadCurrency}
        period={asOfLabel}
        scope={allLabel}
        totals={debtTotalsResult.ok ? debtTotalsResult.rows : []}
        theyOweLabel={t("counterparties.theyOweTotal")}
        youOweLabel={t("counterparties.youOweTotal")}
        emptyLabel={t("dashboard.noDebt")}
        error={debtTotalsResult.ok ? undefined : t("counterparties.totalsInconsistentWhy")}
      />
    ),
    spend_by_category: (
      <SpendByCategoryWidget
        title={t("dashboard.spendByCategory")}
        currency={leadCurrency}
        period={`${periodLabel} · ${t("dashboard.byLeafCategory")}`}
        scope={scopeLabel}
        segments={spendSegments}
        others={spendOthers}
        othersLabel={t("dashboard.otherCurrencies")}
        emptyLabel={t("dashboard.noSpend")}
      />
    ),
    income_vs_expense: (
      <IncomeVsExpenseWidget
        title={t("dashboard.incomeVsExpense")}
        currency={leadCurrency}
        period={flowRangeLabel}
        scope={scopeLabel}
        bars={flowBars}
        others={flowOthers}
        othersLabel={t("dashboard.otherCurrencies")}
        incomeLabel={t("transactions.income")}
        expenseLabel={t("transactions.expense")}
        emptyLabel={t("dashboard.noActivity")}
      />
    ),
  };

  const slots: DashboardGridSlot[] = (layout?.widgets ?? [])
    .filter((widget) => WIDGET_NODES[widget.kind] !== undefined)
    .map((widget) => ({ key: widget.id, size: widget.size, node: WIDGET_NODES[widget.kind] }));

  return (
    <GroundPanel>
      <View style={styles.root}>
        {unsettledBanner}
        {layout === null ? (
          <ErrorState
            variant="recoverable"
            what={t("dashboard.noLayout")}
            why={t("dashboard.noLayoutBody")}
            action={{ label: t("common.retry"), onPress: handleRetry }}
          />
        ) : (
          <DashboardGrid slots={slots} />
        )}
      </View>
    </GroundPanel>
  );
}

const useStyles = makeStyles(() => ({
  root: { gap: space.x4 },
}));
