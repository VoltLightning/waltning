/**
 * `<PagerHeader>` — the row above `PageTabs`, shared by every page of S04's
 * pager and never scrolled away (S04 §3).
 *
 * **Two shapes, and the scroll is what moves between them.**
 *
 * - *At rest* the month is a large title with the year under it, and the whole
 *   title is the picker: tapping it opens Months, which is where you go when
 *   the month you want is not the next one. There are no arrows, because at
 *   the top of a screen the answer to "somewhere else" is usually not "one
 *   step".
 * - *Scrolled* the month has shrunk to a single row, the year has come up
 *   beside it, and the stepper has arrived next to search. The title is no
 *   longer a target worth aiming at, and stepping is the thing you want while
 *   reading a month — so the control arrives exactly when the reason for it
 *   does.
 *
 * **It is one control changing shape, and it is one set of elements moving.**
 * The month is a single `Text` that scales; the year is a single `Text` that
 * travels from under the month to beside it; the caret is one glyph that
 * follows the end of the title wherever the title now ends. Nothing is drawn
 * twice and nothing cross-fades, so there is no offset at which the header can
 * be showing neither of two copies of itself — which is exactly what the
 * stacked-and-faded version did at the midpoint of its travel, where both
 * layers were at zero and the bar was blank.
 *
 * **Transforms, never type that reflows.** A title that re-measured its text
 * every frame would put a text layout in the scroll's critical path, so the
 * month is laid out once at `displayTwo` and *scaled* to `displayThree`, and
 * the year is laid out once at `displayThree` and scaled down to a caption at
 * rest. Every part is drawn at its larger end and shrunk from there: type
 * scaled up is a raster stretched past its size, and type scaled down only
 * loses detail it had.
 *
 * **Two measured widths, and nothing else measured.** Where the year lands and
 * where the caret sits are the month's own width plus a gap, and a month's
 * width is its word in the reader's language — `wrzesień` is not `September`
 * and no constant knows either. So the two `Text`s report their widths through
 * `onLayout` into shared values, and `collapse.ts` does the arithmetic on the
 * UI thread. Both are `0` until the first layout, which is the right answer at
 * rest — the year is at the left edge and the caret is against the month — so
 * the mount is correct before anything has been measured.
 *
 * **Reanimated, and the geometry is not in here.** The styles are worklets, so
 * they run on the UI thread and the header tracks the finger rather than the
 * JS queue — and every number they use comes from `collapse.ts`, where
 * `vitest` can run the arithmetic for real (the test setup's `interpolate` is
 * a no-op, so a shape built from `interpolate` would be a shape nothing
 * checks).
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
import { type LayoutChangeEvent, Pressable, View } from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useInteraction } from "../../../primitives/interaction.ts";
import { text, textCap } from "../../../theme/fonts.ts";
import { useTheme } from "../../../theme/provider";
import { makeStyles } from "../../../theme/styles.ts";
import { focus, radius, touchTarget } from "../../../tokens.ts";
import { CaretDownIcon, CaretLeftIcon, CaretRightIcon, MagnifyingGlassIcon } from "../../phosphor";
import {
  CARET_REST,
  COLLAPSED_HEIGHT,
  caretScale,
  caretShiftX,
  collapseProgress,
  headerHeight,
  MONTH_ROW,
  monthScale,
  stepperArrival,
  stepperIsReal,
  TITLE_GAP,
  TITLE_PAD,
  titleTop,
  YEAR_SLOT,
  yearScale,
  yearShiftX,
  yearShiftY,
} from "./collapse.ts";

/** One box for all of them, so a glyph never changes a row's height. */
const ICON = 18;

/**
 * The room the trailing controls take, which is the room the title may not.
 *
 * Three touch targets and the stepper's hairline — the stepper is laid out at
 * this width whether or not it has arrived, so the reserve is the same at both
 * ends of the travel and does not have to be animated.
 */
