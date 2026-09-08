/**
 * `<PeriodBar>` — the row above `PageTabs`, shared by every page of S04's
 * pager and never scrolled away (S04 §3).
 *
 * **The arrows step the unit the page is in** — a month on Summary, List and
 * Calendar; a year on Months — and the label says which. That is the whole
 * reason the control needs no explaining: `September` steps months,
 * `2026` steps years, and nothing has to tell you so.
 *
 * **The label is given, not formatted here.** Which unit is showing, whether
 * the year belongs in it, and how a month is named in the reader's language
 * are all the caller's; a bar that formatted its own would need `useT()`, a
 * timezone and a granularity it has no business knowing.
 *
 * **Five things share 326pt, so the caller drops the year when it is the
 * current one** (S04 §3). This component does not enforce that — it cannot
 * know today — but it is why `label` is a string rather than a date.
 */

import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import { useInteraction } from "../../../primitives/interaction.ts";
import { text } from "../../../theme/fonts.ts";
import { useTheme } from "../../../theme/provider";
import { makeStyles } from "../../../theme/styles.ts";
import { focus, radius, space, tabularNums, touchTarget } from "../../../tokens.ts";
import { CaretLeftIcon, CaretRightIcon, MagnifyingGlassIcon } from "../../phosphor";

/** One box for all three, so a glyph never changes the row's height. */
const ICON = 18;

export type PeriodBarProps = {
  /** Already formatted and already localised — `September`, `2026`, `Aug – Sep 2026`. */
  label: string;
  /** The visible period's figure, already through `<Amount>`'s formatter. */
  figure: string;
  /** Absent where the ledger cannot go further back. */
  onPrevious?: (() => void) | undefined;
  /** Absent at the forward horizon — S04 §6 stops at the end of the month. */
  onNext?: (() => void) | undefined;
  onSearch: () => void;
  /** The accessible names, localised by the caller. */
  labels: { previous: string; next: string; search: string };
};

function IconButton({
  onPress,
  accessibilityLabel,
  disabled,
  children,
}: {
  onPress: (() => void) | undefined;
  accessibilityLabel: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const styles = useStyles();
  const { focused, handlers } = useInteraction();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      {...handlers}
      style={[styles.iconButton, focused ? styles.focused : null, disabled ? styles.dim : null]}
    >
      {children}
    </Pressable>
  );
}

function PeriodBarView({ label, figure, onPrevious, onNext, onSearch, labels }: PeriodBarProps) {
  const styles = useStyles();
  // A glyph takes a colour, not a style, so it reads the role directly.
  const ink = useTheme().text;
  return (
    <View style={styles.row}>
      <IconButton
        onPress={onPrevious}
        accessibilityLabel={labels.previous}
        disabled={onPrevious === undefined}
      >
        <CaretLeftIcon size={ICON} color={ink} />
      </IconButton>

      {/*
        The label is the heading for the whole pager: a reader arriving here
        should hear which period they are in before any figure in it.
      */}
      <Text accessibilityRole="header" style={styles.label} numberOfLines={1}>
        {label}
      </Text>

      <IconButton onPress={onNext} accessibilityLabel={labels.next} disabled={onNext === undefined}>
        <CaretRightIcon size={ICON} color={ink} />
      </IconButton>

      <View style={styles.spacer} />

      <Text style={styles.figure} numberOfLines={1}>
        {figure}
      </Text>

      <IconButton onPress={onSearch} accessibilityLabel={labels.search} disabled={false}>
        <MagnifyingGlassIcon size={ICON} color={ink} />
      </IconButton>
    </View>
  );
}

export const PeriodBar = memo(PeriodBarView);

const useStyles = makeStyles((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    minHeight: touchTarget.min,
  },
  spacer: { flex: 1 },
  iconButton: {
    minWidth: touchTarget.min,
    minHeight: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  dim: { opacity: 0.35 },
  label: { ...text.display("displayThree"), color: theme.text },
  figure: { ...text.ui("bodySm", 600), color: theme.spend, fontVariant: [...tabularNums] },
}));
