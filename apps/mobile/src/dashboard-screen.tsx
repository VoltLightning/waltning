/**
 * S01 · Dashboard — the desk's landing screen (≥1024px), answering "where do
 * I stand and what needs action" with the widgets the phone-alone ledger can
 * feed: balances (A1), recent, debt (E3), spend by category and income vs
 * expense (both new class-S folds reimplemented as replica folds for this
 * arc — `computations.md` §0, §6, §12). `home-screen.tsx` is the one file
 * that chooses between this screen and `today-screen.tsx` by breakpoint —
 * `today-screen.tsx` itself is untouched by `DESK4`.
 *
 * **The grid comes from `dashboard_layouts`, never from this file's own
 * arrangement.** `useDashboardLayout` reads the one row `DESK4`'s migration
 * seeds (`SPEC.md` §14.5); `WIDGET_NODES` below only says how to *render*
 * each known `kind`, in whatever order and size the table gives. Read but not
 * rearranged this arc — S24 writes a layout.
 *
 * **The unallocated banner is page-level, not a widget** — `S01` §4 draws
 * `Banner(warn)` beside `WidgetGrid`, never inside a `WidgetCard`, the same
 * shape `today-screen.tsx` and `debt-screen.tsx` already render it in. That
 * logic is now written a third time rather than shared: `today-screen.tsx`
 * stays byte-for-byte untouched by this arc (its own stories depend on it),
 * so the extraction the third use would otherwise justify has nowhere legal
 * to land without editing that file.
 */

import { clientFailure, emitClientDiagnostic } from "@waltning/client/diagnostics";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { useDashboardLayout } from "@waltning/client/ledger/use-dashboard-layout";
import { useIncomeVsExpense } from "@waltning/client/ledger/use-income-vs-expense";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import { useSpendByCategory } from "@waltning/client/ledger/use-spend-by-category";
import { accountingDate, shiftMonth, yearMonth } from "@waltning/core/date";
import * as money from "@waltning/core/money";
import { BalancesWidget } from "@waltning/ui/dashboard/balances-widget";
import { DashboardGrid, type DashboardGridSlot } from "@waltning/ui/dashboard/dashboard-grid";
import { DebtWidget } from "@waltning/ui/dashboard/debt-widget";
import { IncomeVsExpenseWidget } from "@waltning/ui/dashboard/income-vs-expense-widget";
import { RecentWidget } from "@waltning/ui/dashboard/recent-widget";
import { SpendByCategoryWidget } from "@waltning/ui/dashboard/spend-by-category-widget";
import { decimalMark, monthLabel } from "@waltning/ui/i18n/locales";
import { useLocale, useT } from "@waltning/ui/i18n/provider";
import { GroundPanel } from "@waltning/ui/shell/card";
import { Banner } from "@waltning/ui/states/banner";
import { EmptyState } from "@waltning/ui/states/empty-state";
import { ErrorState } from "@waltning/ui/states/error-state";
import { Skeleton } from "@waltning/ui/states/skeleton";
import { makeStyles } from "@waltning/ui/theme/styles";
import { space } from "@waltning/ui/tokens";
import { router } from "expo-router";
import { useEffect, useMemo } from "react";
import { View } from "react-native";
import { mobileDiagnostics } from "./diagnostics.ts";

