/**
 * `useSheetLook` — with the keyboard up, the field being typed into is in view
 * inside the sheet.
 *
 * **The sheet clears the keyboard; the field has to clear the sheet.** The
 * library lifts the whole sheet above the keyboard and `sheetMaxHeight`
 * shortens it by the keyboard's height, so nothing is ever *under* the keys —
 * but a sheet that was taller than the room left scrolls its body, and a field
 * near the bottom of the body can be scrolled out of it. A page has the same
 * problem and `useKeyboardRoom` for it; a sheet needs only the second half of
 * that, the look, because the lift already made the room.
 *
 * The body's viewport is measured from parts this component draws — the
 * handle above it, the footer that floats over its end — because the
 * library's scroller hands back its scroll methods and no frame.
 */

import { type RefObject, useEffect } from "react";
import { TextInput } from "react-native";
import { type KeyboardFrame, type KeyboardScroller, lookFor } from "../../keyboard-room.ts";

/** The keyboard's own animation and the sheet's lift after it, then the look. */
export const LOOK_AFTER_LIFT_MS = 360;

function NOT_MINE(): void {}

export type SheetViewport<
  Handle extends KeyboardFrame,
  Footer extends KeyboardFrame,
  Content extends KeyboardFrame,
  Scroller extends KeyboardScroller,
> = {
  /** Everything above the body: the grab, the title, anything pinned. */
  handle: RefObject<Handle | null>;
  /** The footer floating over the body's end, when there is one. */
  footer: RefObject<Footer | null>;
  /** The body's content — the ancestor a field must be inside, and its top. */
  content: RefObject<Content | null>;
  /** The body's laid-out height. */
  bodyHeight: RefObject<number>;
  scroller: RefObject<Scroller | null>;
};

export function useSheetLook<
  Handle extends KeyboardFrame,
  Footer extends KeyboardFrame,
  Content extends KeyboardFrame,
  Scroller extends KeyboardScroller,
>(keyboard: number, viewport: SheetViewport<Handle, Footer, Content, Scroller>): void {
  const { handle, footer, content, bodyHeight, scroller } = viewport;
  useEffect(() => {
    if (keyboard <= 0) return;
    const timer = setTimeout(() => {
      const focused = TextInput.State.currentlyFocusedInput();
      const top = handle.current;
      const inner = content.current;
      const list = scroller.current;
      if (focused === null || focused === undefined) return;
      if (top === null || inner === null || list === null) return;
      // Only for a field in *this* sheet: a sheet opened over a page leaves
      // the page's fields mounted, and one of them may be the focused one.
      focused.measureLayout(
        inner,
        () => {
          top.measureInWindow((_x, handleTop, _w, handleHeight) => {
            const frameTop = handleTop + handleHeight;
            const bodyBottom = frameTop + bodyHeight.current;
            const look = (frameBottom: number) =>
              inner.measureInWindow((_cx, contentTop) => {
                focused.measureInWindow((_fx, fieldTop, _fw, fieldHeight) => {
                  const target = lookFor({
                    fieldTop,
                    fieldHeight,
                    contentTop,
                    frameTop,
                    frameBottom,
                    // The sheet is already above the keys: its own end is the floor.
                    keyboardTop: frameBottom,
                  });
                  if (target !== null) list.scrollTo({ y: target, animated: true });
                });
              });
            const floats = footer.current;
            if (floats === null) {
              look(bodyBottom);
              return;
            }
            floats.measureInWindow((_x2, footerTop) => {
              look(footerTop < bodyBottom ? footerTop : bodyBottom);
            });
          });
        },
        NOT_MINE,
      );
    }, LOOK_AFTER_LIFT_MS);
    return () => clearTimeout(timer);
  }, [keyboard, handle, footer, content, bodyHeight, scroller]);
}
