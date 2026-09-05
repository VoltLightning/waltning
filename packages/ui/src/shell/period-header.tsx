/**
 * `<PeriodHeader>` — `design-system/05` §5.1 / §7.2: `‹ August 2026 ›` + *Today*.
 *
 * **Month only, in arc 1.** S04 §3 and §9 want day/week/year granularity and an
 * arbitrary range through `PeriodPicker` (S11, S25) eventually — that
 * component and the granularity switch do not exist yet, so tapping the label
 * does nothing here; only the arrows step, one period at a time, and *Today*
 * returns to the current one. `label` is the caller's formatting (locale-aware
 * month names are a rendering, `CLAUDE.md`'s date rule), so this component
 * never assumes month even though C2's only caller does.
 *
 * **Two tones, because it is drawn on two grounds.** S04 renders it inside
 * `Shell`'s band, where the ink is `shellText`; S10 §3 web renders it in the
 * desk filter rail, on `GroundPanel`'s surface, where `shellText` is a
 * near-white on near-white — 1.14:1, which the contrast check in
 * `visual/stories.spec.ts` caught the moment the rail got a story of its own.
 * `tone` is the ground the caller is putting it on, not a style: the two
 * palettes are `theme.shellText`/`shellTextMuted` and `theme.text`/
 * `textMuted`, and nothing else about the component changes.
 */

import { Pressable, Text, View } from "react-native";
import { useT } from "../i18n/provider";
import { IconButton } from "../primitives/icon-button";
import { useInteraction } from "../primitives/interaction.ts";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, space, touchTarget } from "../tokens.ts";

export type PeriodHeaderProps = {
  /** The period's display label — "August 2026". Formatted by the caller. */
  label: string;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  /** Whether the shown period is the current one — hides the redundant *Today* action. */
  isCurrent: boolean;
  /** The ground it sits on: `"shell"` (default) — the band; `"surface"` — a panel. */
  tone?: "shell" | "surface";
};

export function PeriodHeader({
  label,
  onPrevious,
  onNext,
  onToday,
  isCurrent,
  tone = "shell",
}: PeriodHeaderProps) {
  const t = useT();
  const styles = useStyles();
  // §10's 44px floor and §2.6's focus ring, the same primitive `Button` and
  // `IconButton` are both built on — *Today* is a text label, not a square
  // icon, so it takes the primitive directly rather than through either.
  const { focused, handlers } = useInteraction();
  const onSurface = tone === "surface";

  return (
    <View style={styles.root}>
      <View style={styles.stepper}>
        <IconButton label={t("shell.periodPrevious")} onPress={onPrevious} size={32}>
          <Text style={[styles.arrow, onSurface ? styles.labelOnSurface : null]}>‹</Text>
        </IconButton>
        <Text style={[styles.label, onSurface ? styles.labelOnSurface : null]}>{label}</Text>
        <IconButton label={t("shell.periodNext")} onPress={onNext} size={32}>
          <Text style={[styles.arrow, onSurface ? styles.labelOnSurface : null]}>›</Text>
        </IconButton>
      </View>
      {isCurrent ? null : (
        <Pressable
          accessibilityRole="button"
          onPress={onToday}
          {...handlers}
          style={[styles.today, focused ? styles.todayFocused : null]}
        >
          <Text style={[styles.todayLabel, onSurface ? styles.todayLabelOnSurface : null]}>
            {t("shell.today")}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.x3,
  },
  stepper: { flexDirection: "row", alignItems: "center", gap: space.x2 },
  label: { color: theme.shellText, ...text.ui("bodySm", 600) },
  arrow: { color: theme.shellText, ...text.ui("body", 600) },
  /** `tone="surface"` — panel ink, for the desk filter rail (see the file doc). */
  labelOnSurface: { color: theme.text },
  todayLabelOnSurface: { color: theme.textMuted },
  today: { minHeight: touchTarget.min, justifyContent: "center", paddingHorizontal: space.x2 },
  todayFocused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  todayLabel: { color: theme.shellTextMuted, ...text.ui("bodySm", 600) },
}));
