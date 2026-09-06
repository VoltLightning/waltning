/**
 * `<BottomSheet>` — `design-system/05` §5.1: *170px from top; search, content,
 * pinned footer.*
 *
 * **The sheet owns its height, and that is the whole design.** It used to be
 * a plain `View` at the bottom of the screen whose height was whatever its
 * children summed to — so a form-shaped sheet (filter, reconcile, settle,
 * rename) grew past the top of the window, its bottom edge sat flush with the
 * device edge, and everything below the fold was unreachable because nothing
 * in it scrolled. Pickers looked fine only because each brought its own
 * bounded `ScrollView`; the sheet was never the thing keeping them on screen.
 *
 * So the three parts are named here rather than left to the caller: a header
 * that does not scroll, a body that always does, and a `footer` slot pinned
 * under it. A caller that passes no footer still gets a bounded, scrolling
 * sheet — the fix cannot be opt-in, because the sheets that needed it are
 * exactly the ones that never asked.
 *
 * **The bound is the window, not a constant.** `maxHeight` is the window
 * height less the greater of §5.1's 170px top offset and the device's own top
 * inset plus breathing room — a phone whose status bar is taller than the
 * design's offset still gets a sheet under it rather than behind it. The
 * bottom inset is padding rather than a subtraction: the sheet reaches the
 * edge of the screen, and it is the *content* that clears the home indicator.
 *
 * **Nested scrolling stays a caller's option.** `AccountPicker` and
 * `CategorySheet` bring their own bounded lists; those still lay out at their
 * own height inside this body, and `nestedScrollEnabled` is what keeps
 * Android from swallowing the inner gesture into this one. On web the body
 * carries `overscroll-behavior: contain`, so reaching the end of the list
 * stops there instead of scrolling the page behind the sheet.
 */

import { useCallback, useState } from "react";
import type { ViewStyle } from "react-native";
import { Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import { useSafeArea } from "../primitives/safe-area";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../tokens.ts";

/** §5.1's own number: the sheet may reach to 170px from the top of the window. */
const TOP_OFFSET = 170;

/**
 * The floor, for a window shorter than the offset — a landscape phone, a small
 * browser. Three targets: the header, one row, and the footer under it. Without
 * it the arithmetic can return a negative height and the sheet vanishes.
 */
const MIN_HEIGHT = touchTarget.min * 3;

/**
 * `overscroll-behavior` is a web property `react-native-web` forwards to CSS
 * and native has no equivalent for, so `ViewStyle` does not declare it. Named
 * here as an intersection rather than cast: the shape stays checked, and the
 * one extra property is visible instead of hidden behind an assertion.
 */
const containOverscroll: ViewStyle & { overscrollBehavior?: "contain" } = {
  overscrollBehavior: "contain",
};

export type BottomSheetProps = {
  visible: boolean;
  title: string;
  onDismiss: () => void;
  /**
   * Pinned under the body — §5.1's own third part. It never scrolls away, so
   * a sheet's one commitment (Save, Settle, Apply) is reachable at any scroll
   * position and at any window height.
   */
  footer?: React.ReactNode;
  children: React.ReactNode;
};

export function BottomSheet({ visible, title, onDismiss, footer, children }: BottomSheetProps) {
  const t = useT();
  const [backdropFocused, setBackdropFocused] = useState(false);
  const styles = useStyles();
  const insets = useSafeArea();
  const { height } = useWindowDimensions();
  const handleFocus = useCallback(() => setBackdropFocused(true), []);
  const handleBlur = useCallback(() => setBackdropFocused(false), []);

  // Per-window and per-device, so not in `useStyles` — that cache is keyed on
  // the theme alone and would hand the second device the first one's window.
  const bounds = {
    maxHeight: Math.max(MIN_HEIGHT, height - Math.max(TOP_OFFSET, insets.top + space.x5)),
    paddingBottom: space.x5 + insets.bottom,
  };

  if (!visible) return null;
  return (
    <Modal transparent visible onRequestClose={onDismiss} animationType="none">
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Dismiss ${title}`}
          onPress={onDismiss}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={[styles.backdrop, backdropFocused ? styles.backdropFocused : null]}
        />
        <View accessibilityLabel={title} accessibilityViewIsModal style={[styles.sheet, bounds]}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Button label={t("common.close")} onPress={onDismiss} variant="ghost" />
          </View>
          <ScrollView
            testID="bottom-sheet-body"
            style={[styles.body, containOverscroll]}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            // A caller's own bounded list lives inside this one on Android.
            nestedScrollEnabled
          >
            {children}
          </ScrollView>
          {footer === undefined ? null : <View style={styles.footer}>{footer}</View>}
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((theme) => ({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    minHeight: touchTarget.min,
    backgroundColor: theme.scrim,
    opacity: 0.5,
  },
  backdropFocused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  /**
   * `flexShrink: 1` beside the `maxHeight` the component computes: the cap is
   * what bounds the sheet, and the shrink is what lets the body inside it give
   * way rather than overflow when the content is taller than the cap.
   * The bottom padding is added per-device by `bounds`, not here.
   */
  sheet: {
    flexShrink: 1,
    backgroundColor: theme.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.x5,
    paddingTop: space.x5,
    gap: space.x4,
    shadowColor: theme.elevation.raised.shadowColor,
    shadowOpacity: theme.elevation.raised.shadowOpacity,
    shadowRadius: theme.elevation.raised.shadowRadius,
    shadowOffset: theme.elevation.raised.shadowOffset,
    borderWidth: theme.elevation.raised.borderWidth,
    borderColor: theme.elevation.raised.borderColor,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: theme.text, ...text.ui("displayThree") },
  /** The one part that gives way — header and footer keep their own height. */
  body: { flexShrink: 1 },
  /** The gap the sheet used to apply to every child directly. */
  bodyContent: { gap: space.x4 },
  footer: { gap: space.md },
}));
