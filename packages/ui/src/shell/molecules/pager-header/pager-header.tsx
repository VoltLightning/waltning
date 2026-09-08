/**
 * `<PagerHeader>` — the row above `PageTabs`, shared by every page of S04's
 * pager and never scrolled away (S04 §3).
 *
 * **Two layouts, and the scroll is what chooses between them.**
 *
 * - *At rest* the month is a large title and the whole title is the picker:
 *   tapping it opens Months, which is where you go when the month you want is
 *   not the next one. There are no arrows, because at the top of a screen the
 *   answer to "somewhere else" is usually not "one step".
 * - *Scrolled* the title shrinks to a single row and the stepper appears
 *   beside search. The title is no longer a target worth aiming at, and
 *   stepping is the thing you want while reading a month — so the control
 *   arrives exactly when the reason for it does.
 *
 * It is one control changing shape, not two headers. The month never moves
 * sideways and never changes colour; it changes size, and the stepper fades in
 * beside it.
 *
 * **The two layers are stacked and cross-faded, rather than one layout whose
 * type animates.** A title that reflows every frame re-measures its text every
 * frame; two static layouts fading past each other are each laid out once.
 *
 * **Reanimated, and the geometry is not in here.** The style is a worklet, so
 * it runs on the UI thread and the header tracks the finger rather than the JS
 * queue — and every number it uses comes from `collapse.ts`, where `vitest`
 * can run the arithmetic for real (the test setup's `interpolate` is a no-op,
 * so a shape built from `interpolate` would be a shape nothing checks).
 *
 * **The bar navigates; the page reports.** It carries no figure. A draft put
 * the period's total in the trailing half and it did not survive being
 * rendered: a bare number with no label to say which figure it was, no room
 * for its currency, and close enough to the magnifier to read as its caption
 * — while the card below said the same month as three labelled figures with
 * the currency on each.
 *
 * **The label is given, not formatted here.** How a month is named in the
 * reader's language, and whether the year belongs beside it, are the caller's;
 * a header that formatted its own would need `useT()`, a timezone and a
 * granularity it has no business knowing.
 */

import { memo, useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
} from "react-native-reanimated";
import { useInteraction } from "../../../primitives/interaction.ts";
import { text } from "../../../theme/fonts.ts";
import { useTheme } from "../../../theme/provider";
import { makeStyles } from "../../../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../../../tokens.ts";
import { CaretDownIcon, CaretLeftIcon, CaretRightIcon, MagnifyingGlassIcon } from "../../phosphor";
import {
  COLLAPSED_HEIGHT,
  collapseProgress,
  headerHeight,
  isCollapsed,
  restLift,
  restOpacity,
  shutOpacity,
  shutSettle,
} from "./collapse.ts";

/** One box for all of them, so a glyph never changes a row's height. */
const ICON = 18;
const TITLE_CARET = 16;

export type PagerHeaderProps = {
  /** The unit itself — `September`, `2026`. Formatted and localised by the caller. */
  label: string;
  /**
   * The line under the title at rest — the year, or whatever names the period
   * more precisely. `null` where the label already says everything.
   */
  detail: string | null;
  /** Opens the picker. The title is the affordance; there is no separate button. */
  onPickPeriod: () => void;
  /** Absent where the ledger cannot go further back. */
  onPrevious?: (() => void) | undefined;
  /** Absent at the forward horizon — S04 §6 stops at the end of the month. */
  onNext?: (() => void) | undefined;
  onSearch: () => void;
  /**
   * How far the visible page has scrolled, in points. The header derives its
   * own shape from it, so a caller only forwards what its scroller already
   * reports and nothing has to lift a second copy of the offset.
   */
  scrollY: SharedValue<number>;
  /** The accessible names, localised by the caller. */
  labels: { previous: string; next: string; search: string; pickPeriod: string };
};

function IconButton({
  onPress,
  accessibilityLabel,
  disabled,
  hidden,
  children,
}: {
  onPress: (() => void) | undefined;
  accessibilityLabel: string;
  disabled: boolean;
  hidden: boolean;
  children: React.ReactNode;
}) {
  const styles = useStyles();
  const { focused, handlers } = useInteraction();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? "no-hide-descendants" : "yes"}
      {...(hidden ? HIDDEN : SHOWN)}
      disabled={disabled || hidden}
      onPress={onPress}
      {...handlers}
      style={[styles.iconButton, focused ? styles.focused : null, disabled ? styles.dim : null]}
    >
      {children}
    </Pressable>
  );
}

