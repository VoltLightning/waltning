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
 *
 * **The same event, and the same field of it.** `KeyboardAvoidingView` lifts
 * by `frame.height − endCoordinates.screenY`; `endCoordinates.height` is a
 * different number on Android — see `keyboardHeightFrom`. Reading the other
 * field is how a mechanism with one source and one timing still ends up with
 * two quantities.
 */

import { useEffect, useState } from "react";
import type {
  KeyboardAvoidingViewProps,
  KeyboardEventName,
  KeyboardMetrics,
  PlatformOSType,
} from "react-native";
import { Dimensions, Keyboard, Platform, StatusBar, useWindowDimensions } from "react-native";
import { useWindowInsets } from "./safe-area";

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

/** What the device says about its own geometry, in points. */
export type DeviceFrame = {
  /** `Dimensions.get("screen")` — the whole display. */
  screenHeight: number;
  /** `Dimensions.get("window")` — which may or may not include the system bars. */
  windowHeight: number;
  /** The status bar, which is where a window that gave the bars up begins. */
  statusBar: number;
  /** The safe-area inset at the bottom: non-zero exactly when the layout runs under the navigation bar. */
  bottomInset: number;
};

/**
 * Where the app's layout ends, in **screen** coordinates — the one number a
 * keyboard's `screenY` can be taken from.
 *
 * **`window.height` is not it, and an emulator is what said so.** On a Pixel
 * the window metrics were 876 of a 952pt screen — the display less both system
 * bars — while the layout ran from under the status bar to the very bottom of
 * the screen, 900pt, because the navigation bar is translucent and the app
 * draws under it. `876 − screenY` came up 76pt short: on *Add*, exactly one
 * Save button, hidden behind the keyboard it was supposed to be riding.
 *
 * The layout reaches the bottom of the screen when it draws under the
 * navigation bar — which is what a non-zero bottom inset *means* — or when the
 * window already is the screen (edge-to-edge, and iOS). Otherwise it ends where
 * the window does, which starts under the status bar.
 */
export function layoutBottomOnScreen(device: DeviceFrame): number {
  if (device.bottomInset > 0 || device.windowHeight >= device.screenHeight) {
    return device.screenHeight;
  }
  return device.statusBar + device.windowHeight;
}

/**
 * How much of the layout a keyboard event covers — **from `screenY`, not from
 * `height`**, because those are two different numbers on Android and this has
 * to be the same quantity `KeyboardAvoidingView` lifts by.
 * `ReactRootView.java` builds the two fields from different inset sets:
 * `height` is `ime().bottom − systemBars().bottom`, explicitly net of the
 * navigation bar, while `screenY` is the visible frame's own bottom edge. So a
 * cap that shrank by `height` under-shrank by the navigation-bar inset wherever
 * the layout runs under that bar. On iOS the two agree for a docked keyboard.
 */
export function keyboardHeightFrom(device: DeviceFrame, keyboard: KeyboardMetrics): number {
  return Math.max(0, layoutBottomOnScreen(device) - keyboard.screenY);
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
/** Both halves of what a layout needs to know about the keyboard. */
export type KeyboardCover = {
  /** How much of the layout it covers, in points. Zero with it away. */
  height: number;
  /** Its top edge in **screen** coordinates, or `null` with it away. */
  top: number | null;
};

const AWAY: KeyboardCover = { height: 0, top: null };

export function useKeyboard(): KeyboardCover {
  const [cover, setCover] = useState(AWAY);
  const frame = useWindowDimensions();
  const windowHeight = frame.height;
  // **The window's inset, not the slot's.** The tab shell hands its slot a zero
  // bottom, and a zero bottom here reads as *the layout stops at the
  // navigation bar* — which is a fact about the device, not about the slot.
  const bottomInset = useWindowInsets().bottom;

  useEffect(() => {
    if (!KEYBOARD_OVERLAPS_WINDOW) return;
    const { show, hide } = keyboardEvents(Platform.OS);
    const shown = Keyboard.addListener(show, (event) => {
      const device = {
        screenHeight: Dimensions.get("screen").height,
        windowHeight,
        statusBar: StatusBar.currentHeight ?? 0,
        bottomInset,
      };
      setCover({
        height: keyboardHeightFrom(device, event.endCoordinates),
        top: event.endCoordinates.screenY,
      });
    });
    const hidden = Keyboard.addListener(hide, () => setCover(AWAY));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [windowHeight, bottomInset]);

  return cover;
}

export function useKeyboardHeight(): number {
  return useKeyboard().height;
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
