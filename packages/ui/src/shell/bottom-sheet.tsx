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
 * **The bound is the window and the keyboard, not a constant.**
 * `sheet-geometry.ts` holds that arithmetic and the argument for it: the cap
 * is the window less §5.1's 170px top offset (or the device's own top inset
 * plus breathing room, whichever leaves less), *and* less whatever the soft
 * keyboard covers.
 *
 * **The sheet moves out from under the keyboard; it does not scroll.** On a
 * phone the keyboard covers the window rather than shrinking it — both
 * phones, and `keyboard.ts` has the argument for why that is as true of
 * Android as of iOS, and why `navigationBarTranslucent` below is part of the
 * reason — so a bottom-anchored sheet is simply behind it: an iOS
 * `decimal-pad` has no return key and covers about 291 of a ~340px sheet,
 * which leaves the header and 49px nobody can scroll their way out of. So the
 * sheet — not the overlay, which must stay the full window for the backdrop —
 * is wrapped in a `KeyboardAvoidingView`, and the cap above shrinks by the
 * same height, on the same keyboard event, so the lift stops the sheet's head
 * at the top of the window rather than pushing it through.
 *
 * **A backdrop press with the keyboard up puts the keyboard away, not the
 * sheet.** The tap was aimed at the keyboard, and dismissing here would throw
 * away what had just been typed. First press outside closes the keyboard,
 * second closes the sheet. `keyboardShouldPersistTaps="handled"` on the body
 * is the other half of the same rule: a tap on *Save* inside the sheet lands
 * rather than being eaten by the dismissal.
 *
 * **Both Android windows are translucent.** Under edge-to-edge — mandatory
 * from Expo SDK 54 — the app window includes the system bars, but a `Modal`
 * defaults to a window *inset* by them. Left alone, this sheet would pay the
 * navigation-bar inset twice: once because the modal window already stops
 * above it, and again in its own `paddingBottom`. `statusBarTranslucent` and
 * `navigationBarTranslucent` make the modal's window the app's window, so the
 * insets this component reads are the ones it is actually sitting in. iOS and
 * the web ignore both props.
 *
 * That is also what makes the lift above Android's only keyboard mechanism:
 * an edge-to-edge dialog window ignores `SOFT_INPUT_ADJUST_RESIZE`, so the
 * resize that used to carry the sheet up for free is gone and this component
 * has to carry it. One mechanism on both phones is the point; two would be
 * two things to keep true.
 *
 * **Nested scrolling is the caller's, not this component's.**
 * `nestedScrollEnabled` makes the view it is set on a nested-scrolling
 * *child*, so a bounded list inside this body carries it — the sheet body
 * does not. On web the body carries `overscroll-behavior: contain`, so
 * reaching the end of it stops there instead of scrolling the page behind the
 * sheet.
 */

import { useCallback, useState } from "react";
import type { ViewStyle } from "react-native";
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import { useSafeArea } from "../primitives/safe-area";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../tokens.ts";
import { dismissKeyboard, KEYBOARD_AVOIDANCE, useKeyboardHeight } from "./keyboard.ts";
import { sheetBounds } from "./sheet-geometry.ts";

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
  const frame = useWindowDimensions();
  const keyboard = useKeyboardHeight();
  const handleFocus = useCallback(() => setBackdropFocused(true), []);
  const handleBlur = useCallback(() => setBackdropFocused(false), []);

  // The keyboard first, the sheet second — see the header.
  const handleBackdropPress = useCallback(() => {
    if (keyboard > 0) {
      dismissKeyboard();
      return;
    }
    onDismiss();
  }, [keyboard, onDismiss]);

  // Per-window, per-device and per-keyboard, so not in `useStyles` — that
  // cache is keyed on the theme alone and would hand the second device the
  // first one's window.
  const bounds = sheetBounds(frame, insets, keyboard);

  if (!visible) return null;
  return (
    // **The name goes on the `Modal`, not on the sheet inside it.**
    // `react-native-web` renders a modal as a `dialog` and spreads the props
    // it was given onto that element, so this is the only placement that
    // names the dialog a screen reader announces; on the sheet `View` two
    // levels in, the label named a generic `div` and the dialog stayed
    // anonymous. React Native's own `Modal` enumerates its props and takes no
    // accessible name, so on a phone the sheet's own visible title is what is
    // read — which is why `accessibilityViewIsModal` stays where it is.
    <Modal
      accessibilityLabel={title}
      transparent
      visible
      onRequestClose={onDismiss}
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.dismissSheet", { title })}
          onPress={handleBackdropPress}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={[styles.backdrop, backdropFocused ? styles.backdropFocused : null]}
        />
        {/* Around the sheet, never around the overlay: the overlay is the
            backdrop's own full-window target, and a `KeyboardAvoidingView`
            there would shrink the thing that has to stay the window. */}
        <KeyboardAvoidingView behavior={KEYBOARD_AVOIDANCE}>
          <View testID="bottom-sheet" accessibilityViewIsModal style={[styles.sheet, bounds]}>
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <Button label={t("common.close")} onPress={onDismiss} variant="ghost" />
            </View>
            <ScrollView
              testID="bottom-sheet-body"
              style={[styles.body, containOverscroll]}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
            {footer === undefined ? null : <View style={styles.footer}>{footer}</View>}
          </View>
        </KeyboardAvoidingView>
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
