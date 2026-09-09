/**
 * `<FlowBar>` — the month's arithmetic, as a shape (S04 §3).
 *
 * **The track is what came in and the fill is what went out, so the gap that
 * remains is what you kept.** That is the same subtraction the three figures
 * beside it state, in a form readable without reading any of them.
 *
 * **Rejected: two proportional shares of the month's flow.** That answers how
 * the month divided — a question nobody asks — where this answers *how much of
 * what arrived is still here*, which is the card's whole subject.
 *
 * **A deficit fills the track and stops.** *Kept so far* goes negative and
 * takes the expense ink; the fill never overruns, because a bar longer than
 * its own container is a graphic that has to be explained. The figures carry
 * the overshoot, which is what figures are for.
 *
 * **A month with nothing in it draws an empty track**, not a full one: zero
 * arrived and zero left, and a bar filled by `0 / 0` would say the month was
 * entirely spent.
 *
 * **The track is `incomeFill`, not `income`.** This is the one component that
 * draws one money colour *on* the other, and the two are the same lightness in
 * this palette on purpose — a figure is told apart by hue. So `spend` on
 * `income` was 1.0045:1 in light and the whole bar rendered as one uniform
 * rectangle, with no boundary at the very place "what you kept" is supposed to
 * be readable. Income as a *field* is a paler green; `spend` reads on it at
 * 3.60. Both floors are in `theme/theme.test.tsx`.
 */

import * as money from "@waltning/core/money";
import { memo, useMemo } from "react";
import { View } from "react-native";
import { makeStyles } from "../../../theme/styles.ts";
import { radius } from "../../../tokens.ts";

export type FlowBarProps = {
  /** What arrived — the track. */
  inflow: money.Money;
  /** What left, as a positive magnitude (§12) — the fill. */
  spend: money.Money;
};

/** The fill's share of the track, 0–1. */
export function flowShare(inflow: money.Money, spend: money.Money): number {
  if (money.isZero(inflow) || !money.isPositive(inflow)) return money.isZero(spend) ? 0 : 1;
  const share = Number(money.dec(spend).div(money.dec(inflow)).toFixed(4));
  return Math.min(Math.max(share, 0), 1);
}

function FlowBarView({ inflow, spend }: FlowBarProps) {
  const styles = useStyles();
  // Nothing arrived and nothing left: a neutral track, not a full green one.
  // The track is what came in, so painting it green on an empty month says
  // "you kept all of it" about a month in which nothing happened — a success
  // state drawn over an absence.
  const empty = money.isZero(inflow) && money.isZero(spend);
  const share = flowShare(inflow, spend);
  // The one value `makeStyles` cannot hold: it is the datum, not the design.
  const width = useMemo(() => ({ width: `${share * 100}%` }) as const, [share]);
  return (
    // Decorative: the same subtraction is stated in words and figures either
    // side of it, so a reader who cannot see it loses nothing and a reader
    // using a screen reader is not read a bar.
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      {...HIDDEN}
      style={[styles.track, empty ? styles.trackEmpty : null]}
    >
      {empty ? null : <View style={[styles.fill, width]} />}
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
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: theme.incomeFill,
  },
  trackEmpty: { backgroundColor: theme.trackFill },
  fill: { height: "100%", backgroundColor: theme.spend },
}));
