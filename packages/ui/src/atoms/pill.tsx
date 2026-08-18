/**
 * `<Pill>` — `design-system/03` §3.4. Import review's row-level provenance.
 *
 * **Carries text, not just tint.** Where a row's classification came from is
 * the thing a reviewer is deciding on, and a colour cannot say "Rule · Groceries
 * (hit 41 times)" — which is the difference between accepting a row and
 * checking it.
 *
 * A union rather than a variant string plus optional fields: `rule` without its
 * name and `model` without its confidence are both useless, and a flat shape
 * permits them.
 */

import { StyleSheet, Text, View } from "react-native";
import { color, radius, space, type } from "../tokens.ts";

export type PillTier =
  /** Deterministic and free. Names the rule, because "a rule" is not checkable. */
  | { tier: "rule"; name: string; hits?: number }
  /** Confidence to 2dp, and §11 requires it to be paired with a reason. */
  | { tier: "model"; confidence: number }
  /** The pair is already collapsed to one row. */
  | { tier: "transfer" }
  /** Matched an existing transaction. */
  | { tier: "duplicate" };

export function Pill(props: PillTier) {
  return (
    <View style={styles.pill}>
      <Text style={styles.text}>{describe(props)}</Text>
    </View>
  );
}

function describe(p: PillTier): string {
  switch (p.tier) {
    case "rule":
      // The hit count is what tells a reviewer whether this rule is load-bearing
      // or was written once for one row.
      return p.hits === undefined ? `Rule · ${p.name}` : `Rule · ${p.name} · ${p.hits}`;
    case "model":
      // Two decimal places, always. `0.9` and `0.90` read as different amounts
      // of certainty, and only one of them is what the model said.
      return `Model ${p.confidence.toFixed(2)}`;
    case "transfer":
      return "Transfer";
    case "duplicate":
      return "Duplicate";
  }
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: color.green50,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    paddingVertical: space.xs,
    alignSelf: "flex-start",
  },
  text: { color: color.green700, fontSize: type.caption.fontSize },
});
