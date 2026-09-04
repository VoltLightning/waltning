import { useAppearance } from "@waltning/client/appearance/use-appearance";
import type { PhoneRecentTransaction } from "@waltning/client/ledger/create-phone-ledger";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import { accountingDate, shiftMonth, type YearMonth, yearMonth } from "@waltning/core/date";
import * as money from "@waltning/core/money";
import { decimalMark, monthLabel } from "@waltning/ui/i18n/locales";
import { useLocale, useT } from "@waltning/ui/i18n/provider";
import { Button } from "@waltning/ui/primitives/button";
import { Card } from "@waltning/ui/shell/card";
import { DualTotal } from "@waltning/ui/shell/dual-total";
import { PeriodHeader } from "@waltning/ui/shell/period-header";
import { StatTile } from "@waltning/ui/shell/stat-tile";
import { TodayFrame } from "@waltning/ui/shell/today-frame";
import { Banner } from "@waltning/ui/states/banner";
import { EmptyState } from "@waltning/ui/states/empty-state";
import { ErrorState } from "@waltning/ui/states/error-state";
import { text } from "@waltning/ui/theme/fonts";
import { makeStyles } from "@waltning/ui/theme/styles";
import { space } from "@waltning/ui/tokens";
import {
  TransactionList,
  type TransactionListItem,
} from "@waltning/ui/transactions/transaction-list";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Text, useColorScheme, View } from "react-native";
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
  const styles = useStyles();
  const ledger = useLedgerController();
  // A label is a word, so the action cannot be a module constant any more —
  // `useT` is a hook. Memoised on `t` so the empty state is not handed a new
  // object on every render.
  const createAccountAction = useMemo(
    () => ({ label: t("routes.createAccount"), onPress: handleCreateAccount }),
    [t],
  );
  const snapshot = usePhoneLedger(ledger);
  const systemScheme = useColorScheme();
  const resolved = useAppearance(
    appearance,
    systemScheme === "light" || systemScheme === "dark" ? systemScheme : null,
  );
  const { message } = useLocalSearchParams<{ message?: string }>();
  const hasAccounts = snapshot.accounts.length > 0;
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
  const currentMonth = yearMonth(deviceRuntime().capture().date.slice(0, 7));
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

  const unsettled = snapshot.unsettledClearing[0];
  const handleOpenUnsettled = useCallback(() => {
    if (!unsettled) return;
    router.push({ pathname: "/ledger", params: { account: unsettled.accountId } });
  }, [unsettled]);

  const hero = (
    <View style={styles.heroStack}>
      {snapshot.netWorth.map((entry, index) => (
        <DualTotal
          key={entry.currency}
          mine={entry.mine}
          ours={entry.hasShared ? entry.ours : null}
          currency={entry.currency}
          decimals={entry.decimals}
          lead={index === 0}
        />
      ))}
      {snapshot.netWorth.length > 1 ? (
        <Text style={styles.heldSeparately}>{t("shell.heldSeparately")}</Text>
      ) : null}
    </View>
  );

  const periodRow = leadNetWorth ? (
    <View style={styles.periodRow}>
      <PeriodHeader
        label={monthLabel(month, locale)}
        onPrevious={handlePreviousMonth}
        onNext={handleNextMonth}
        onToday={handleToday}
        isCurrent={month === currentMonth}
      />
      <View style={styles.statRow}>
        <StatTile
          label={t("shell.spent")}
          value={leadPeriodSpend?.spend ?? money.ZERO}
          currency={leadNetWorth.currency}
          decimals={leadNetWorth.decimals}
          kind="spend"
        />
        <StatTile
          label={t("shell.net")}
          value={leadPeriodSpend?.net ?? money.ZERO}
          currency={leadNetWorth.currency}
          decimals={leadNetWorth.decimals}
        />
      </View>
    </View>
  ) : null;

  // S04 §3 draws exactly one banner row, and `Banner`'s own doc is explicit —
  // "page-level, one tone, one action." A second (or third) unsettled
  // clearing account does not stack a second alert; it folds into this one's
  // text as a count. `Open` still lands on the first (`unsettled` above),
  // the same account the message names.
  const unsettledMore = snapshot.unsettledClearing.length - 1;
  const unsettledBanner = unsettled ? (
    <Banner
      tone="warn"
      message={t(unsettledMore > 0 ? "shell.unsettledMore" : "shell.unsettled", {
        amount: money.forDisplay(unsettled.balance, unsettled.decimals, decimalMark(locale)),
        currency: unsettled.currency,
        account: unsettled.name,
        count: unsettledMore,
      })}
      action={{ label: t("shell.unsettledOpen"), onPress: handleOpenUnsettled }}
    />
  ) : null;

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
      <Card
        title={t("shell.recent")}
        action={
          <Button label={t("shell.showAll")} onPress={handleShowAll} variant="ghost" size="sm" />
        }
      >
        <TransactionList transactions={snapshot.recent.map(toRow)} />
      </Card>
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
      {typeof message === "string" ? <Card title={message}>{null}</Card> : null}
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
      total={hero}
      periodRow={periodRow}
      body={body}
    />
  );
}

const useStyles = makeStyles((theme) => ({
  heroStack: { gap: space.md },
  heldSeparately: { color: theme.shellTextMuted, ...text.ui("caption") },
  periodRow: { gap: space.x3 },
  statRow: { flexDirection: "row", gap: space.x5 },
}));
