import { useAppearance } from "@waltning/client/appearance/use-appearance";
import type { PhoneRecentTransaction } from "@waltning/client/ledger/create-phone-ledger";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import { useSpendByCategory } from "@waltning/client/ledger/use-spend-by-category";
import { useUnsettledBanner } from "@waltning/client/ledger/use-unsettled-banner";
import { useWhereItWent } from "@waltning/client/ledger/use-where-it-went";
import { accountingDate, shiftMonth, type YearMonth, yearMonth } from "@waltning/core/date";
import * as money from "@waltning/core/money";
import { SpendRows } from "@waltning/ui/dashboard/spend-rows";
import { monthLabel, weekdayLabel } from "@waltning/ui/i18n/locales";
import { useLocale, useT } from "@waltning/ui/i18n/provider";
import { Button } from "@waltning/ui/primitives/button";
import { Card } from "@waltning/ui/shell/card";
import { MonthSummary } from "@waltning/ui/shell/month-summary";
import { NetWorthStrip } from "@waltning/ui/shell/net-worth-strip";
import { TodayFrame } from "@waltning/ui/shell/today-frame";
import { UnsettledBanner } from "@waltning/ui/shell/unsettled-banner";
import { EmptyState } from "@waltning/ui/states/empty-state";
import { ErrorState } from "@waltning/ui/states/error-state";
import { Toast } from "@waltning/ui/states/toast";
import {
  TransactionList,
  type TransactionListItem,
} from "@waltning/ui/transactions/transaction-list";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { openUnsettled } from "./open-unsettled.ts";
import { appearance, PREVIEW_RESET_ENABLED } from "./platform";
import { PreviewAppearanceControls } from "./preview-appearance-controls";

function handleCreateAccount() {
  router.push({ pathname: "/account/new", params: { returnTo: "today" } });
}

function handlePreference(next: "system" | "light" | "dark") {
  return appearance.setPreference(next);
}

function handleShowAll() {
  router.push("/ledger");
}

/**
 * The empty ledger's one thing to do. The floating `+` reaches the same
 * route, but it is mounted by `(tabs)/_layout.tsx` above the whole slot and
 * an `EmptyState` requires an action of its own — so this is the same
 * destination named in the place the reader is already looking.
 */
function handleAddTransaction() {
  router.push("/quick-add");
}

/** C5: every Recent row opens S09 — the caller it returns to is this screen. */
function handleOpenTransaction(id: string) {
  router.push({ pathname: "/transaction/[id]", params: { id } });
}

/**
 * The replica's row shape onto the list's. Named rather than inline because
 * `architecture/11` bans a function expression inside JSX — and because this is
 * the one place the ledger's field names and the component's meet.
 */
function toRow(transaction: PhoneRecentTransaction): TransactionListItem {
  return {
    id: transaction.id,
    date: transaction.date,
    payee: transaction.payee,
    category: transaction.categoryName,
    account: transaction.accountName,
    amount: transaction.amount,
    currency: transaction.currency,
    decimals: transaction.decimals,
    isBusiness: transaction.isBusiness,
    brandKey: transaction.brandKey,
  };
}

/**
 * One screen for both surfaces. The ledger arrives through context — provided
 * at the app boundary from whichever platform module Metro resolved — so
 * nothing in this file knows whether the rows below it live in an iOS
 * document directory or an OPFS pool.
 *
 * **The floating add button is not wired here.** `(tabs)/_layout.tsx` mounts
 * it once, above the whole tab slot, so it survives a tab switch rather than
 * remounting with this screen — `onAdd`, `addDisabled` and the device's
 * `floatPosition` preference all moved with it.
 *
 * **S04's hero and period row (C2).** `snapshot.netWorth` is `money.netWorth`
 * (A1) per currency — `DualTotal` for the lead, stacked for the rest, exactly
 * `CurrencyTotals`' own stacking shape reused for a figure that needs no FX.
 * `FxStatusChip`/`CurrencyChip` are not rendered: there is no rate and no
 * display currency on the phone (arc-phone excludes FX entirely), and
 * `Shell`'s slots for them stay empty rather than filled with a chip that
 * would have nothing true to say. The period (which month is shown) is this
 * component's own state, never the store's — only *spent* and *net* move when
 * it steps; net worth is a balance as of now.
 */
