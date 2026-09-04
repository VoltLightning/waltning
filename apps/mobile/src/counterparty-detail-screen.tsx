/**
 * S13 · Counterparty detail — one person's full position, across every
 * currency at once.
 *
 * **Settle opens `SettleSheet`** (E5, `packages/ui/src/counterparties/`,
 * S14) — this screen is the one place that assembles a `SettleDebtDraft` and
 * the one place that ever calls `readCrossRate` for it (`counterparties/` may
 * not import `transactions/`, and neither may import `client` —
 * `architecture/11`), exactly the split `transfer-screen.tsx` already draws
 * for its own keypad-driven sheet.
 *
 * **No stale-balance stamp yet.** S14 §6 wants every Discharges row carrying
 * its own "as of" mark once the checkpoint is older than the session — this
 * screen has no source for that timestamp today (`listCounterpartyBalances`
 * carries none, and nothing else in `packages/client` tracks a last-sync
 * moment), so `stale` is always `false` here. A real offline stamp is a
 * follow-up, not invented on this screen.
 *
 * **History defaults to `debt` rows** (S13 §3) — the toggle states the count
 * it is hiding, the same rule S10's own filtered `EmptyState` follows
 * (`design-system/08` §8.1): a default filter that silently omits real data
 * is the failure mode, and naming the count is the cheapest guard against it.
 *
 * **Unmerge is a row under history, not a sheet.** S15 §9.2's merge is
 * reversible; a live merge into this counterparty (`listCounterpartyMerges`)
 * gets one line naming the absorbed record and how many rows moved, with an
 * inline undo — the lighter of the two shapes the plan offers, since there
 * is nothing here that needs a sheet's own confirmation step.
 */

import {
  groupByCounterparty,
  makeRateOf,
  resolveCounterpartyFigures,
  settleResidualDirection,
} from "@waltning/client/counterparties/counterparty-figures";
import type {
  PhoneCapturableAccount,
  PhoneSearchTransaction,
} from "@waltning/client/ledger/create-phone-ledger";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { useCounterpartyHistory } from "@waltning/client/ledger/use-counterparty-history";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import { type FieldError, mapFieldErrors } from "@waltning/client/transport/field-errors";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { AccountPicker, type AccountPickerAccount } from "@waltning/ui/accounts/account-picker";
import { BalanceLedger } from "@waltning/ui/counterparties/balance-ledger";
import { CounterpartyCard } from "@waltning/ui/counterparties/counterparty-card";
import { SettleSheet, type SettleSheetField } from "@waltning/ui/counterparties/settle-sheet";
import { parseAmount } from "@waltning/ui/fx/amount-field";
import { decimalMark } from "@waltning/ui/i18n/locales";
import { useLocale, useT } from "@waltning/ui/i18n/provider";
import { Button } from "@waltning/ui/primitives/button";
import { Card, GroundPanel } from "@waltning/ui/shell/card";
import { EmptyState } from "@waltning/ui/states/empty-state";
import { ErrorState } from "@waltning/ui/states/error-state";
import { Skeleton } from "@waltning/ui/states/skeleton";
import { Toast } from "@waltning/ui/states/toast";
import { text } from "@waltning/ui/theme/fonts";
import { makeStyles } from "@waltning/ui/theme/styles";
import { space } from "@waltning/ui/tokens";
import { applyKey } from "@waltning/ui/transactions/amount-keys";
import { Keypad, type KeypadKey } from "@waltning/ui/transactions/keypad";
import { TransactionRow } from "@waltning/ui/transactions/transaction-row";
import { TransferRow } from "@waltning/ui/transactions/transfer-row";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";

/** `settle_debt`'s own field paths (`registry/inputs.ts`) — everything else lands at form level. */
const SETTLE_KNOWN_PATHS = [
  "counterpartyId",
  "accountId",
  "date",
  "amount",
  "currency",
  "discharges.currency",
  "discharges.amount",
  "note",
];

type HistoryRowProps = {
  row: PhoneSearchTransaction;
  onPress: (id: string) => void;
};

