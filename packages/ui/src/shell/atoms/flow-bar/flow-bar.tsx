/**
 * `<FlowBar>` — the month's two figures, as a shape (S04 §3).
 *
 * **What came in and what went out, side by side, each its share of the
 * two.** Green on the left under *came in*, red on the right under *went out*
 * — the same order as the labels beneath it — so a month that took in 3 000
 * and spent 2 000 reads as mostly green, which is what it was.
 *
 * **It used to be the other way, and it misread.** The track was what came in
 * and the fill what went out, so the bar answered *how much of the income was
 * spent*: 2 000 of 3 000 painted two thirds of it red, and a month that kept a
 * third of its income looked like a month that was mostly loss. Nobody reads a
 * bar as a ratio of one figure to another; they read which colour there is
 * more of.
 *
 * **Told apart by a gap, not only by hue.** `income` and `spend` are the same
 * lightness in this palette on purpose — a figure is told apart by hue — so
 * the two segments meet at a 2pt gap rather than touching, and read as two
 * even for a reader who cannot separate the hues.
 *
 * **A month with nothing in it draws an empty track**: zero and zero is not a
 * split, and half green half red would claim one.
 */

import * as money from "@waltning/core/money";
import { memo, useMemo } from "react";
import { View } from "react-native";
import { makeStyles } from "../../../theme/styles.ts";
import { radius, space } from "../../../tokens.ts";

export type FlowBarProps = {
  /** What arrived — the green segment, on the left. */
  inflow: money.Money;
  /** What left, as a positive magnitude (§12) — the red segment, on the right. */
  spend: money.Money;
};

/** Came in's share of the two, 0–1 — worked out in decimal, only the ratio a number. */
export function flowShare(inflow: money.Money, spend: money.Money): number {
  const inAmount = money.isPositive(inflow) ? money.dec(inflow) : money.dec(0);
  const outAmount = money.isPositive(spend) ? money.dec(spend) : money.dec(0);
  const whole = inAmount.plus(outAmount);
  if (whole.isZero()) return 0;
  return Number(inAmount.div(whole).toFixed(4));
}

function FlowBarView({ inflow, spend }: FlowBarProps) {
  const styles = useStyles();
  const share = flowShare(inflow, spend);
  const empty = !money.isPositive(inflow) && !money.isPositive(spend);
  // The two values `makeStyles` cannot hold: they are the datum, not the design.
  const inFlex = useMemo(() => ({ flex: share }), [share]);
  const outFlex = useMemo(() => ({ flex: 1 - share }), [share]);
  return (
    // Decorative: the same two figures are stated in words and numbers under
    // it, so a reader using a screen reader is not read a bar.
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      {...HIDDEN}
      style={[styles.track, empty ? styles.trackEmpty : null]}
    >
      {empty ? null : (
        <>
          {share > 0 ? <View style={[styles.segment, styles.in, inFlex]} /> : null}
          {share < 1 ? <View style={[styles.segment, styles.out, outFlex]} /> : null}
        </>
      )}
    </View>
  );
}

/**
 * `react-native-web` maps neither native hiding prop, so a decorative bar
 * stays in the web build's accessibility tree without this
 * (`conformance.test.ts`).
 */
const HIDDEN: { "aria-hidden": true } = { "aria-hidden": true };

export const FlowBar = memo(FlowBarView);

const useStyles = makeStyles((theme) => ({
  track: {
    height: 12,
    flexDirection: "row",
    gap: space.xxs,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  trackEmpty: { backgroundColor: theme.trackFill },
  segment: { height: "100%" },
  in: { backgroundColor: theme.income },
  out: { backgroundColor: theme.spend },
}));
