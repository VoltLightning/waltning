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
import type { FrameInfo } from "react-native-reanimated";
import {
  runOnJS,
  type SharedValue,
  useFrameCallback,
  useSharedValue,
} from "react-native-reanimated";
import { advance, justSettled, type Settling, UNREAD } from "./scroll-settle.ts";

/**
 * @param active Whether this scroller is the one on screen. **Not optional in
 *   practice**: the offset it watches may be shared by several pages that are
 *   all mounted at once, and a settle reported for someone else's gesture is
 *   read through this caller's geometry and means something else entirely.
 */
export function useScrollSettle(
  offset: SharedValue<number>,
  onSettle: (at: number) => void,
  active = true,
): void {
  const state = useSharedValue<Settling>(UNREAD);
  const report = useCallback((at: number) => onSettle(at), [onSettle]);

  /**
   * **Memoised, because `useFrameCallback` re-registers on identity.**
   * Reanimated's own effect depends on the callback, and the worklets plugin
   * builds a fresh function with a fresh closure per evaluation — so an inline
   * arrow here tore the frame callback down and put it back on *every* render.
   * What that costs is not the state, which is a shared value: it is the
   * registry's `startTime`, reset to `null` on every re-register, so the next
   * frame reports no elapsed time and this substitutes a fictitious 16ms; and
   * a re-register that empties the active set restarts the whole
   * `requestAnimationFrame` loop, which drops strip frames mid-gesture.
   */
  const watch = useCallback(
    (frame: FrameInfo) => {
      "worklet";
      if (!active) {
        // **Forgotten, not merely skipped.** Returning early left the last
        // offset standing, so the first active frame after a page change
        // compared it against whatever the offset is now and called that a
        // movement — then reported a settle 140ms later for a gesture that
        // happened on another page.
        state.value = UNREAD;
        return;
      }
      const elapsed = frame.timeSincePreviousFrame;
      const before = state.value;
      const after = advance(before, offset.value, elapsed === null ? 16 : elapsed);
      state.value = after;
      if (after.at !== null && justSettled(before, after)) runOnJS(report)(after.at);
    },
    [active, offset, report, state],
  );

  useFrameCallback(watch);
}