const CONTROLS_WIDTH = touchTarget.min * 3 + 1;

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

  /**
   * The two widths the geometry cannot know, written where they are drawn.
   *
   * Shared values rather than state: they are read inside worklets on every
   * frame, and a re-render per measurement would put React in a path that only
   * ever runs when the reader's language or text size changes.
   */
  const monthWidth = useSharedValue(0);
  const yearWidth = useSharedValue(0);
  const hasYear = detail !== null;
  const measureMonth = useCallback(
    (event: LayoutChangeEvent) => {
      monthWidth.value = event.nativeEvent.layout.width;
    },
    [monthWidth],
  );
  const measureYear = useCallback(
    (event: LayoutChangeEvent) => {
      yearWidth.value = event.nativeEvent.layout.width;
    },
    [yearWidth],
  );

  // The styles read `scrollY` every frame on the UI thread; this crosses to JS
  // once, when the stepper becomes real. Its arrival is continuous and its
  // reachability is not — a control at 4% opacity is invisible and still
  // tappable, and a screen reader offers *previous month* on a screen where no
  // arrow is drawn.
  const [stepping, setStepping] = useState(false);
  // What JS has already been told, mirrored on the UI thread.
  //
  // **Not the reaction's own `previous`.** That is `null` on its first run, so
  // `next !== previous` is trivially true and the first scroll of a session
  // costs a render that changes nothing — measured at two per crossing instead
  // of one. Guarding on `previous !== null` is worse and was tried: the first
  // run is the first *observation*, not the mount, so on a page opened
  // already-scrolled it swallows the real transition and the stepper never
  // arrives at all. This mirror starts where the state does, so exactly one
  // render happens per genuine crossing and none for anything else.
  const sent = useSharedValue(false);
  useAnimatedReaction(
    () => stepperIsReal(collapseProgress(scrollY.value)),
    (next) => {
      if (next === sent.value) return;
      sent.value = next;
      scheduleOnRN(setStepping, next);
    },
    [scrollY],
  );

  const root = useAnimatedStyle(
    () => ({ height: headerHeight(collapseProgress(scrollY.value)) }),
    [scrollY],
  );
  const title = useAnimatedStyle(() => {
    const progress = collapseProgress(scrollY.value);
    // The block's padding is above the row, so the row's own top is that much
    // further down than the box the transform moves.
    return { transform: [{ translateY: titleTop(progress, monthWidth.value) - TITLE_PAD }] };
  }, [scrollY, monthWidth]);
  const month = useAnimatedStyle(
    () => ({ transform: [{ scale: monthScale(collapseProgress(scrollY.value)) }] }),
    [scrollY],
  );
  const year = useAnimatedStyle(() => {
    const progress = collapseProgress(scrollY.value);
    return {
      transform: [
        { translateX: yearShiftX(progress, monthWidth.value) },
        { translateY: yearShiftY(progress, monthWidth.value) },
        { scale: yearScale(progress, monthWidth.value) },
      ],
    };
  }, [scrollY, monthWidth]);
  const caret = useAnimatedStyle(() => {
    const progress = collapseProgress(scrollY.value);
    // **`hasYear`, not the measured width.** A width is only stale evidence
    // that something was drawn: `onLayout` does not fire on unmount, so a
    // header whose `detail` went from `2026` to `null` would keep the last
    // year's width and hold 40pt of empty room open beside a label with
    // nothing in it. What the caret needs to know is whether a year is on
    // screen now, and only the render knows that.
    const width = hasYear ? yearWidth.value : 0;
    return {
      transform: [
        { translateX: caretShiftX(progress, monthWidth.value, width) },
        { scale: caretScale(progress) },
      ],
    };
  }, [scrollY, monthWidth, yearWidth, hasYear]);
  const stepper = useAnimatedStyle(
    () => ({ opacity: stepperArrival(collapseProgress(scrollY.value)) }),
    [scrollY],
  );

  const pick = useCallback(() => onPickPeriod(), [onPickPeriod]);

  return (
    <Animated.View style={[styles.root, root]}>
      {/*
        The title is positioned rather than laid out in a row with the
        controls: its vertical place is a function of the progress — the year
        hangs under the month at rest and the pair is anchored to the header's
        bottom — and a flex row can only ever put it where the box ends.
      */}
      <Animated.View style={[styles.title, title]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={labels.pickPeriod}
          onPress={pick}
          {...handlers}
          style={[styles.titleBlock, focused ? styles.focused : null]}
        >
          <View style={styles.titleRow}>
            <Animated.Text
              accessibilityRole="header"
              onLayout={measureMonth}
              maxFontSizeMultiplier={textCap("displayTwo")}
              style={[styles.month, month]}
              numberOfLines={1}
            >
              {label}
            </Animated.Text>
            <Animated.View style={caret}>
              <CaretDownIcon size={CARET_REST} color={ink} />
            </Animated.View>
          </View>
          {/*
            Out of flow, so the row above keeps one height at both ends of the
            travel: the year is *drawn* under the month at rest and beside it
            collapsed, and a year that took a line in the layout would make the
            title block change height every frame — the one thing this whole
            file is arranged to avoid.
          */}
          {detail === null ? null : (
            <Animated.Text onLayout={measureYear} style={[styles.year, year]} numberOfLines={1}>
              {detail}
            </Animated.Text>
          )}
        </Pressable>
      </Animated.View>

      {/*
        The controls keep the bottom 48pt at both ends of the travel — the row
        the header closes down to. They do not move, which is what lets the
        title move against something.
      */}
      <View style={styles.controls}>
        {/*
          One control, not two buttons that happen to be adjacent. Split by a
          hairline inside a single track, a pair of chevrons reads as *step*;
          floating free they read as two more glyphs in a row that already has
          one.
        */}
        <Animated.View style={[styles.stepper, stepper]}>
          <IconButton
            onPress={onPrevious}
            accessibilityLabel={labels.previous}
            disabled={onPrevious === undefined}
            hidden={!stepping}
          >
            <CaretLeftIcon size={ICON - 2} color={ink} />
          </IconButton>
          <View style={styles.divider} />
          <IconButton
            onPress={onNext}
            accessibilityLabel={labels.next}
            disabled={onNext === undefined}
            hidden={!stepping}
          >
            <CaretRightIcon size={ICON - 2} color={ink} />
          </IconButton>
        </Animated.View>

        <IconButton
          onPress={onSearch}
          accessibilityLabel={labels.search}
          disabled={false}
          hidden={false}
        >
          <MagnifyingGlassIcon size={ICON} color={ink} />
        </IconButton>
      </View>
    </Animated.View>
  );
}

