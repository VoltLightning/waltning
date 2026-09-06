/**
 * How much of the window the soft keyboard is covering, in points.
 *
 * **Listeners, never `Keyboard.metrics()`.** The metric is a snapshot with no
 * subscription behind it, so a component reading it once renders correctly
 * only if it happens to re-render at the right moment. These two events are
 * the ones both platforms emit — Android with `adjustResize` emits only the
 * `Did` pair, which is why the `Will` pair is not used here for iOS alone: one
 * source, one timing, one behaviour to reason about.
 *
 * **Zero on the web, by construction.** `react-native-web`'s `Keyboard` is a
 * stub whose `addListener` returns a subscription that never fires, so a
 * browser reports no keyboard and every consumer's arithmetic is untouched —
 * which is the correct answer there: the browser resizes the visual viewport
 * itself, and `useWindowDimensions` already follows it.
 */

import { useEffect, useState } from "react";
import { Keyboard } from "react-native";

export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
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
