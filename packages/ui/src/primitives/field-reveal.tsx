/**
 * `FieldRevealProvider` — how a form scrolls its own scroller to a field, and
 * `useFieldReveal` to ask.
 *
 * **The scroller is never the form's.** A form is laid out inside a
 * `GroundPanel` on a screen or a sheet's body, and it knows neither; each of
 * those provides this over its own scroller and the zero-height mark at the
 * top of its content. The field's offset is its window top minus the mark's
 * — both measured now, so it holds at whatever the scroller has scrolled to.
 *
 * Outside a provider the reveal does nothing, which is the right answer for a
 * form that is not in a scroller at all.
 */

import { createContext, type ReactNode, type RefObject, useCallback, useContext } from "react";
import { space } from "../tokens.ts";
import type { KeyboardFrame, KeyboardScroller } from "./keyboard-room.ts";

/** Room left above the field, so its label is in view as well as its box. */
const REVEAL_MARGIN = space.x3;

type Reveal = (field: KeyboardFrame) => void;

function nowhere(): void {}

const RevealContext = createContext<Reveal>(nowhere);

export function useFieldReveal(): Reveal {
  return useContext(RevealContext);
}

export type FieldRevealProviderProps<
  Scroller extends KeyboardScroller,
  Mark extends KeyboardFrame,
> = {
  scroller: RefObject<Scroller | null>;
  /** The zero-height mark at the top of the scroller's content. */
  contentTop: RefObject<Mark | null>;
  children: ReactNode;
};

export function FieldRevealProvider<Scroller extends KeyboardScroller, Mark extends KeyboardFrame>({
  scroller,
  contentTop,
  children,
}: FieldRevealProviderProps<Scroller, Mark>) {
  const reveal = useCallback(
    (field: KeyboardFrame) => {
      const mark = contentTop.current;
      if (mark === null) return;
      mark.measureInWindow((_x, top) => {
        field.measureInWindow((_fx, fieldTop) => {
          const y = Math.max(0, fieldTop - top - REVEAL_MARGIN);
          scroller.current?.scrollTo({ y, animated: true });
        });
      });
    },
    [scroller, contentTop],
  );
  return <RevealContext.Provider value={reveal}>{children}</RevealContext.Provider>;
}
