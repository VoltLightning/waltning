/**
 * S12 · Debt — every person and company with a non-zero position, the two
 * direction totals per currency, and the unallocated-clearing banner.
 *
 * **Never nets across people or currencies** (§6.6, S12 §8) — the two
 * direction totals (`money.directionTotals`) sum the *positive* balances into
 * "they owe you" and the *magnitude* of the negative ones into "you owe",
 * both per currency, never combined into one figure.
 *
 * **The row's own net folds every currency a counterparty holds into their
 * settlement currency** (`counterparty-figures.ts`'s `resolveCounterpartyFigures`
 * — the same fold `CounterpartyRow` was built to render (P1: no rate, no
 * converted figure). A counterparty with any currency this replica has no
 * rate for falls back to their settlement currency's own balance alone
 * (always complete — no conversion needed) rather than hiding a real debt.
 */

import {
  type CounterpartyGroup,
  groupByCounterparty,
  makeRateOf,
  resolveCounterpartyFigures,
} from "@waltning/client/counterparties/counterparty-figures";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import * as money from "@waltning/core/money";
import { CounterpartyRow } from "@waltning/ui/counterparties/counterparty-row";
import { Amount } from "@waltning/ui/fx/amount";
import { decimalMark } from "@waltning/ui/i18n/locales";
import { useLocale, useT } from "@waltning/ui/i18n/provider";
import { type Segment, SegmentControl } from "@waltning/ui/primitives/segment-control";
import { GroundPanel } from "@waltning/ui/shell/card";
import { Banner } from "@waltning/ui/states/banner";
import { EmptyState } from "@waltning/ui/states/empty-state";
import { ErrorState } from "@waltning/ui/states/error-state";
import { makeStyles } from "@waltning/ui/theme/styles";
import { space } from "@waltning/ui/tokens";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";

type DirectionSegment = "all" | "theyOwe" | "youOwe";

type DebtRow = {
  counterpartyId: string;
  name: string;
  kind: "person" | "company";
  figures: ReturnType<typeof resolveCounterpartyFigures>;
  ageDays: number | null;
  ageBucket: CounterpartyGroup["ageBucket"];
};

type DebtCounterpartyRowProps = {
  row: DebtRow;
  onSelect: (id: string) => void;
};

/** One row, bound to its own id — a `.map`'s handler lives in a component, never an inline arrow in JSX. */
function DebtCounterpartyRow({ row, onSelect }: DebtCounterpartyRowProps) {
  const handlePress = useCallback(
    () => onSelect(row.counterpartyId),
    [onSelect, row.counterpartyId],
  );
  return (
    <CounterpartyRow
      name={row.name}
      kind={row.kind}
      settlement={{
        value: row.figures.value,
        currency: row.figures.currency,
        decimals: row.figures.decimals,
      }}
      display={row.figures.display}
      ageDays={row.ageDays}
      ageBucket={row.ageBucket}
      onPress={handlePress}
    />
  );
}

function handleAdd() {
  router.push({ pathname: "/counterparty/new", params: { returnTo: "debt" } });
}

