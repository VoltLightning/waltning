/**
 * S13 · Counterparty detail — one person's full position, across every
 * currency at once.
 *
 * **Settle routes to a `Toast` naming it, until E5 merges.** `SettleSheet` is
 * E5's own component (the wave-4-shared plan, S14/S31) — this screen wires
 * the primary action to the real place it will open once that PR lands, and
 * says so on screen rather than hiding the button.
 *
 * **History defaults to `debt` rows** (S13 §3) — the toggle states the count
 * it is hiding, the same rule S10's own filtered `EmptyState` follows
 * (`design-system/08` §8.1): a default filter that silently omits real data
 * is the failure mode, and naming the count is the cheapest guard against it.
 */

import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import type { PhoneSearchTransaction } from "@waltning/client/ledger/create-phone-ledger";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import { BalanceLedger } from "@waltning/ui/counterparties/balance-ledger";
import { CounterpartyCard } from "@waltning/ui/counterparties/counterparty-card";
import { useT } from "@waltning/ui/i18n/provider";
import { Button } from "@waltning/ui/primitives/button";
import { Card, GroundPanel } from "@waltning/ui/shell/card";
import { EmptyState } from "@waltning/ui/states/empty-state";
import { ErrorState } from "@waltning/ui/states/error-state";
import { Toast } from "@waltning/ui/states/toast";
import { text } from "@waltning/ui/theme/fonts";
import { makeStyles } from "@waltning/ui/theme/styles";
import { space } from "@waltning/ui/tokens";
import { TransactionRow } from "@waltning/ui/transactions/transaction-row";
import { TransferRow } from "@waltning/ui/transactions/transfer-row";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { groupByCounterparty, makeRateOf, resolveCounterpartyFigures } from "@waltning/client/counterparties/counterparty-figures";

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

export default function CounterpartyDetail() {
  const t = useT();
  const styles = useStyles();
  const ledger = useLedgerController();
  const snapshot = usePhoneLedger(ledger);
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const today = deviceRuntime().capture().date;
  const [showAllRows, setShowAllRows] = useState(false);
  const [settleToast, setSettleToast] = useState(false);

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
    const settlementCurrency = group?.settlementCurrency ?? counterparty?.settlementCurrency ?? null;
    return resolveCounterpartyFigures(
      { settlementCurrency, balances: group?.balances ?? [] },
      pivot,
      rateOf,
    );
  }, [counterparty?.settlementCurrency, group, ledger.readRate, pivot, today]);

  const debtHistory = ledger.searchTransactions({ counterpartyId: rawId, counterpartyRole: "debt" });
  const everyHistory = ledger.searchTransactions({ counterpartyId: rawId });
  const otherCount = everyHistory.total.count - debtHistory.total.count;
  const historyRows = showAllRows ? everyHistory.rows : debtHistory.rows;

  const handleToggleHistory = useCallback(() => setShowAllRows((current) => !current), []);
  const handleOpenRow = useCallback((transactionId: string) => {
    router.push({ pathname: "/transaction/[id]", params: { id: transactionId } });
  }, []);
  const handleOpenSettle = useCallback(() => setSettleToast(true), []);
  const handleDismissSettleToast = useCallback(() => setSettleToast(false), []);
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
          primaryAction={{ label: t("counterparties.addTransaction"), onPress: handleAddTransaction }}
        />
      ) : (
        <ScrollView>
          {historyRows.map((row) => (
            <HistoryRow key={row.id} row={row} onPress={handleOpenRow} />
          ))}
        </ScrollView>
      )}

      <Button label={t("common.edit")} onPress={handleEdit} variant="ghost" />

      {settleToast ? (
        <Toast message={t("counterparties.settleComingSoon")} onDismiss={handleDismissSettleToast} />
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
}));
