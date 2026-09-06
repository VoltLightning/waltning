/**
 * The soft keyboard, as two facts and a subscription — `safe-area.tsx`'s
 * shape for the other piece of device chrome that moves under a layout.
 *
 * **One platform question, asked once.** *Does the keyboard cover the window,
 * or does the window shrink to make room for it?* iOS overlays: the window
 * height does not change and anything bottom-anchored is simply behind the
 * keyboard. Android resizes — `adjustResize`, and Expo's own edge-to-edge
 * default `softwareKeyboardLayoutMode: "resize"` — so `useWindowDimensions`
 * has already taken the keyboard off and a layout that subtracted it again
 * would count it twice. The web resizes its visual viewport, which
 * `react-native-web`'s `Dimensions` follows, and its `Keyboard` is a stub
 * that never fires: the same answer as Android, for its own reason.
 *
 * That one fact decides both halves of a sheet's keyboard behaviour — how it
 * moves (`KeyboardAvoidingView`'s `behavior`) and how tall it may be
 * (`sheet-geometry.ts`'s cap) — so it is named here rather than asked twice
 * and answered differently.
 */

import { useEffect, useState } from "react";
import type { KeyboardAvoidingViewProps } from "react-native";
import { Keyboard, Platform } from "react-native";

/**
 * Whether the keyboard covers the window rather than shrinking it. iOS only —
 * see the header. A layout reads this to know whether it has to move itself.
 */
export const KEYBOARD_OVERLAPS_WINDOW = Platform.OS === "ios";

/**
 * `KeyboardAvoidingView`'s own behaviour, from the same fact. `"padding"`
 * where the keyboard overlays and the view has to lift out from under it;
 * `undefined` — the no-op — where the window already resized and lifting
 * would move the view twice.
 */
export const KEYBOARD_AVOIDANCE: KeyboardAvoidingViewProps["behavior"] = KEYBOARD_OVERLAPS_WINDOW
  ? "padding"
  : undefined;

/**
 * How much of the window the keyboard is covering, in points — **zero where
 * the window resizes instead**, because there the height a layout already has
 * is the answer.
 *
 * **Listeners, never `Keyboard.metrics()`.** The metric is a snapshot with no
 * subscription behind it, so a component reading it once renders correctly
 * only if it happens to re-render at the right moment. The `Did` pair is the
 * one both platforms emit, which is also why the iOS-only `Will` pair is not
 * used: one source, one timing, one behaviour to reason about.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!KEYBOARD_OVERLAPS_WINDOW) return;
    const shown = Keyboard.addListener("keyboardDidShow", (event) => {
      setHeight(event.endCoordinates.height);
    });
    const hidden = Keyboard.addListener("keyboardDidHide", () => setHeight(0));
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
