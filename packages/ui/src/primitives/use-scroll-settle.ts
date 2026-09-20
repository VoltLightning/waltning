/**
 * `useScrollSettle` — call back once, on the JS thread, when a scroller stops.
 *
 * **One `runOnJS` per gesture, not per frame.** The offset is a shared value
 * written sixty times a second on the UI thread; hopping to JS to debounce it
 * there would put sixty scheduler round-trips inside the gesture this whole
 * redesign exists to keep smooth. The waiting is done where the number already
 * is, and JS hears about it once, when there is something to hear.
 *
 * The rule itself is `scroll-settle.ts`, which is arithmetic and tested as
 * such — a hook can only be exercised by something that scrolls, and jsdom
 * does not.
 */

import { useCallback } from "react";
import {
  runOnJS,
  type SharedValue,
  useFrameCallback,
  useSharedValue,
} from "react-native-reanimated";
import { advance, justSettled, type Settling } from "./scroll-settle.ts";

export function useScrollSettle(offset: SharedValue<number>, onSettle: (at: number) => void): void {
  const state = useSharedValue<Settling>({ at: 0, still: 0 });
  // Stable, because a frame callback rebuilt every render is a frame callback
  // that loses the state it was accumulating.
  const report = useCallback((at: number) => onSettle(at), [onSettle]);

  useFrameCallback((frame) => {
    const elapsed = frame.timeSincePreviousFrame;
    const before = state.value;
    const after = advance(before, offset.value, elapsed === null ? 16 : elapsed);
    state.value = after;
    if (justSettled(before, after)) runOnJS(report)(after.at);
  });
}
