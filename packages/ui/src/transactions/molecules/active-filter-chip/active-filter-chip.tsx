/**
 * `<ActiveFilterChip>` — S10 §3's filter bar, one dimension at a time.
 *
 * **The whole chip is the remove target.** `select.tsx`'s `Token` makes the
 * same choice for the same reason: an ×-only target would be a 10px button
 * wearing a 44px costume. Editing a filter's *value* happens through
 * `+ Filter`; tapping an already-active chip only ever removes it.
 *
 * **The exclusion count rides on the chip rather than beside it.** §4 asks the
 * desk rail to say what a filter hides, and `05-composites` §5.6 asks the same
 * of the phone's chip row. Nothing is drawn at zero: a chip that hides nothing
 * has nothing to report.
 */

import { Pressable, Text, View } from "react-native";
import { useT } from "../../../i18n/provider";
import { useInteraction } from "../../../primitives/interaction.ts";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../../../tokens.ts";

export type ActiveFilterChipProps = {
  label: string;
  /** §4's own number for this dimension — absent, or 0, draws nothing. */
  excludes?: number | undefined;
  onRemove: () => void;
};

export function ActiveFilterChip({ label, excludes, onRemove }: ActiveFilterChipProps) {
  const t = useT();
  const styles = useStyles();
  const { focused, handlers } = useInteraction();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("common.remove", { value: label })}
      onPress={onRemove}
      style={[styles.chip, focused ? styles.focused : null]}
      {...handlers}
    >
      <Text style={styles.label}>{label}</Text>
      {excludes !== undefined && excludes > 0 ? (
        <Text style={styles.excludes}>
          {/* The plural is the resolver's — `ExcludesNote`'s own doc (L4). */}
          {t("transactions.filterExcludes", { count: excludes })}
        </Text>
      ) : null}
      <View style={styles.cross}>
        <View style={[styles.crossBar, styles.crossBarA]} />
        <View style={[styles.crossBar, styles.crossBarB]} />
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  chip: {
    minHeight: touchTarget.min,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    borderWidth: 1,
    borderColor: theme.accentFillBorder,
    backgroundColor: theme.accentFill,
    borderRadius: radius.sm,
    paddingHorizontal: space.x3,
  },
  /**
   * §2.6 — the chip is a button, so it takes a ring. It carried none in the
   * screen it came from, where the rule that catches this does not run.
   */
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  label: { color: theme.accentText, ...text.ui("bodySm", 600) },
  excludes: { color: theme.accentText, ...text.ui("caption") },
  cross: { width: 10, height: 10, alignItems: "center", justifyContent: "center" },
  crossBar: { position: "absolute", width: 11, height: 1.5, backgroundColor: theme.accentText },
  crossBarA: { transform: [{ rotate: "45deg" }] },
  crossBarB: { transform: [{ rotate: "-45deg" }] },
}));