function PagerHeaderView({
  label,
  detail,
  onPickPeriod,
  onPrevious,
  onNext,
  onSearch,
  scrollY,
  labels,
}: PagerHeaderProps) {
  const styles = useStyles();
  const ink = useTheme().text;
  const { focused, handlers } = useInteraction();

  // The styles read `scrollY` every frame on the UI thread; this crosses to JS
  // once, at the handover. Opacity is continuous and reachability is not — a
  // control at 4% opacity is invisible and still tappable, and a screen reader
  // walking both layouts hears the month twice.
  const [collapsed, setCollapsed] = useState(false);
  useAnimatedReaction(
    () => isCollapsed(collapseProgress(scrollY.value)),
    (next, previous) => {
      if (next !== previous) runOnJS(setCollapsed)(next);
    },
    [scrollY],
  );

  const root = useAnimatedStyle(
    () => ({ height: headerHeight(collapseProgress(scrollY.value)) }),
    [scrollY],
  );
  const rest = useAnimatedStyle(() => {
    const progress = collapseProgress(scrollY.value);
    return { opacity: restOpacity(progress), transform: [{ translateY: restLift(progress) }] };
  }, [scrollY]);
  const shut = useAnimatedStyle(() => {
    const progress = collapseProgress(scrollY.value);
    return { opacity: shutOpacity(progress), transform: [{ translateY: shutSettle(progress) }] };
  }, [scrollY]);

  const pick = useCallback(() => onPickPeriod(), [onPickPeriod]);

  return (
    <Animated.View style={[styles.root, root]}>
      {/* ── At rest ─────────────────────────────────────────────────────── */}
      <Animated.View style={[styles.layer, rest]} pointerEvents={collapsed ? "none" : "auto"}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={labels.pickPeriod}
          accessibilityElementsHidden={collapsed}
          importantForAccessibility={collapsed ? "no-hide-descendants" : "yes"}
          {...(collapsed ? HIDDEN : SHOWN)}
          disabled={collapsed}
          onPress={pick}
          {...handlers}
          style={[styles.titleBlock, focused ? styles.focused : null]}
        >
          <View style={styles.titleRow}>
            {/*
              The heading is the title at rest and the same words collapsed, so
              only one of the two is ever in the tree — the other is hidden by
              the same flag that takes its pointer.
            */}
            <Text accessibilityRole="header" style={styles.title} numberOfLines={1}>
              {label}
            </Text>
            <CaretDownIcon size={TITLE_CARET} color={ink} />
          </View>
          {detail === null ? null : <Text style={styles.detail}>{detail}</Text>}
        </Pressable>

        <View style={styles.spacer} />

        <IconButton
          onPress={onSearch}
          accessibilityLabel={labels.search}
          disabled={false}
          hidden={collapsed}
        >
          <MagnifyingGlassIcon size={ICON} color={ink} />
        </IconButton>
      </Animated.View>

      {/* ── Scrolled ────────────────────────────────────────────────────── */}
      <Animated.View style={[styles.layer, shut]} pointerEvents={collapsed ? "auto" : "none"}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={labels.pickPeriod}
          accessibilityElementsHidden={!collapsed}
          importantForAccessibility={collapsed ? "yes" : "no-hide-descendants"}
          {...(collapsed ? SHOWN : HIDDEN)}
          disabled={!collapsed}
          onPress={pick}
          style={styles.compactTitle}
        >
          <Text accessibilityRole="header" style={styles.compact} numberOfLines={1}>
            {label}
          </Text>
          {detail === null ? null : <Text style={styles.compactDetail}>{detail}</Text>}
          <CaretDownIcon size={TITLE_CARET - 2} color={ink} />
        </Pressable>

        <View style={styles.spacer} />

        {/*
          One control, not two buttons that happen to be adjacent. Split by a
          hairline inside a single track, a pair of chevrons reads as *step*;
          floating free they read as two more glyphs in a row that already has
          one.
        */}
        <View style={styles.stepper}>
          <IconButton
            onPress={onPrevious}
            accessibilityLabel={labels.previous}
            disabled={onPrevious === undefined}
            hidden={!collapsed}
          >
            <CaretLeftIcon size={ICON - 2} color={ink} />
          </IconButton>
          <View style={styles.divider} />
          <IconButton
            onPress={onNext}
            accessibilityLabel={labels.next}
            disabled={onNext === undefined}
            hidden={!collapsed}
          >
            <CaretRightIcon size={ICON - 2} color={ink} />
          </IconButton>
        </View>

        <IconButton
          onPress={onSearch}
          accessibilityLabel={labels.search}
          disabled={false}
          hidden={!collapsed}
        >
          <MagnifyingGlassIcon size={ICON} color={ink} />
        </IconButton>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * `react-native-web` maps neither native hiding prop, so without these the
 * layer that has faded out stays in the web build's accessibility tree and the
 * month is announced twice (`conformance.test.ts`).
 */
const HIDDEN: { "aria-hidden": true } = { "aria-hidden": true };
const SHOWN: { "aria-hidden": false } = { "aria-hidden": false };

export const PagerHeader = memo(PagerHeaderView);

const useStyles = makeStyles((theme) => ({
  root: { justifyContent: "center", overflow: "hidden" },
  // Stacked, so the two layouts occupy the same place and the height is the
  // only thing that moves the content beneath them.
  layer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    minHeight: COLLAPSED_HEIGHT,
  },
  spacer: { flex: 1 },
  titleBlock: { justifyContent: "center", paddingVertical: space.xs, borderRadius: radius.sm },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  title: { ...text.display("displayTwo"), color: theme.text, flexShrink: 1 },
  detail: { ...text.ui("caption"), color: theme.textMuted },
  compactTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: touchTarget.min,
    borderRadius: radius.sm,
    flexShrink: 1,
  },
  compact: { ...text.display("displayThree"), color: theme.text, flexShrink: 1 },
  compactDetail: { ...text.display("displayThree"), color: theme.textMuted },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.sm,
    backgroundColor: theme.subtleFill,
  },
  divider: { width: 1, height: 16, backgroundColor: theme.border },
  iconButton: {
    minWidth: touchTarget.min,
    minHeight: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  dim: { opacity: 0.35 },
}));
