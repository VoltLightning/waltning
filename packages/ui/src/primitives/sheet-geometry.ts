/**
 * How tall a bottom sheet is and where its bottom edge sits, as arithmetic —
 * `float-geometry.ts`'s shape, for the other object that has to live inside a
 * window it does not own.
 *
 * Three inputs, and the third is the one a sheet is usually wrong about. The
 * window height and the device's insets are static facts; the **keyboard** is
 * not, and on a phone it covers the window rather than shrinking it
 * (`keyboard.ts` has the argument, and why that is as true of Android as of
 * iOS). A sheet that is bottom-anchored in a `Modal` and capped against the
 * window alone therefore keeps drawing under the keyboard: on a 390×844 phone
 * the sheet occupies y 170–844, an iOS `decimal-pad` covers roughly y
 * 508–844, and the pinned footer and the field being typed into are both in
 * the covered third. That falsifies the whole reason the footer is pinned.
 *
 * **Scrolling is not the fix; the sheet has to move.** Scrolling inside the
 * ~49px the keyboard leaves is not reaching anything. So the sheet lifts —
 * `KeyboardAvoidingView` does that part, because it is the platform's own
 * lift and it follows the keyboard's own animation curve — and the **cap
 * shrinks** by the same height here, so the lift pushes the sheet's head
 * against the top of the window instead of through it. The device's bottom
 * inset is dropped while the keyboard is up, because the home indicator is
 * behind the keyboard and clearing it there would be clearing it twice.
 *
 * `keyboard` is already zero on the web, where the window resizes itself, so
 * nothing below has to ask which platform it is on.
 *
 * **The home indicator is paid once, here.** The sheet reaches the bottom of
 * the screen and its *content* clears the device, so the inset is padding on
 * the sheet rather than a subtraction from its height — the last row sits
 * above the indicator instead of on it, and the surface still runs to the
 * edge. Once, and only once: nothing inside the sheet adds it again, and the
 * `Modal` is opened with `navigationBarTranslucent` so its window is the
 * app's own rather than one already inset by the Android navigation bar,
 * which would have been the second payment.
 *
 * On the web nothing happens: `react-native-web`'s `Keyboard` never fires, so
 * the height is zero and every value below is what it was.
 */

import type { ViewStyle } from "react-native";
import { space, touchTarget } from "../tokens.ts";
import type { SafeAreaInsets } from "./safe-area";

/** `05-composites` §5.1: the sheet may reach to 170px from the top of the window. */
export const SHEET_TOP_OFFSET = 170;

/**
 * The side gutter every part of a sheet keeps — the head, the pinned row, the
 * body and the footer, which is why it is one value and not four.
 *
 * **Named because something inside a sheet has to cancel it.** A horizontal
 * chip row is the one child whose content is meant to run past the gutter: cut
 * at the padding edge, the last chip reads as a clipped control, and cut at the
 * sheet's own edge it reads as a row with more to the right. Cancelling it
 * takes the number, and a sheet's gutter spelled a second time in the sheet's
 * children is the pair that drifts.
 */
export const SHEET_GUTTER = space.x5;

/**
 * The floor, for a window shorter than the offset — a landscape phone, a small
 * browser, a keyboard eating two thirds of the screen. Three targets: the
 * header, one row, and the footer under it. Without it the arithmetic can
 * return a negative height and the sheet vanishes.
 */
export const SHEET_MIN_HEIGHT = touchTarget.min * 3;

export type Frame = { width: number; height: number };

/**
 * The sheet's own box: how tall it may be and what it pads inside itself.
 * The lift out from under the keyboard is `KeyboardAvoidingView`'s.
 */
/**
 * The ceiling, as a number.
 *
 * **Named separately because a `ViewStyle` widens it.** `maxHeight` on a style
 * is a `DimensionValue` — it could be `"50%"` — and `@gorhom/bottom-sheet`'s
 * `maxDynamicContentSize` takes points. Reading it back off `sheetBounds` meant
 * casting a value this function always computes as a number, which is the kind
 * of loose seam CLAUDE.md warns about: the cast would have been correct today
 * and silent the day someone returned a percentage here.
 */
export function sheetMaxHeight(frame: Frame, insets: SafeAreaInsets, keyboard: number): number {
  // **With the keyboard up the sheet may rise to the status bar.** The 170
  // above it is there to keep the page in sight behind a sheet being looked
  // at; one being typed into has lost half the window to the keys, and on a
  // phone the 170 was most of what was left of a picker's list.
  const top =
    keyboard > 0 ? insets.top + space.x5 : Math.max(SHEET_TOP_OFFSET, insets.top + space.x5);
  return Math.max(SHEET_MIN_HEIGHT, frame.height - top - keyboard);
}

export function sheetBounds(frame: Frame, insets: SafeAreaInsets, keyboard: number): ViewStyle {
  return {
    maxHeight: sheetMaxHeight(frame, insets, keyboard),
    paddingBottom: sheetBottomInset(insets, keyboard),
  };
}

/**
 * The clearance under the sheet's content.
 *
 * Separate from the ceiling because the two now have different owners: since
 * `@gorhom/bottom-sheet` sizes the sheet itself, the *ceiling* is handed to it
 * as `maxDynamicContentSize` and the content inside must not carry a second,
 * larger `maxHeight` of its own — it would let the content outgrow the sheet
 * the library actually drew. The bottom inset is still ours.
 *
 * The home indicator is behind the keyboard while it is up, so it is not paid
 * for twice.
 */
export function sheetBottomInset(insets: SafeAreaInsets, keyboard: number): number {
  return space.x5 + (keyboard > 0 ? 0 : insets.bottom);
}

/**
 * Where the sheet's top edge lands once it has been lifted clear of the
 * keyboard, in window coordinates. Exists so the half of the promise the
 * component does not own — *the lift does not push the head off the window* —
 * can be asserted as a number rather than looked at.
 */
export function sheetTopEdge(frame: Frame, keyboard: number, bounds: ViewStyle): number {
  const height = typeof bounds.maxHeight === "number" ? bounds.maxHeight : 0;
  return frame.height - keyboard - height;
}