function HistoryRow({ row, onPress }: HistoryRowProps) {
  const t = useT();
  const handlePress = useCallback(() => onPress(row.id), [onPress, row.id]);
  const roleTag =
    row.counterpartyRole && row.counterpartyRole !== "debt"
      ? t(`counterparties.role.${row.counterpartyRole}`)
      : undefined;

  if (row.type === "transfer" && row.toAccountName && row.toAmount && row.toCurrency) {
    return (
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
    );
  }
  return (
    <TransactionRow
      date={row.date}
      payee={row.payee}
      category={row.categoryName}
      amount={row.amount}
      currency={row.currency}
      decimals={row.decimals}
      type={row.type}
      isBusiness={row.isBusiness}
      {...(roleTag === undefined ? {} : { roleTag })}
      onPress={handlePress}
    />
  );
}

type MergeRowProps = {
  mergeId: string;
  loserName: string;
  movedCount: number;
  onUnmerge: (mergeId: string) => void;
};

/** One live merge into this counterparty — its own row, its own bound handler. */
function MergeRow({ mergeId, loserName, movedCount, onUnmerge }: MergeRowProps) {
  const t = useT();
  const styles = useStyles();
  const handleUnmerge = useCallback(() => onUnmerge(mergeId), [mergeId, onUnmerge]);
  return (
    <View style={styles.mergeRow}>
      <Text style={styles.mergeText}>
        {t("counterparties.mergedInto", { name: loserName, count: movedCount })}
      </Text>
      <Button label={t("counterparties.unmerge")} onPress={handleUnmerge} variant="ghost" />
    </View>
  );
}

/** The replica's account onto `AccountPicker`'s own choice shape — grouped, kind-ordered, S16 §3, `transfer-screen.tsx`'s own `toPickerChoice` matched rather than shared. */
function toPickerChoice(account: PhoneCapturableAccount): AccountPickerAccount {
  return {
    id: account.id,
    name: account.name,
    currency: account.currency,
    decimals: account.decimals,
    kind: account.kind,
    capturable: account.capturable,
    ownership: account.ownership,
    groupId: account.groupId,
    archived: account.archived,
  };
}

/**
 * The escape to account creation — unlike `quick-add-screen.tsx`'s, this
 * settle draft has no restorable route shape (`parseNewAccountRoute` only
 * carries `quick-add`'s own amount/account pair), so creating an account
 * mid-settle lands on the accounts list rather than resuming this draft —
 * the same gap `transfer-screen.tsx`'s own escape names.
 */
function handleCreateAccountFromCounterparty() {
  router.push({ pathname: "/account/new", params: { returnTo: "accounts" } });
}

/**
 * `settle_debt`'s two refusals (`settleDebtRefusal`, `create-phone-ledger.ts`),
 * resolved through `useT()` the same way `quick-add-screen.tsx`'s own
 * `resolveFieldErrorMessage` handles `transactions.needsRate` — it cannot call
 * the hook itself (`packages/client` is not a component).
 */
function resolveSettleFieldErrorMessage(t: ReturnType<typeof useT>, error: FieldError): string {
  if (error.messageKey === "settleDebt.noCounterparty") {
    return t("settleDebt.noCounterparty");
  }
  if (error.messageKey === "settleDebt.nothingToSettle") {
    return t("settleDebt.nothingToSettle");
  }
  return error.message;
}

