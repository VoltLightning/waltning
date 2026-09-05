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
 * rate for gets **no net at all** — `figures.value` is `null`, never a
 * substitute single-currency balance — and `CounterpartyRow` renders their
 * held balances stacked instead. The segment filter below classifies that
 * counterparty from those same balances (any positive line → *they owe*, any
 * negative → *you owe*, both → shown under both), never from a net that does
 * not exist.
 */

import {
  type CounterpartyGroup,
  groupByCounterparty,
  makeRateOf,
  resolveCounterpartyFigures,
} from "@waltning/client/counterparties/counterparty-figures";
import { clientFailure, emitClientDiagnostic } from "@waltning/client/diagnostics";
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
import { Skeleton } from "@waltning/ui/states/skeleton";
import { makeStyles } from "@waltning/ui/theme/styles";
import { space } from "@waltning/ui/tokens";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { mobileDiagnostics } from "./diagnostics.ts";

type DirectionSegment = "all" | "theyOwe" | "youOwe";

type DebtRow = {
  counterpartyId: string;
  name: string;
  kind: "person" | "company";
  figures: ReturnType<typeof resolveCounterpartyFigures>;
  /** Every held balance — `CounterpartyRow`'s stacked fallback when `figures.value` is `null` (P1). */
  balances: CounterpartyGroup["balances"];
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
      balances={row.balances}
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

/**
 * S12's segment filter. `figures.value` is the ordinary case; a `null` net
 * (P1 — a held currency has no rate) classifies from the raw balances
 * instead: any positive line puts the row under *they owe*, any negative
 * under *you owe*, and a counterparty holding both shows under both rather
 * than being hidden by a net that was never computed.
 */
function matchesDirectionSegment(row: DebtRow, segment: DirectionSegment): boolean {
  if (segment === "all") return true;
  if (row.figures.value !== null) {
    return money.debtDirection(row.figures.value, row.figures.decimals) === segment;
  }
  return row.balances.some((line) => money.debtDirection(line.balance, line.decimals) === segment);
}

export default function Debt() {
  const t = useT();
  const locale = useLocale();
  const styles = useStyles();
  const ledger = useLedgerController();
  const snapshot = usePhoneLedger(ledger);
  const today = deviceRuntime().capture().date;
  const [segment, setSegment] = useState<DirectionSegment>("all");

  // H1 — `snapshot.revision` in deps: `listCounterpartyBalances` is a live
  // controller read, never cached in the snapshot, so a `useMemo` keyed only
  // on `[ledger, today]` (both stable across a session) never recomputes —
  // `settleDebt` → `refresh()` bumps `revision` but this stays the pre-write
  // answer forever after. `revision` is the one dependency that actually
  // means "a write could have changed this", the same reasoning
  // `useCounterpartyHistory` already carries.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `snapshot.revision` invalidates this memo by identity, not by being read in the body.
  const balances = useMemo(
    () => ledger.listCounterpartyBalances(today),
    [ledger, snapshot.revision, today],
  );
  // M2 — `money.directionTotals` throws on a genuine invariant violation
  // (two rows naming one currency at two different `decimals`), and a throw
  // inside a `useMemo` that runs above every guard below must not take the
  // whole screen down. Caught here, once, and rendered as a recoverable
  // error rather than a blank screen or a crash. The executor's own message
  // is diagnostics-only (§ M — never a person's `why`, which stays the fixed
  // `totalsInconsistentWhy` key below).
  const directionTotalsResult = useMemo(():
    | { ok: true; rows: readonly money.DirectionTotalRow[] }
    | { ok: false; reason: ReturnType<typeof clientFailure> } => {
    try {
      return { ok: true, rows: money.directionTotals(balances) };
    } catch (error) {
      return { ok: false, reason: clientFailure(error) };
    }
  }, [balances]);
  // L2 — the diagnostic itself moved out of the `useMemo` above and into an
  // effect keyed on the failure's own reason (its message, never the result
  // object's identity): a `useMemo` may run during a render React discards
  // without committing, so a side effect inside one can fire more than once
  // for the same failure, or for a failure nobody ever saw rendered. An
  // effect runs once per commit, and keying on the message rather than the
  // object means it fires once per *distinct* failure, not once per render
  // that still happens to be failing.
  const totalsFailureReason = directionTotalsResult.ok ? undefined : directionTotalsResult.reason;
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the failure's own message, not `totalsFailureReason`'s own identity — emits once per distinct failure, not once per render still failing the same way.
  useEffect(() => {
    if (totalsFailureReason === undefined) return;
    emitClientDiagnostic(mobileDiagnostics, {
      scope: "client_state",
      update: "counterparty_direction_totals",
      phase: "failure",
      error: totalsFailureReason,
    });
  }, [totalsFailureReason?.message]);
  const pivot = snapshot.currencies.find((currency) => currency.isPivot)?.code;

  const rows = useMemo((): readonly DebtRow[] => {
    if (!pivot) return [];
    const rateOf = makeRateOf(ledger.readRate, pivot, today);
    return groupByCounterparty(balances).map((group) => ({
      counterpartyId: group.counterpartyId,
      name: group.name,
      kind: group.kind,
      figures: resolveCounterpartyFigures(group, pivot, rateOf, snapshot.currencies),
      balances: group.balances,
      ageDays: group.ageDays,
      ageBucket: group.ageBucket,
    }));
  }, [balances, ledger.readRate, pivot, snapshot.currencies, today]);

  const visibleRows = useMemo(() => {
    const filtered = rows.filter((row) => matchesDirectionSegment(row, segment));
    // S12 §3's own mock: one list, sorted by name — kind is never a sort
    // key. A company still carries its own `AgeingBar` (O15) beside its row,
    // but that is a per-row decoration, not a grouping the list performs (L1
    // — the prior comment claimed "companies by age desc, then by name", which
    // matched neither the mock, which lists a person first, nor the code,
    // which had no name tiebreak for two companies of the same age).
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, segment]);

  const unsettled = snapshot.unsettledClearing[0];
  const unsettledMore = snapshot.unsettledClearing.length - 1;
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

  if (!directionTotalsResult.ok) {
    return (
      <GroundPanel>
        <ErrorState
          variant="recoverable"
          what={t("counterparties.loadFailedTitle")}
          why={t("counterparties.totalsInconsistentWhy")}
          action={{ label: t("common.retry"), onPress: ledger.refresh }}
        />
      </GroundPanel>
    );
  }

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

  // M1 — the loading state (S12 §6: "Skeleton rows; totals resolve last
  // rather than showing a wrong number"), never the empty state or the
  // no-pivot error, while the first `refresh()` is still in flight.
  // `snapshot.revision` (`create-phone-ledger.ts`) is exactly the signal for
  // that — `0` until a `refresh()` has completed, success or failure — unlike
  // `currencies.length`, which cannot tell "not loaded yet" apart from "the
  // replica genuinely holds no currencies" (H1).
  if (snapshot.revision === 0) {
    return (
      <GroundPanel>
        <View
          style={styles.root}
          accessibilityRole="progressbar"
          accessibilityLabel={t("counterparties.loadingDebts")}
        >
          <View style={styles.totals}>
            <Skeleton shape="row" label="" />
          </View>
          <Skeleton shape="row" label="" />
          <Skeleton shape="row" label="" />
          <Skeleton shape="row" label="" />
        </View>
      </GroundPanel>
    );
  }

  // H — nothing enforces the bootstrap that would make this unreachable: a
  // pivot-less replica after a completed refresh is `architecture/09`'s
  // bootstrap guarantee broken, and must never render as "All settled" (the
  // rows below are empty without a pivot) or as the totals above them, which
  // read straight off `balances` and know nothing about `pivot`. No retry
  // action — it would only re-read the same broken replica. `revision === 0`
  // already returned above, so this also covers a replica whose first
  // refresh finished holding no currencies at all — the same broken
  // guarantee, not a loading state.
  if (pivot === undefined) {
    return (
      <GroundPanel>
        <ErrorState
          variant="recoverable"
          what={t("counterparties.noPivotTitle")}
          why={t("counterparties.noPivotWhy")}
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
          {directionTotalsResult.rows.map((total) => (
            <View key={total.currency} style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                {t("counterparties.theyOweTotal")} · {total.currency}
              </Text>
              <Amount
                value={total.theyOwe}
                currency={total.currency}
                decimals={total.decimals}
                size="small"
                kind="income"
              />
            </View>
          ))}
          {directionTotalsResult.rows.map((total) => (
            <View key={`${total.currency}-you`} style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                {t("counterparties.youOweTotal")} · {total.currency}
              </Text>
              <Amount
                value={total.youOwe}
                currency={total.currency}
                decimals={total.decimals}
                size="small"
                kind="spend"
              />
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
          visibleRows.map((row) => (
            <DebtCounterpartyRow key={row.counterpartyId} row={row} onSelect={handleSelect} />
          ))
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
