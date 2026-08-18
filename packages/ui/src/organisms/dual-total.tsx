/**
 * `<DualTotal>` — `design-system/05` §5. **The two headline figures.**
 *
 * *mine* dominant, *ours* secondary beneath (`SPEC.md` §6.7).
 *
 * **Never a toggle.** The spec is explicit and the reason is the whole design:
 * showing one at a time invites reading the wrong number — the two figures
 * answer different questions and look identical, so a control that swaps them
 * guarantees that someone eventually reads *ours* believing it is *mine*.
 * There is no `scope` prop here, and that absence is the feature.
 *
 * Distinct from the scope `SegmentControl`, which **is** a filter. These two
 * show together regardless of what is selected there.
 *
 * **Degrades to a single figure** when no shared account exists. A household
 * total of exactly the same number, printed underneath, teaches the reader that
 * the second line carries no information.
 */

import type { money } from "@waltning/core";
import { StyleSheet, Text, View } from "react-native";
import { Amount } from "../molecules/amount";
import { color, space, type } from "../tokens.ts";

export type DualTotalProps = {
  /** Everything you own, business included (§6.7). */
  mine: money.Money;
  /**
   * The household figure, or `null` when there is no shared account.
   *
   * `null` rather than passing `mine` again: the caller saying "there is no
   * second figure" is different from the caller computing the same number
   * twice, and only one of them should render one line.
   */
  ours: money.Money | null;
  currency: string;
  decimals?: number;
};

export function DualTotal({ mine, ours, currency, decimals = 2 }: DualTotalProps) {
  return (
    <View style={styles.block}>
      <View>
        <Text style={styles.label}>mine</Text>
        <Amount value={mine} currency={currency} decimals={decimals} size="hero" />
      </View>
      {ours === null ? null : (
        <View>
          <Text style={styles.label}>ours</Text>
          <Amount value={ours} currency={currency} decimals={decimals} size="large" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.xl },
  label: {
    color: color.muted,
    fontSize: type.kicker.fontSize,
    fontWeight: type.kicker.fontWeight,
    letterSpacing: type.kicker.letterSpacing,
    textTransform: "uppercase",
  },
});
