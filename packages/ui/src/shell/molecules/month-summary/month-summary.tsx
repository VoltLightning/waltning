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
 *
 * **A figure in one currency says what it left out.** S04 — *"empty means
 * nothing happened, not nothing in the lead currency"* — and these three
 * figures are the lead currency's alone. A day holding one 48.20 PLN expense
 * drew *went out 0.00 EUR* under a register listing that expense: true of EUR
 * and false of the day, four pixels from the row that contradicts it. The
 * conversion that would state the whole is class **S** and arc-phone does not
 * do it, so the card carries the Months chart's own note instead of a figure
 * it cannot compute.
 */

import type * as money from "@waltning/core/money";
import { Text, View } from "react-native";
import { Amount } from "../../../fx/atoms/amount/amount";
import { useT } from "../../../i18n/provider";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { space } from "../../../tokens.ts";
import { FlowBar } from "../../atoms/flow-bar/flow-bar";
import { Card } from "../card/card";
import { PeriodHeader } from "../period-header/period-header";

export type MonthSummaryProps = {
  /**
   * The period's own header — label and arrows — or nothing.
   *
   * **Absent where something above already carries the period.** S04's pager
   * puts it in `PagerHeader`, shared by all four pages, and a card drawing its
   * own beneath that would be two controls over one date: the drift the pager
   * exists to avoid, and visibly two rows of the same month. S04 passes
   * nothing; S01's widget grid has no such bar and will pass them.
   *
   * All five together or none: a label with no arrows is a heading pretending
   * to be a control, and arrows with no label do not say what they step.
   */
  period?:
    | {
        /** "September 2026", formatted by the caller. */
        label: string;
        onPrevious: () => void;
        onNext: () => void;
        onToday: () => void;
        isCurrent: boolean;
      }
    | undefined;
  /** §5's figures for the lead currency: `net = inflow − spend`. */
  spend: money.Money;
  inflow: money.Money;
  net: money.Money;
  currency: string;
  decimals?: number;
  /**
   * How many *other* currencies the period holds rows in — the count, not the
   * codes. Zero or absent draws nothing: the figures then state the whole
   * period and a note would be about an emptiness that is not there.
   */
  otherCurrencies?: number;
  /**
   * What the three figures are called, where they are not a month's.
   *
   * S12 §3: *"the hero card is S04's `MonthSummary`, with debt's three
   * figures in it"* — same shape, same reading (a track, a fill, and the gap
   * between them), different subtraction: what comes back to you is what you
   * lent less what you owe. Absent, the labels are S04's own.
   *
   * All three together: one borrowed label beside two of the month's would
   * be a card describing two different things at once.
   */
  labels?: { net: string; inflow: string; spend: string } | undefined;
  /**
   * Whether the leading figure carries its own `+`/`−`.
   *
   * A month's net is signed: the `+` is the difference between *"you have
   * 3 529,82"* and *"you kept 3 529,82"*. A debt net is not — S12 §3 states
   * direction in a word above the figure and forbids stating it by sign
   * alone (P5), so the sign would be the label said twice, and a minus under
   * *you owe* reads as owing a negative amount.
   */
  signed?: boolean;
};

export function MonthSummary({
  period,
  spend,
  inflow,
  net,
  currency,
  decimals = 2,
  otherCurrencies = 0,
  labels,
  signed = true,
}: MonthSummaryProps) {
  const t = useT();
  const styles = useStyles();

  return (
    <Card>
      {period === undefined ? null : (
        <PeriodHeader
          label={period.label}
          onPrevious={period.onPrevious}
          onNext={period.onNext}
          onToday={period.onToday}
          isCurrent={period.isCurrent}
          tone="surface"
        />
      )}
      {/*
        **Label above, figure on its own line.** Label-left and figure-right
        shared one baseline, which left the number nowhere to breathe and
        shrank the currency to fit beside it; S05's amount field had already
        solved this and this card takes its shape.

        `signed` — a kept month is a gain, and the `+` is the difference
        between "you have 3 529,82" and "you kept 3 529,82".
      */}
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>{labels?.net ?? t("shell.keptSoFar")}</Text>
        {/*
          **`medium`, which is larger than `large`.** The size names do not
          order — `large` is `displayTwo` at 23 and `medium` is `displayOne` at
          38 — so this card's hero was set at the same size as the month title
          in the chrome above it, and the screen had no hero at all. The board
          draws it at 40. `medium` had zero callers before this one, which is
          what a name nobody reaches for looks like.
        */}
        <Amount value={net} currency={currency} decimals={decimals} size="medium" signed={signed} />
      </View>

      <FlowBar inflow={inflow} spend={spend} />

      <View style={styles.pair}>
        <View style={styles.pairItem}>
          <Text style={styles.pairLabel}>{labels?.inflow ?? t("shell.cameIn")}</Text>
          <Amount
            value={inflow}
            currency={currency}
            decimals={decimals}
            size="small"
            kind="income"
            signed
          />
        </View>
        <View style={styles.pairItemEnd}>
          <Text style={styles.pairLabel}>{labels?.spend ?? t("shell.wentOut")}</Text>
          <Amount value={spend} currency={currency} decimals={decimals} size="small" kind="spend" />
        </View>
      </View>

      {otherCurrencies > 0 ? (
        <Text style={styles.otherCurrencies}>
          {t("shell.plusOtherCurrencies", { count: otherCurrencies })}
        </Text>
      ) : null}
    </Card>
  );
}

const useStyles = makeStyles((theme) => ({
  hero: { gap: space.xs },
  /**
   * **Primary text, not muted** — the only label in this card that is. It
   * names the screen's hero figure, and a muted label over a 38pt number read
   * as chrome attached to the card rather than as the figure's own name; the
   * two component labels under it stay muted, which is what makes the
   * hierarchy visible at all. Muting all three flattened them into one tone.
   */
  heroLabel: { color: theme.text, ...text.ui("label") },
  pair: { flexDirection: "row", justifyContent: "space-between", gap: space.x3 },
  pairItem: { gap: space.xxs },
  pairItemEnd: { gap: space.xxs, alignItems: "flex-end" },
  pairLabel: { color: theme.textMuted, ...text.ui("caption") },
  otherCurrencies: { color: theme.textMuted, ...text.ui("caption") },
}));
