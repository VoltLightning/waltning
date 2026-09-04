/**
 * `<AgeingBar>` — `design-system/05` §5.5 · O15 · `computations.md` §7.
 *
 * **Companies only.** A 60-days-open badge on a friend's share of dinner is
 * absurd (S12 §4) — this component does not enforce that itself (it has no
 * way to know a counterparty's `kind`), so every caller composes it behind
 * `kind === "company"`, the same way `CounterpartyRow` and `CounterpartyCard`
 * do.
 *
 * **Four buckets, filled to the current one.** `money.ageBucket` decides
 * which; this only draws it. The label says *old*, never *overdue* — there is
 * no `payment_terms_days` field, so this component knows only how long a
 * debt has stood open, not whether it is late (`money.ts`'s own comment on
 * `ageBucket`).
 */

import type { AgeBucket } from "@waltning/core/money";
import { Text, View } from "react-native";
import { useT } from "../i18n/provider";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { radius, space } from "../tokens.ts";

const BUCKETS: readonly AgeBucket[] = ["0-30", "31-60", "61-90", "90+"];

export type AgeingBarProps = {
  ageDays: number;
  bucket: AgeBucket;
};

export function AgeingBar({ ageDays, bucket }: AgeingBarProps) {
  const t = useT();
  const styles = useStyles();
  const currentIndex = BUCKETS.indexOf(bucket);

  return (
    <View style={styles.root}>
      <View style={styles.track} accessibilityRole="progressbar">
        {BUCKETS.map((step, index) => (
          <View
            key={step}
            style={[styles.segment, index <= currentIndex ? styles.segmentFilled : null]}
          />
        ))}
      </View>
      <Text style={styles.label}>{t("counterparties.ageingDays", { days: ageDays })}</Text>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { flexDirection: "row", alignItems: "center", gap: space.md },
  track: { flexDirection: "row", gap: space.xxs },
  segment: {
    width: 14,
    height: 6,
    borderRadius: radius.xs,
    backgroundColor: theme.subtleFill,
  },
  segmentFilled: { backgroundColor: theme.assertedBorder },
  label: { color: theme.textMuted, ...text.ui("caption") },
}));