/**
 * `react-native-web` maps neither native hiding prop, so without these a
 * control that has not arrived stays in the web build's accessibility tree and
 * a reader is offered arrows that are not drawn (`conformance.test.ts`).
 */
const HIDDEN: { "aria-hidden": true } = { "aria-hidden": true };
const SHOWN: { "aria-hidden": false } = { "aria-hidden": false };

export const PagerHeader = memo(PagerHeaderView);

const useStyles = makeStyles((theme) => ({
  root: { overflow: "hidden" },
  /**
   * **`right` is not optional.** The title and the controls used to share one
   * flex row, so `flexShrink` truncated the month before it reached the
   * magnifier. Positioned, they have no layout relationship at all and
   * `numberOfLines={1}` truncates at the *header's* width — which is fine for
   * `September` at the default text size and is not fine for a longer month at
   * a large one, where the title runs under the stepper. The reserve is the
   * controls' own width, which is a constant: they are fixed-size icon buttons
   * and are laid out at that width whether or not the stepper is drawn yet.
   */
  title: { position: "absolute", left: 0, top: 0, right: CONTROLS_WIDTH },
  controls: {
    position: "absolute",
    right: 0,
    bottom: 0,
    height: COLLAPSED_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
  },
  /**
   * The picker's target: the row, plus the room the year sits in under it.
   *
   * **The year is drawn out of flow but has to be inside this box.** React
   * Native delivers no touch to a child rendered outside its parent's bounds,
   * so a block sized to the row alone would leave the lower half of `2026`
   * tappable on web and dead on both phones — the worst kind of difference,
   * because the surface that is easiest to check is the one that works. The
   * padding is static: the title's own position is computed from where the row
   * sits inside this box, so a padding that moved would move the title twice.
   * Collapsed, the last few points hang below the header and are clipped with
   * it, which still leaves more than the 44pt minimum.
   */
  titleBlock: {
    paddingTop: TITLE_PAD,
    paddingBottom: YEAR_SLOT,
    borderRadius: radius.sm,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: TITLE_GAP, height: MONTH_ROW },
  /**
   * **The left edge and the vertical centre are pinned**, so the month grows
   * and shrinks in place. S04 §3: the month never moves sideways.
   */
  month: {
    ...text.display("displayTwo"),
    color: theme.text,
    transformOrigin: "left center",
    // So a month too long for the reserve ellipsizes rather than pushing the
    // caret out of the block. The measured width is then the truncated width,
    // which is the width the year has to clear — still the right number.
    flexShrink: 1,
  },
  /**
   * Laid out at `displayThree` — the size it reaches — and scaled down to a
   * caption at rest. Positioned from the row's own height so the drop under
   * the month is the line height rather than a number that has to be kept in
   * step with one.
   */
  year: {
    ...text.display("displayThree"),
    color: theme.textMuted,
    position: "absolute",
    left: 0,
    top: TITLE_PAD + MONTH_ROW,
    transformOrigin: "left center",
  },
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
