import { COLLAPSE_TRAVEL } from "@waltning/ui/shell/molecules/pager-header/collapse";
import { withTiming } from "react-native-reanimated";

/**
 * The rules for who the header listens to, as plain functions over shared
 * values — worklets, so the UI thread runs them, and plain enough that a test
 * can hand them `{ value }` objects.
 *
 * **One offset, four pages.** The header collapses from a single number. Each
 * page keeps its own offset and lends it to the header only while it is the
 * page on screen; arriving on a page hands the header that page's offset.
 */

/** How long the header takes to reach the arriving page's shape, in ms. */
export const HANDOVER_MS = 200;

type Value<T> = { value: T };

/** A page scrolled. Its own offset is always kept; the header hears it only while it is showing. */
export function pageScrolled(
  showing: Value<boolean>,
  own: Value<number>,
  header: Value<number>,
  offset: number,
): void {
  "worklet";
  own.value = offset;
  if (showing.value) header.value = offset;
}

/**
 * A page became the one on screen. The header moves to that page's own shape
 * — by a short timing, or at once under reduced motion — so a List at the top
 * is never left under the header a Summary scroll collapsed, and the change of
 * shape is a movement rather than a snap. A scroll event on the page cancels
 * the timing by writing the value, so a finger is never fought.
 */
export function pageArrived(
  now: boolean,
  own: Value<number>,
  header: Value<number>,
  reduced: Value<boolean>,
): void {
  "worklet";
  if (!now) return;
  // **Both ends are clamped to the travel.** The header changes shape only
  // between 0 and `COLLAPSE_TRAVEL`; timing the raw offset spends most of the
  // duration where nothing moves (from 200, the header would sit collapsed and
  // open in the last fraction) and from far down it is a snap.
  const target = Math.min(Math.max(own.value, 0), COLLAPSE_TRAVEL);
  if (reduced.value) {
    header.value = target;
    return;
  }
  header.value = Math.min(Math.max(header.value, 0), COLLAPSE_TRAVEL);
  header.value = withTiming(target, { duration: HANDOVER_MS });
}
