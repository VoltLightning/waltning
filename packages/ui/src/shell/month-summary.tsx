/**
 * `<MonthSummary>` — the period, and what it did to the money. S04 §3's hero,
 * now that net worth is not.
 *
 * **The month is the daily question.** A total you own moves slowly and is
 * checked occasionally; what changed since the first is what the app is opened
 * for. So the period stepper, the period's own net, and the two figures it is
 * made of live in one card at the top of the ground, and `NetWorthStrip`
 * carries the total above it in a line.
 *
 * **`net` leads and its two components sit under it, because that is what it
 * is.** `computations.md` §5 defines `net = inflow − spend`, and stacking the
 * three in that shape is the arithmetic drawn rather than restated — the same
 * reason `DualTotal` puts *ours* beneath *mine* instead of beside it. The two
 * tiles are `StatTile`, unchanged, on the inset fill so the card's own surface
 * still reads as the card.
 *
 * **It draws whatever it is handed, including a period with nothing in it.** A
 * month before the ledger existed is three zeroes, which is the true answer;
 * an empty state here would claim the *screen* had nothing, while the register
 * beneath it may be full.
 */

import type * as money from "@waltning/core/money";
import { Text, View } from "react-native";
import { Amount } from "../fx/amount";
import { useT } from "../i18n/provider";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { radius, space } from "../tokens.ts";
import { Card } from "./card";
import { PeriodHeader } from "./period-header";
import { StatTile } from "./stat-tile";

export type MonthSummaryProps = {
  /** The period's display label — "September 2026". Formatted by the caller. */
  label: string;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  isCurrent: boolean;
  /** §5's figures for the lead currency: `net = inflow − spend`. */
  spend: money.Money;
  inflow: money.Money;
  net: money.Money;
  currency: string;
  decimals?: number;
};

export function MonthSummary({
  label,
  onPrevious,
  onNext,
  onToday,
  isCurrent,
  spend,
  inflow,
  net,
  currency,
  decimals = 2,
}: MonthSummaryProps) {
  const t = useT();
  const styles = useStyles();

  return (
    <Card>
      <PeriodHeader
        label={label}
        onPrevious={onPrevious}
        onNext={onNext}
        onToday={onToday}
        isCurrent={isCurrent}
        tone="surface"
      />
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>{t("shell.keptSoFar")}</Text>
        {/*
          `signed` — a kept month is a gain, and the `+` is the difference
          between "you have 3 529,82" and "you kept 3 529,82". `auto` would
          leave a positive figure in plain ink with no sign at all.
        */}
        <Amount value={net} currency={currency} decimals={decimals} size="large" signed />
      </View>
      <View style={styles.tiles}>
        <View style={styles.tile}>
          <StatTile
            label={t("shell.cameIn")}
            value={inflow}
            currency={currency}
            decimals={decimals}
            kind="income"
            tone="surface"
            // `signed` on the inflow and not on the outflow, which looks
            // asymmetric and is not: §12 defines `spend` as a positive
            // *magnitude*, so a `−` there would be a sign the figure does not
            // carry. The `+` says this one is money arriving.
            signed
          />
        </View>
        <View style={styles.tile}>
          <StatTile
            label={t("shell.wentOut")}
            value={spend}
            currency={currency}
            decimals={decimals}
            kind="spend"
            tone="surface"
          />
        </View>
      </View>
    </Card>
  );
}

const useStyles = makeStyles((theme) => ({
  hero: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.x3,
  },
  heroLabel: { color: theme.textMuted, ...text.ui("bodySm") },
  tiles: { flexDirection: "row", gap: space.lg },
  /**
   * The inset fill, so the two components of the figure above read as parts of
   * this card rather than as two more cards. `subtleFill` is the token
   * `02-tokens` gives an inset box.
   */
  tile: {
    flex: 1,
    padding: space.x3,
    borderRadius: radius.sm,
    backgroundColor: theme.subtleFill,
  },
}));