export default function CounterpartyDetail() {
  const t = useT();
  const styles = useStyles();
  const mark = decimalMark(useLocale());
  const ledger = useLedgerController();
  const snapshot = usePhoneLedger(ledger);
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const today = deviceRuntime().capture().date;
  const [showAllRows, setShowAllRows] = useState(false);
  const [unmergeToast, setUnmergeToast] = useState(false);
  const [settledToastMessage, setSettledToastMessage] = useState<string | null>(null);

  const [settleVisible, setSettleVisible] = useState(false);
  const [settleAmountRaw, setSettleAmountRaw] = useState("");
  const [settleDischargesCurrency, setSettleDischargesCurrency] = useState<string | null>(null);
  const [settleDischargesRaw, setSettleDischargesRaw] = useState("");
  const [settleActiveField, setSettleActiveField] = useState<SettleSheetField>("amount");
  const [settleAccountId, setSettleAccountId] = useState<string | null>(null);
  const [settleNote, setSettleNote] = useState("");
  const [settleFieldErrors, setSettleFieldErrors] = useState<ReturnType<typeof mapFieldErrors>>();
  // `AccountPicker` (`accounts/`) is a sibling domain — `counterparties/` may
  // not import it, so this screen opens it, the same split `transfer-screen.tsx`
  // already draws for its own keypad-driven sheet.
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);

  // H1 — at least one `refresh()` has completed, success or failure. Gates
  // the loading branch below, which must render before anything derived from
  // `pivot`/`figures` is asked to stand in for "nothing is open".
  const hydrated = snapshot.revision > 0;

  const counterparty =
    snapshot.counterparties.find((candidate) => candidate.id === rawId) ??
    snapshot.archivedCounterparties.find((candidate) => candidate.id === rawId);

  const balances = useMemo(() => ledger.listCounterpartyBalances(today), [ledger, today]);
  const pivot = snapshot.currencies.find((currency) => currency.isPivot)?.code;
  const group = useMemo(
    () => groupByCounterparty(balances).find((candidate) => candidate.counterpartyId === rawId),
    [balances, rawId],
  );
  const figures = useMemo(() => {
    if (!pivot) return null;
    const rateOf = makeRateOf(ledger.readRate, pivot, today);
    const settlementCurrency =
      group?.settlementCurrency ?? counterparty?.settlementCurrency ?? null;
    return resolveCounterpartyFigures(
      { settlementCurrency, balances: group?.balances ?? [] },
      pivot,
      rateOf,
      snapshot.currencies,
    );
  }, [counterparty?.settlementCurrency, group, ledger.readRate, pivot, snapshot.currencies, today]);

  // M2 — memoised on `[ledger, counterpartyId, revision]`; previously two
  // unmemoised `searchTransactions` calls in this render body, re-run on
  // every keystroke into the settle sheet's keypad.
  const { debtHistory, everyHistory } = useCounterpartyHistory(ledger, rawId, snapshot.revision);
  const otherCount = everyHistory.total.count - debtHistory.total.count;
  const historyRows = showAllRows ? everyHistory.rows : debtHistory.rows;

  // S13's overflow — every merge still live into this record (S15 §9.2).
  const merges = rawId ? ledger.listCounterpartyMerges(id<"counterparties">(rawId)) : [];

  // The sheet's own account labels (name + currency, for the Chip and the
  // AmountField's own currency) — every account, uncapturable ones included:
  // `AccountPicker` (below) is what actually offers the choice now (S14 §3),
  // and it never hides one (S05).
  const settleAccounts = useMemo(
    () =>
      snapshot.accounts.map((account) => ({
        id: account.id,
        name: account.name,
        currency: account.currency,
      })),
    [snapshot.accounts],
  );
  const settleAccount = settleAccounts.find((account) => account.id === settleAccountId);
  // `AccountPicker` (`accounts/`) is a sibling domain — the same rule
  // `transfer-screen.tsx` already draws for its own two-leg picker.
  const settlePickerAccounts = useMemo(
    () => snapshot.accounts.map(toPickerChoice),
    [snapshot.accounts],
  );
  const settlePickerGroups = useMemo(
    () => snapshot.groups.map((accountGroup) => ({ id: accountGroup.id, name: accountGroup.name })),
    [snapshot.groups],
  );
  // Decimals live on the snapshot's own account, not `SettleSheetAccount`
  // (a plain `{id, name, currency}` shape the sheet itself declares).
  const settleAccountDecimals =
    snapshot.accounts.find((account) => account.id === settleAccountId)?.decimals ?? 2;
  const settleDischargesDecimals =
    group?.balances.find((row) => row.currency === settleDischargesCurrency)?.decimals ?? 2;

  // §6 — the reference rate for the picked pair, or `undefined` offline with
  // nothing held: the same shape `transfer-screen.tsx`'s own `referenceRate`
  // takes, `readCrossRate`'s pivot leg making same-currency pairs trivial too.
  const settleReferenceRate = useMemo(() => {
    if (settleDischargesCurrency === null || settleAccount === undefined) return undefined;
    const result = ledger.readCrossRate({
      from: money.currencyCode(settleDischargesCurrency),
      to: settleAccount.currency,
      date: today,
    });
    if (result === null) return undefined;
    return { rate: result.rate, source: result.source, date: result.asOf };
  }, [ledger, settleDischargesCurrency, settleAccount, today]);

  const handleToggleHistory = useCallback(() => setShowAllRows((current) => !current), []);
  const handleOpenRow = useCallback((transactionId: string) => {
    router.push({ pathname: "/transaction/[id]", params: { id: transactionId } });
  }, []);
  const handleOpenSettle = useCallback(() => {
    // S14 §9.1 — defaulted to the counterparty's own settlement currency, a
    // suggestion the picker shows past rather than a guess.
    const defaultCurrency =
      group?.balances.find((row) => row.currency === figures?.currency)?.currency ??
      group?.balances[0]?.currency ??
      null;
    setSettleAmountRaw("");
    setSettleDischargesCurrency(defaultCurrency);
    setSettleDischargesRaw("");
    setSettleActiveField("amount");
    setSettleAccountId(null);
    setSettleNote("");
    setSettleFieldErrors(undefined);
    setSettleVisible(true);
  }, [group, figures]);
  const handleDismissSettle = useCallback(() => setSettleVisible(false), []);
  const handleOpenAccountPicker = useCallback(() => setAccountPickerOpen(true), []);
  const handleDismissAccountPicker = useCallback(() => setAccountPickerOpen(false), []);
  const handlePickAccount = useCallback((accountId: string) => {
    setSettleAccountId(accountId);
    setAccountPickerOpen(false);
  }, []);
  const handleDismissSettledToast = useCallback(() => setSettledToastMessage(null), []);
  const handleDismissUnmergeToast = useCallback(() => setUnmergeToast(false), []);
  const handleSettleKey = useCallback(
    (key: KeypadKey) => {
      if (settleActiveField === "amount") {
        setSettleAmountRaw((current) => applyKey(current, key, settleAccountDecimals));
        return;
      }
      setSettleDischargesRaw((current) => applyKey(current, key, settleDischargesDecimals));
    },
    [settleActiveField, settleAccountDecimals, settleDischargesDecimals],
  );
  const handleSettleSave = useCallback(() => {
    if (!rawId || settleAccountId === null || settleDischargesCurrency === null) return;
    const account = settleAccounts.find((candidate) => candidate.id === settleAccountId);
    const parsedAmount = parseAmount(settleAmountRaw);
    const parsedDischarges = parseAmount(settleDischargesRaw);
    if (account === undefined || parsedAmount === null || parsedDischarges === null) return;

    const result = ledger.settleDebt({
      counterpartyId: rawId,
      accountId: settleAccountId,
      date: today,
      amount: parsedAmount,
      currency: account.currency,
      dischargesCurrency: settleDischargesCurrency,
      dischargesAmount: parsedDischarges,
      note: settleNote,
      categoryId: null,
    });
    if (!("id" in result)) {
      const resolved = result.fieldErrors.map((error) => ({
        path: error.path,
        message: resolveSettleFieldErrorMessage(t, error),
      }));
      setSettleFieldErrors(mapFieldErrors(resolved, SETTLE_KNOWN_PATHS));
      return;
    }
    setSettleFieldErrors(undefined);
    setSettleVisible(false);

    // P5 — the residual named in words, never a bare sign.
    const direction = t(
      `counterparties.${settleResidualDirection(result.residual, settleDischargesDecimals)}`,
    );
    setSettledToastMessage(
      t("counterparties.settledToast", {
        amount: money.forDisplay(money.abs(result.residual), settleDischargesDecimals, mark),
        currency: settleDischargesCurrency,
        direction,
      }),
    );
  }, [
    rawId,
    settleAccountId,
    settleAccounts,
    settleAmountRaw,
    settleDischargesCurrency,
    settleDischargesRaw,
    settleDischargesDecimals,
    settleNote,
    ledger,
    today,
    t,
    mark,
  ]);
  const handleUnmerge = useCallback(
    (mergeId: string) => {
      const result = ledger.unmergeCounterparties({ mergeId });
      if ("id" in result) setUnmergeToast(true);
    },
    [ledger],
  );
  const handleAddTransaction = useCallback(() => {
    if (!rawId) return;
    router.push({ pathname: "/quick-add", params: { counterpartyId: rawId } });
  }, [rawId]);
  const handleEdit = useCallback(() => {
    if (!rawId) return;
    router.push(`/counterparty/${rawId}/edit`);
  }, [rawId]);

  if (snapshot.error) {
    return (
      <GroundPanel>
        <ErrorState
          variant="recoverable"
          what={t("counterparties.loadFailedTitle")}
          why={t("counterparties.loadFailedWhy")}
          action={{ label: t("common.retry"), onPress: ledger.refresh }}
        />
      </GroundPanel>
    );
  }

  // H1 — S13 §6's own loading state ("Skeleton ledger rows"), never the
  // `return null` an unresolved `pivot`/`figures` would otherwise fall
  // through to on the very first render.
  if (!hydrated) {
    return (
      <GroundPanel>
        <Card>
          <Skeleton shape="hero" label={t("counterparties.loadingLedger")} />
          <Skeleton shape="row" label={t("counterparties.loadingLedger")} />
          <Skeleton shape="row" label={t("counterparties.loadingLedger")} />
        </Card>
      </GroundPanel>
    );
  }

  if (!counterparty || !figures) return null;

  return (
    <GroundPanel>
      <Card>
        <CounterpartyCard
          name={counterparty.name}
          kind={counterparty.kind}
          settlementCurrency={figures.currency}
          {...(counterparty.kind === "company" && group?.ageDays != null && group.ageBucket != null
            ? { ageing: { ageDays: group.ageDays, bucket: group.ageBucket } }
            : {})}
        />
        <BalanceLedger
          rows={group?.balances ?? []}
          settlementCurrency={figures.currency}
          settlementNet={figures.value}
          settlementDecimals={figures.decimals}
          display={figures.display}
        />
        <View style={styles.actions}>
          <Button label={t("counterparties.settle")} onPress={handleOpenSettle} variant="primary" />
          <Button
            label={t("counterparties.addTransaction")}
            onPress={handleAddTransaction}
            variant="secondary"
          />
        </View>
      </Card>

      {merges.map((merge) => (
        <MergeRow
          key={merge.mergeId}
          mergeId={merge.mergeId}
          loserName={merge.loserName}
          movedCount={merge.movedCount}
          onUnmerge={handleUnmerge}
        />
      ))}

      <View style={styles.historyHeader}>
        <Text style={styles.historyTitle}>{t("counterparties.history")}</Text>
        <Button
          label={
            showAllRows
              ? t("counterparties.allRowsToggle")
              : t("counterparties.debtsOnlyToggle", { count: otherCount })
          }
          onPress={handleToggleHistory}
          variant="ghost"
        />
      </View>

      {historyRows.length === 0 ? (
        <EmptyState
          variant="range"
          title={t("counterparties.emptySettledTitle")}
          body={t("counterparties.emptySettledBody")}
          primaryAction={{
            label: t("counterparties.addTransaction"),
            onPress: handleAddTransaction,
          }}
        />
      ) : (
        <ScrollView>
          {historyRows.map((row) => (
            <HistoryRow key={row.id} row={row} onPress={handleOpenRow} />
          ))}
        </ScrollView>
      )}

      <Button label={t("common.edit")} onPress={handleEdit} variant="ghost" />

      <SettleSheet
        visible={settleVisible}
        counterpartyName={counterparty.name}
        balances={group?.balances ?? []}
        accounts={settleAccounts}
        amountRaw={settleAmountRaw}
        dischargesCurrency={settleDischargesCurrency}
        onDischargesCurrencyChange={setSettleDischargesCurrency}
        dischargesRaw={settleDischargesRaw}
        activeField={settleActiveField}
        onActiveFieldChange={setSettleActiveField}
        accountId={settleAccountId}
        onOpenAccountPicker={handleOpenAccountPicker}
        {...(settleReferenceRate ? { referenceRate: settleReferenceRate } : {})}
        note={settleNote}
        onNoteChange={setSettleNote}
        stale={false}
        keypad={<Keypad onKey={handleSettleKey} />}
        onDismiss={handleDismissSettle}
        onSettle={handleSettleSave}
        {...(settleFieldErrors === undefined ? {} : { fieldErrors: settleFieldErrors })}
      />

      <AccountPicker
        visible={accountPickerOpen}
        accounts={settlePickerAccounts}
        groups={settlePickerGroups}
        accountId={settleAccountId}
        onPick={handlePickAccount}
        onCreateAccount={handleCreateAccountFromCounterparty}
        onDismiss={handleDismissAccountPicker}
      />

      {settledToastMessage === null ? null : (
        <Toast message={settledToastMessage} onDismiss={handleDismissSettledToast} />
      )}
      {unmergeToast ? (
        <Toast message={t("counterparties.unmergeToast")} onDismiss={handleDismissUnmergeToast} />
      ) : null}
    </GroundPanel>
  );
}

const useStyles = makeStyles((theme) => ({
  actions: { flexDirection: "row", gap: space.xl, paddingTop: space.xl },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: space.x4,
  },
  historyTitle: { color: theme.textMuted, ...text.ui("kicker") },
  mergeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    paddingTop: space.md,
  },
  mergeText: { flexShrink: 1, color: theme.textMuted, ...text.ui("caption") },
}));