export default function Today() {
  const t = useT();
  const locale = useLocale();
  const ledger = useLedgerController();
  // A label is a word, so the action cannot be a module constant any more —
  // `useT` is a hook. Memoised on `t` so the empty state is not handed a new
  // object on every render.
  const createAccountAction = useMemo(
    () => ({ label: t("routes.createAccount"), onPress: handleCreateAccount }),
    [t],
  );
  const addTransactionAction = useMemo(
    () => ({ label: t("shell.add"), onPress: handleAddTransaction }),
    [t],
  );
  // The ledger holds rows this screen's five-row window did not return — S10
  // is where they are, and *Show all* is already the Recent card's own way of
  // saying so. Existing copy, existing destination.
  const showAllAction = useMemo(() => ({ label: t("shell.showAll"), onPress: handleShowAll }), [t]);
  const snapshot = usePhoneLedger(ledger);
  const systemScheme = useColorScheme();
  const resolved = useAppearance(
    appearance,
    systemScheme === "light" || systemScheme === "dark" ? systemScheme : null,
  );
  const { message, nonce } = useLocalSearchParams<{ message?: string; nonce?: string }>();
  // A route param, not local state — but the screen can stay mounted across
  // two pushes that both carry the same `message` (delete two transactions
  // in a row from S09), and the router hands back a *new* params object
  // each time without `nonce` changing identity by itself. `nonce` is the
  // pushing screen's own `Date.now()` (`transaction-detail-screen.tsx`), so
  // comparing it to the last-seen value — during render, the endorsed
  // pattern for adjusting state from a changed prop — tells an arrival from
  // a re-render apart from a genuinely new push, even when the message text
  // repeats. `toastToken` re-arms `Toast`'s window (H1); `toastDismissed`
  // resets so the new arrival actually shows instead of staying dismissed
  // from the last one.
  const [lastNonce, setLastNonce] = useState(nonce);
  const [toastToken, setToastToken] = useState(1);
  const [toastDismissed, setToastDismissed] = useState(false);
  if (nonce !== lastNonce) {
    setLastNonce(nonce);
    setToastToken((token) => token + 1);
    setToastDismissed(false);
  }
  const handleDismissToast = useCallback(() => setToastDismissed(true), []);
  const hasAccounts = snapshot.accounts.length > 0;
  /**
   * **An empty Recent is not by itself a first run.** `snapshot.recent` is a
   * five-row window (`create-phone-ledger.ts` calls `listRecent(5)`), and a
   * window that came back empty is not the same claim as *this ledger has
   * never held a transaction* — the second is a count over the whole ledger,
   * and only the count may choose the `first-run` wording. S10 decides its own
   * empty the same way, through the same unfiltered `searchTransactions({})`.
   *
   * Asked for only when the empty state needs it — `ledger-screen.tsx`'s own
   * reason: an unfiltered count on every render is a second query nothing
   * else on this screen wants.
   */
  const everCaptured =
    hasAccounts && snapshot.recent.length === 0
      ? ledger.searchTransactions({}).total.count > 0
      : false;
  const handleReset = useCallback(() => ledger.reset(), [ledger]);
  // The error a failed refresh set stays on the snapshot until the next
  // success (`create-phone-ledger.ts`'s `refresh()`) — `ErrorState`'s action
  // asks for exactly that next attempt. Its own throw is for a caller that
  // awaits `refresh()`; Retry does not, and the failure it reports already
  // reached the snapshot before this handler runs again.
  const handleRetry = useCallback(() => {
    try {
      ledger.refresh();
    } catch {
      // See above — the snapshot already carries the new failure.
    }
  }, [ledger]);

  // The device's own calendar (§7.0a), the same call `quick-add-screen.tsx`
  // makes — `deviceRuntime` reads `Intl`/`Date` only, not a platform API.
  const today = deviceRuntime().capture().date;
  const currentMonth = yearMonth(today.slice(0, 7));
  /** The band's second line — the weekday and the day, under the word *Today*. */
  const todayLabel = weekdayLabel(today, locale);
  const [month, setMonth] = useState<YearMonth>(currentMonth);
  const handlePreviousMonth = useCallback(() => setMonth((current) => shiftMonth(current, -1)), []);
  const handleNextMonth = useCallback(() => setMonth((current) => shiftMonth(current, 1)), []);
  const handleToday = useCallback(() => setMonth(currentMonth), [currentMonth]);

  // Half-open — `money.Period`'s own shape — so the range needs no notion of
  // how many days the month has, only `shiftMonth`.
  const period = useMemo<money.Period>(
    () => ({
      start: accountingDate(`${month}-01`),
      end: accountingDate(`${shiftMonth(month, 1)}-01`),
    }),
    [month],
  );
  // A plain synchronous read, not an effect — the phone's SQLite has no
  // async boundary to wait on. `snapshot` is in the dependency array so a
  // write elsewhere (a save, a reset) recomputes this too: `refresh()`
  // always hands back a new snapshot object, never mutates the old one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: snapshot re-runs this by identity, not by being read.
  const periodSpendRows = useMemo(() => ledger.readPeriodSpend(period), [ledger, period, snapshot]);

  const leadNetWorth = snapshot.netWorth[0];
  const leadPeriodSpend = leadNetWorth
    ? periodSpendRows.find((row) => row.currency === leadNetWorth.currency)
    : undefined;

  const unsettledModel = useUnsettledBanner(snapshot.unsettledClearing);
  // S04 §3, Shared: "Tapping the unsettled banner goes straight to the
  // unallocated transaction, not to a list." Which of the two the model's
  // `openTarget` names — and the account fallback for an opening balance
  // that has no transaction to open — is `use-unsettled-banner.ts`'s
  // decision; `open-unsettled.ts` turns it into a route, for all three
  // screens that render this banner.
  const openTarget = unsettledModel?.openTarget ?? null;
  const handleOpenUnsettled = useCallback(() => {
    if (openTarget === null) return;
    openUnsettled(openTarget);
  }, [openTarget]);

  const handleOpenAccounts = useCallback(() => router.push("/accounts"), []);

  /**
   * The total, in a line. It led this screen as a 54pt hero in a band that
   * spent about 500pt of a 844pt phone on it — and a figure that moves slowly
   * is not what the app is opened to find out. The register it summarises is
   * one tap away, where every currency and the shared totals live.
   */
  const netWorthStrip = leadNetWorth ? (
    <NetWorthStrip
      mine={leadNetWorth.mine}
      ours={leadNetWorth.hasShared ? leadNetWorth.ours : null}
      currency={leadNetWorth.currency}
      decimals={leadNetWorth.decimals}
      otherCurrencies={snapshot.netWorth.length - 1}
      onPress={handleOpenAccounts}
    />
  ) : null;

  /** The hero, and §5's three figures in the shape `net = inflow − spend`. */
  const monthCard = leadNetWorth ? (
    <MonthSummary
      label={monthLabel(month, locale)}
      onPrevious={handlePreviousMonth}
      onNext={handleNextMonth}
      onToday={handleToday}
      isCurrent={month === currentMonth}
      spend={leadPeriodSpend?.spend ?? money.ZERO}
      inflow={leadPeriodSpend?.inflow ?? money.ZERO}
      net={leadPeriodSpend?.net ?? money.ZERO}
      currency={leadNetWorth.currency}
      decimals={leadNetWorth.decimals}
    />
  ) : null;

  /**
   * §6, ranked and named by `useWhereItWent`. `"all"` rather than a scope
   * control: S04 has none, and the figures above it — the total, the month —
   * are unscoped too, so a breakdown that quietly excluded the business half
   * would not add up to the *went out* directly above it.
   */
  // Memoised so `useWhereItWent`'s own memo is not invalidated by a fresh
  // object every render — the labels change with the language, nothing else.
  const whereItWentLabels = useMemo(
    () => ({ uncategorized: t("dashboard.uncategorized"), other: t("dashboard.other") }),
    [t],
  );
  const spendByCategory = useSpendByCategory(ledger, period, "all", snapshot.revision);
  const whereItWentRows = useWhereItWent(
    spendByCategory,
    snapshot.categoryTree,
    leadNetWorth?.currency,
    whereItWentLabels,
  );
  const whereItWent =
    whereItWentRows.length === 0 || leadNetWorth === undefined ? null : (
      <Card title={t("shell.whereItWent")}>
        <SpendRows
          rows={whereItWentRows}
          currency={leadNetWorth.currency}
          decimals={leadNetWorth.decimals}
        />
      </Card>
    );

  // S04 §3 draws exactly one banner row, and `Banner`'s own doc is explicit —
  // "page-level, one tone, one action." A second (or third) unsettled
  // clearing account does not stack a second alert; it folds into this one's
  // text as a count. `Open` still lands on the first (`unsettled` above),
  // the same account the message names.
  //
  // The derivation and the wording moved out at `S01`'s third use — the model
  // is `packages/client`'s, the words are `packages/ui`'s, and this screen
  // keeps only the route `Open` lands on, which is the app's own.
  const unsettledBanner = <UnsettledBanner model={unsettledModel} onOpen={handleOpenUnsettled} />;

  // Error > empty > populated. An error keeps the hero (`snapshot`'s other
  // fields are untouched by a failed refresh, S04 §6) and replaces only the
  // ground panel's body — never the account list, which a query failure did
  // not touch.
  const ledgerBody = snapshot.error ? (
    <ErrorState
      variant="recoverable"
      what={t("shell.balanceQueryFailed")}
      why={t("shell.balanceQueryFailedBody")}
      action={{ label: t("common.retry"), onPress: handleRetry }}
    />
  ) : hasAccounts ? (
    <>
      {unsettledBanner}
      {/*
        S04 §3 — the card *is* the group of Recent rows, so with no rows there
        is no group to draw, and *Show all* has nothing to show. What replaces
        it depends on the count, never on the window: an account exists and the
        ledger has never held a transaction is `first-run` for the ledger, not
        for the account list; a ledger that holds rows the window did not
        return is the ordinary empty. Both render on the ground
        (`design-system/05` §5.1). The first-run pair is S10's own, unchanged —
        the ledger is empty is the same fact on both screens. The ordinary one
        is this screen's own (`transactions.emptyRecent*`, S04 §6): S10's says
        a filter is excluding every row, and Recent has no filter to blame — it
        has a five-row window, and *Show all* goes where the rows are.
      */}
      {snapshot.recent.length === 0 ? (
        everCaptured ? (
          <EmptyState
            variant="filtered"
            title={t("transactions.emptyRecentTitle")}
            body={t("transactions.emptyRecentBody")}
            primaryAction={showAllAction}
          />
        ) : (
          <EmptyState
            variant="first-run"
            title={t("transactions.emptyFirstRunTitle")}
            body={t("transactions.emptyFirstRunBody")}
            primaryAction={addTransactionAction}
          />
        )
      ) : (
        <Card
          title={t("shell.recent")}
          action={
            <Button label={t("shell.showAll")} onPress={handleShowAll} variant="ghost" size="sm" />
          }
        >
          <TransactionList
            transactions={snapshot.recent.map(toRow)}
            onPress={handleOpenTransaction}
          />
        </Card>
      )}
      {whereItWent}
    </>
  ) : (
    <EmptyState
      variant="first-run"
      title={t("shell.noAccounts")}
      body={t("shell.noAccountsBody")}
      primaryAction={createAccountAction}
    />
  );
  const body = (
    <>
      {typeof message === "string" && !toastDismissed ? (
        <Toast message={message} onDismiss={handleDismissToast} token={toastToken} />
      ) : null}
      {/*
        Above the error branch, not inside the populated one. S04 §6: a failed
        refresh leaves `snapshot`'s other fields untouched, so the figures it
        did not touch stay on screen and only the part that failed is replaced.
        They were in the band when the band held a hero, which got this for
        free; on the ground it has to be said. With no accounts both are
        `null`, so the first run is unaffected.
      */}
      {netWorthStrip}
      {monthCard}
      {ledgerBody}
    </>
  );

  return (
    <TodayFrame
      appearanceAction={
        <PreviewAppearanceControls
          preference={resolved.preference}
          resetEnabled={PREVIEW_RESET_ENABLED}
          onPreference={handlePreference}
          onReset={handleReset}
        />
      }
      date={todayLabel}
      body={body}
    />
  );
}