export default function Debt() {
  const t = useT();
  const locale = useLocale();
  const styles = useStyles();
  const ledger = useLedgerController();
  const snapshot = usePhoneLedger(ledger);
  const today = deviceRuntime().capture().date;
  const [segment, setSegment] = useState<DirectionSegment>("all");

  const balances = useMemo(() => ledger.listCounterpartyBalances(today), [ledger, today]);
  const directionTotals = useMemo(() => money.directionTotals(balances), [balances]);
  const pivot = snapshot.currencies.find((currency) => currency.isPivot)?.code;

  const rows = useMemo((): readonly DebtRow[] => {
    if (!pivot) return [];
    const rateOf = makeRateOf(ledger.readRate, pivot, today);
    return groupByCounterparty(balances).map((group) => ({
      counterpartyId: group.counterpartyId,
      name: group.name,
      kind: group.kind,
      figures: resolveCounterpartyFigures(group, pivot, rateOf),
      ageDays: group.ageDays,
      ageBucket: group.ageBucket,
    }));
  }, [balances, ledger.readRate, pivot, today]);

  const visibleRows = useMemo(() => {
    const filtered = rows.filter((row) => {
      if (segment === "all") return true;
      return money.debtDirection(row.figures.value) === segment;
    });
    // S12 §3: companies by age desc, then by name.
    return [...filtered].sort((a, b) => {
      if (a.kind === "company" && b.kind === "company") return (b.ageDays ?? 0) - (a.ageDays ?? 0);
      if (a.kind === "company" && b.kind !== "company") return -1;
      if (a.kind !== "company" && b.kind === "company") return 1;
      return a.name.localeCompare(b.name);
    });
  }, [rows, segment]);

  const unsettled = snapshot.unsettledClearing[0];
  const unsettledMore = snapshot.unsettledClearing.length - 1;
  const unsettledPayee = unsettled?.oldestUnconsumedPayee;
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
  const unsettledBanner = unsettled ? (
    <Banner
      tone="warn"
      message={
        unsettledPayee
          ? t(unsettledMore > 0 ? "shell.unsettledNamedMore" : "shell.unsettledNamed", {
              amount: money.forDisplay(unsettled.balance, unsettled.decimals, decimalMark(locale)),
              currency: unsettled.currency,
              payee: unsettledPayee,
              count: unsettledMore,
            })
          : t(unsettledMore > 0 ? "shell.unsettledMore" : "shell.unsettled", {
              amount: money.forDisplay(unsettled.balance, unsettled.decimals, decimalMark(locale)),
              currency: unsettled.currency,
              account: unsettled.name,
              count: unsettledMore,
            })
      }
      action={{ label: t("counterparties.allocate"), onPress: handleOpenUnsettled }}
    />
  ) : null;

  const segments = useMemo(
    (): readonly [Segment, Segment, Segment] => [
      { value: "all", label: t("counterparties.segmentAll") },
      { value: "theyOwe", label: t("counterparties.segmentTheyOwe") },
      { value: "youOwe", label: t("counterparties.segmentYouOwe") },
    ],
    [t],
  );
  const handleSegmentChange = useCallback(
    (next: string) => setSegment(next as DirectionSegment),
    [],
  );

  const handleSelect = useCallback((id: string) => {
    router.push(`/counterparty/${id}`);
  }, []);

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

  if (snapshot.counterparties.length === 0 && snapshot.archivedCounterparties.length === 0) {
    return (
      <GroundPanel>
        <EmptyState
          variant="first-run"
          title={t("counterparties.emptyFirstRunTitle")}
          body={t("counterparties.emptyFirstRunBody")}
          primaryAction={{ label: t("counterparties.add"), onPress: handleAdd }}
        />
      </GroundPanel>
    );
  }

  return (
    <GroundPanel>
      <View style={styles.root}>
        {unsettledBanner}
        <SegmentControl segments={segments} value={segment} onChange={handleSegmentChange} />
        <View style={styles.totals}>
          {directionTotals.map((total) => (
            <View key={total.currency} style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                {t("counterparties.theyOweTotal")} · {total.currency}
              </Text>
              <Amount value={total.theyOwe} currency={total.currency} size="small" kind="income" />
            </View>
          ))}
          {directionTotals.map((total) => (
            <View key={`${total.currency}-you`} style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                {t("counterparties.youOweTotal")} · {total.currency}
              </Text>
              <Amount value={total.youOwe} currency={total.currency} size="small" kind="spend" />
            </View>
          ))}
        </View>
        {visibleRows.length === 0 ? (
          <EmptyState
            variant="range"
            title={t("counterparties.emptySettledTitle")}
            body={t("counterparties.emptySettledBody")}
            primaryAction={{ label: t("counterparties.add"), onPress: handleAdd }}
          />
        ) : (
          <ScrollView>
            {visibleRows.map((row) => (
              <DebtCounterpartyRow key={row.counterpartyId} row={row} onSelect={handleSelect} />
            ))}
          </ScrollView>
        )}
      </View>
    </GroundPanel>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { gap: space.x4, flex: 1 },
  totals: { gap: space.xs },
  totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  totalLabel: { color: theme.textMuted },
}));
