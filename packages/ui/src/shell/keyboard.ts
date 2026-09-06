/**
 * The soft keyboard, as three platform facts and a subscription —
 * `safe-area.tsx`'s shape for the other piece of device chrome that moves
 * under a layout.
 *
 * **On a phone the keyboard covers the window; it does not shrink it.** That
 * is true of Android as well as iOS, and the first cut of this file said
 * otherwise — that `adjustResize` and Expo's edge-to-edge
 * `softwareKeyboardLayoutMode: "resize"` meant `useWindowDimensions` had
 * already taken the keyboard off. Both halves are false, and the second one
 * is false *because of this component*:
 *
 * - `DeviceInfoModule.kt` computes the window metrics as the display bounds,
 *   or those bounds less `systemBars() | displayCutout()`. The IME is in
 *   neither set, under either branch — the height a layout reads is the same
 *   with the keyboard up.
 * - `ReactModalHostView.kt` does set `SOFT_INPUT_ADJUST_RESIZE` on the
 *   dialog, but its `updateProperties` calls `dialogWindow.enableEdgeToEdge()`
 *   as soon as `navigationBarTranslucent` is set — which is
 *   `WindowCompat.setDecorFitsSystemWindows(window, false)`, and
 *   `SOFT_INPUT_ADJUST_RESIZE` is deprecated in favour of exactly that call
 *   plus an `ime()` inset listener. Nothing here installs one. `BottomSheet`
 *   sets `navigationBarTranslucent` (it has to, or the sheet pays the
 *   navigation-bar inset twice), so the resize that used to hide the problem
 *   is gone.
 *
 * One mechanism, then, on both phones: the layout reads a real keyboard
 * height and moves itself. The web is the only place the window really does
 * shrink — the browser resizes its own visual viewport and
 * `react-native-web`'s `Dimensions` follows it — and there
 * `react-native-web`'s `Keyboard` is a stub that never fires, so the height
 * is zero and nothing double-counts.
 *
 * **The event pair is `KeyboardAvoidingView`'s, not a preference.** RN's own
 * component subscribes to `keyboardWillShow`/`keyboardWillHide` on iOS and
 * the `Did` pair everywhere else. A layout that lifts with `KeyboardAvoiding
 * View` and sizes itself off a *different* event has two timings: on iOS the
 * lift starts at `will` (t≈0) and a cap that shrank at `did` (t≈+250ms) would
 * leave a tall sheet's head off the top of the window for the length of the
 * keyboard animation. So `keyboardEvents` mirrors that file exactly, and
 * these are the functions the mirroring is tested against.
 */

import { useEffect, useState } from "react";
import type { KeyboardAvoidingViewProps, KeyboardEventName, PlatformOSType } from "react-native";
import { Keyboard, Platform } from "react-native";

/**
 * Whether the keyboard covers the window rather than the window shrinking to
 * make room for it. Both phones do; only the web resizes. A layout reads this
 * to know whether it has to move itself.
 */
export function keyboardOverlapsWindow(os: PlatformOSType): boolean {
  return os !== "web";
}

/**
 * `KeyboardAvoidingView`'s own behaviour, from the same fact. `"padding"`
 * where the keyboard overlays and the view has to lift out from under it;
 * `undefined` — the no-op — where the window has already resized and lifting
 * would move the view twice.
 */
export function keyboardAvoidance(os: PlatformOSType): KeyboardAvoidingViewProps["behavior"] {
  return keyboardOverlapsWindow(os) ? "padding" : undefined;
}

/**
 * The pair of events to size against — the same pair `KeyboardAvoidingView`
 * lifts on, so a lift and a resize that answer the same keyboard never
 * disagree about when it arrived.
 */
export function keyboardEvents(os: PlatformOSType): {
  show: KeyboardEventName;
  hide: KeyboardEventName;
} {
  return os === "ios"
    ? { show: "keyboardWillShow", hide: "keyboardWillHide" }
    : { show: "keyboardDidShow", hide: "keyboardDidHide" };
}

/** This platform's answers, resolved once. */
export const KEYBOARD_OVERLAPS_WINDOW = keyboardOverlapsWindow(Platform.OS);
export const KEYBOARD_AVOIDANCE = keyboardAvoidance(Platform.OS);

/**
 * How much of the window the keyboard is covering, in points — zero on the
 * web, where the window has already shrunk and the `Keyboard` module is a
 * stub.
 *
 * **Listeners, never `Keyboard.metrics()`.** The metric is a snapshot with no
 * subscription behind it, so a component reading it once renders correctly
 * only if it happens to re-render at the right moment.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!KEYBOARD_OVERLAPS_WINDOW) return;
    const { show, hide } = keyboardEvents(Platform.OS);
    const shown = Keyboard.addListener(show, (event) => {
      setHeight(event.endCoordinates.height);
    });
    const hidden = Keyboard.addListener(hide, () => setHeight(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  return height;
}

/**
 * Put the keyboard away without closing what is behind it.
 *
 * A backdrop press with the keyboard up means *stop typing*, not *throw the
 * form away*: dismissing the sheet there loses a rate someone had just
 * entered, and the tap that dismissed it was aimed at the keyboard. So the
 * first press outside takes the keyboard down and the second one closes the
 * sheet.
 */
export function dismissKeyboard(): void {
  Keyboard.dismiss();
}
