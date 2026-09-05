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
import { Toast } from "@waltning/ui/states/toast";
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
  const styles = useStyles();
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
  // S04 §3, Shared: "Tapping the unsettled banner goes straight to the
  // unallocated transaction, not to a list." Falls back to the filtered
  // ledger only when no oldest leg is on hand — never observed once §8's
  // FIFO fold runs (a non-zero clearing balance always has one), but a
  // fixture-fed port might still hand one back without it.
  const handleOpenUnsettled = useCallback(() => {
    if (!unsettled) return;
    if (unsettled.oldestUnconsumedTransactionId) {
      router.push({
        pathname: "/transaction/[id]",
        params: { id: unsettled.oldestUnconsumedTransactionId },
      });
      return;
    }
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
  // §8's third field is what lets this name a transaction rather than a
  // number — used only once a payee is actually on hand; an unpayeed leg
  // (or a fixture that never set one) falls back to naming the account,
  // exactly as before this card.
  const unsettledPayee = unsettled?.oldestUnconsumedPayee;
  // H2 — the oldest unconsumed entry can be the account's own opening
  // balance rather than a transaction; that entry never has a payee, so it
  // gets its own message instead of falling back to the generic one.
  const unsettledIsOpening = unsettled != null && unsettled.oldestUnconsumedTransactionId === null;
  const unsettledRemainder =
    unsettled?.oldestUnconsumedRemainder ?? unsettled?.balance ?? money.ZERO;
  // H3 — more than one entry can still be open at once; the oldest one's own
  // remainder can be less than the whole account balance, and showing the
  // balance beside its payee would overstate what that leg accounts for.
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
        (`design-system/05` §5.1), in the wording S10's own two empties already
        use. No new copy — the same lines, one screen earlier.
      */}
      {snapshot.recent.length === 0 ? (
        everCaptured ? (
          <EmptyState
            variant="filtered"
            title={t("transactions.emptyFilteredTitle")}
            body={t("transactions.emptyFilteredBody")}
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