/** The number of trailing months `income_vs_expense` charts (§12) — a fixed range this arc, S24's own config later. */
const FLOW_MONTHS = 6;
/** §7.2 — five named segments, the sixth-and-on folded into "Other". */
const TOP_CATEGORIES = 5;

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
  const spendRows = useSpendByCategory(ledger, period, snapshot.revision);
  const flowRows = useIncomeVsExpense(ledger, buckets, snapshot.revision);

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

  const hasAccounts = snapshot.accounts.length > 0;
  const handleRetry = () => {
    try {
      ledger.refresh();
    } catch {
      // The snapshot already carries the new failure — see `today-screen.tsx`'s identical comment.
    }
  };

  const unsettled = snapshot.unsettledClearing[0];
  const unsettledMore = snapshot.unsettledClearing.length - 1;
  const unsettledPayee = unsettled?.oldestUnconsumedPayee;
  const unsettledIsOpening = unsettled != null && unsettled.oldestUnconsumedTransactionId === null;
  const unsettledRemainder =
    unsettled?.oldestUnconsumedRemainder ?? unsettled?.balance ?? money.ZERO;
  const unsettledRemainderDiffers =
    unsettled != null &&
    unsettled.oldestUnconsumedRemainder != null &&
    !money.eq(unsettled.oldestUnconsumedRemainder, unsettled.balance);
  const unsettledNamedKey = unsettledRemainderDiffers
    ? unsettledMore > 0
      ? "shell.unsettledNamedDiffersMore"
      : "shell.unsettledNamedDiffers"
    : unsettledMore > 0
      ? "shell.unsettledNamedMore"
      : "shell.unsettledNamed";
  const handleOpenUnsettled = () => {
    if (!unsettled) return;
    if (unsettled.oldestUnconsumedTransactionId) {
      router.push({
        pathname: "/transaction/[id]",
        params: { id: unsettled.oldestUnconsumedTransactionId },
      });
      return;
    }
    router.push({ pathname: "/ledger", params: { account: unsettled.accountId } });
  };
  const unsettledBanner = unsettled ? (
    <Banner
      tone="warn"
      message={
        unsettledIsOpening
          ? t(unsettledMore > 0 ? "shell.unsettledOpeningMore" : "shell.unsettledOpening", {
              remainder: money.forDisplay(
                unsettledRemainder,
                unsettled.decimals,
                decimalMark(locale),
              ),
              currency: unsettled.currency,
              count: unsettledMore,
            })
          : unsettledPayee
            ? t(unsettledNamedKey, {
                remainder: money.forDisplay(
                  unsettledRemainder,
                  unsettled.decimals,
                  decimalMark(locale),
                ),
                amount: money.forDisplay(
                  unsettled.balance,
                  unsettled.decimals,
                  decimalMark(locale),
                ),
                currency: unsettled.currency,
                payee: unsettledPayee,
                count: unsettledMore,
              })
            : t(unsettledMore > 0 ? "shell.unsettledMore" : "shell.unsettled", {
                amount: money.forDisplay(
                  unsettled.balance,
                  unsettled.decimals,
                  decimalMark(locale),
                ),
                currency: unsettled.currency,
                account: unsettled.name,
                count: unsettledMore,
              })
      }
      action={{ label: t("shell.unsettledOpen"), onPress: handleOpenUnsettled }}
    />
  ) : null;

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

  const leadCurrency = snapshot.netWorth[0]?.currency ?? null;
  const periodLabel = monthLabel(currentMonth, locale);
  const flowRangeLabel = t("dashboard.flowRange", { count: FLOW_MONTHS });

  const categoryNameOf = new Map<string, string>(
    snapshot.categoryTree.map((category) => [category.id, category.name]),
  );
  const spendForLead = leadCurrency ? spendRows.filter((row) => row.currency === leadCurrency) : [];
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
            currency: leadCurrency ?? "",
            decimals: topSpend[0]?.decimals ?? 2,
          },
        ]
      : []),
  ];

  const flowBars = (
    leadCurrency ? flowRows.filter((row) => row.currency === leadCurrency) : []
  ).map((row) => ({
    label: monthLabel(yearMonth(row.label), locale),
    income: row.income,
    expense: row.expense,
    currency: row.currency,
    decimals: row.decimals,
  }));

  const balancesRows = snapshot.accounts.map((account) => ({
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
        meta={`${t("common.appName")} · ${t("shell.scopeAll")}`}
        rows={balancesRows}
        emptyLabel={t("dashboard.noBalances")}
      />
    ),
    recent: (
      <RecentWidget
        title={t("shell.recent")}
        meta={t("shell.scopeAll")}
        rows={recentRows}
        emptyLabel={t("dashboard.noRecent")}
        onPress={handleOpenTransaction}
      />
    ),
    debt: (
      <DebtWidget
        title={t("dashboard.debt")}
        meta={t("shell.today")}
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
        meta={`${periodLabel} · ${t("shell.scopeMine")}`}
        segments={spendSegments}
        emptyLabel={t("dashboard.noSpend")}
      />
    ),
    income_vs_expense: (
      <IncomeVsExpenseWidget
        title={t("dashboard.incomeVsExpense")}
        meta={`${flowRangeLabel} · ${t("shell.scopeMine")}`}
        bars={flowBars}
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
        <DashboardGrid slots={slots} />
      </View>
    </GroundPanel>
  );
}

const useStyles = makeStyles(() => ({
  root: { gap: space.x4 },
}));
