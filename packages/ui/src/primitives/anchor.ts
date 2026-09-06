/**
 * Where an overlay panel goes, as arithmetic — `float-geometry.ts`'s shape,
 * one layer down.
 *
 * `Select`'s options used to unfold *in the form's own flow*, which meant
 * opening a choice pushed everything under it down the page: opening "Rate
 * source" on Currencies moved Edit, Archive and the next currency by about
 * 200px, and closing it moved them back. A disclosure that reflows the page
 * is a disclosure that loses the reader's place, and on a phone it also
 * scrolled the screen behind the list rather than the list itself.
 *
 * So the panel became an overlay in a `Modal` — the one escape hatch React
 * Native gives on all three targets without a portal library — and a `Modal`
 * has no idea where the field it belongs to is. That is what this file
 * supplies: the field measures itself in window coordinates, and these
 * functions turn that rectangle plus the window and the device's insets into
 * the panel's own absolute position.
 *
 * **Pure, and returning a style rather than a description.** The caller has
 * nothing left to decide, so there is nothing left to get wrong at the call
 * site — and the rules (prefer below, flip above when below is the smaller
 * room, never leave the window, never collapse under two rows) are testable
 * as arithmetic rather than only visible in a screenshot.
 *
 * **Two of those rules can disagree, and the window wins.** A panel held to
 * two rows in a space with room for one has to go somewhere, and the answer
 * is inside the window, overlapping the field it belongs to. That is stated
 * here and in `03-primitives` §3.8 rather than left for a reader to discover
 * from a panel hanging off the top of a landscape phone.
 */

import { useCallback, useRef, useState } from "react";
import type { View, ViewStyle } from "react-native";
import { space, touchTarget } from "../tokens.ts";
import type { SafeAreaInsets } from "./safe-area";

/** A measured field, in window coordinates — `measureInWindow`'s own four numbers. */
export type Anchor = { x: number; y: number; width: number; height: number };

/**
 * The window the panel has to stay inside. Named `Frame` rather than
 * `Window`, and taken as `frame` at every call site: `packages/ui` ships to a
 * phone, and the repository's own rule against a neutral package naming a
 * browser global (`tests/architecture.test.ts`) is the reason to not have a
 * local called `window` at all.
 */
export type Frame = { width: number; height: number };

/** The air between the field and the panel below or above it. */
const GAP = space.xs;

/** The margin the panel keeps from the window's own edges. */
const MARGIN = space.md;

/**
 * Never shorter than two rows. A panel squeezed into 30px of room is a panel
 * nobody can use, and the flip above exists precisely so that squeeze is rare
 * — but a field on a keyboard-shrunk window can still have too little room on
 * both sides, and a scrolling two-row list beats an invisible one.
 */
const MIN_HEIGHT = touchTarget.min * 2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * The panel, placed under its field — or over it, when under is the smaller
 * room. `maxHeight` is the caller's own cap (six and a half rows for
 * `Select`) narrowed to what the chosen side actually has.
 */
export function panelPlacement(
  anchor: Anchor,
  frame: Frame,
  insets: SafeAreaInsets,
  cap: number,
): ViewStyle {
  const roomBelow = frame.height - insets.bottom - MARGIN - (anchor.y + anchor.height + GAP);
  const roomAbove = anchor.y - GAP - insets.top - MARGIN;

  const width = Math.min(anchor.width, frame.width - insets.left - insets.right - MARGIN * 2);
  const left = clamp(
    anchor.x,
    insets.left + MARGIN,
    Math.max(insets.left + MARGIN, frame.width - insets.right - MARGIN - width),
  );

  // Below unless above is genuinely roomier: a panel that jumps sides for a
  // few pixels reads as a different control each time it opens.
  const below = roomBelow >= Math.min(cap, roomAbove);
  const room = below ? roomBelow : roomAbove;
  const height = Math.max(MIN_HEIGHT, Math.min(cap, room));

  /**
   * **Positioned by `top` on both sides, and clamped after the floor.**
   * The two-row floor can be larger than the room it was given — that is what
   * it is for — so a panel placed by its far edge would then hang off the
   * window: 88px of panel above a field at y=40 starts at y=−52. The floor
   * wins over the *room*, never over the window, so the panel is pushed back
   * inside and overlaps its own field instead. An overlapped field is a
   * legible compromise; a list half off the screen is not. In a window too
   * short to hold two rows *and* both margins, the margin is what gives way
   * — it is breathing room, and the window is not.
   */
  const preferred = below ? anchor.y + anchor.height + GAP : anchor.y - GAP - height;
  const highest = insets.top + MARGIN;
  const lowest = Math.max(highest, frame.height - insets.bottom - MARGIN - height);

  return {
    position: "absolute",
    top: clamp(preferred, highest, lowest),
    left,
    width,
    maxHeight: height,
  };
}

/**
 * Where the panel sits before the field has reported itself — the single tick
 * between opening and `measureInWindow` answering, and every render in a test
 * environment that lays nothing out. The bottom of the window, full width: the
 * one position that is legible without knowing anything about the field.
 *
 * The caller keeps it invisible until the measurement lands, so this is a
 * fallback for *layout*, never a frame anybody sees.
 */
export function unanchoredPlacement(frame: Frame, insets: SafeAreaInsets, cap: number): ViewStyle {
  return {
    position: "absolute",
    left: insets.left + MARGIN,
    right: insets.right + MARGIN,
    bottom: insets.bottom + MARGIN,
    maxHeight: Math.max(MIN_HEIGHT, Math.min(cap, frame.height - insets.top - insets.bottom)),
  };
}

/**
 * A field that can report where it is.
 *
 * `measure` is called on open and on any layout change *while* open — never
 * while closed, because `measureInWindow` answers on a later tick and a
 * closed control has nothing to do with the answer.
 */
export function useAnchor(): {
  ref: React.RefObject<View | null>;
  anchor: Anchor | null;
  measure: () => void;
} {
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const measure = useCallback(() => {
    ref.current?.measureInWindow((x, y, width, height) => {
      setAnchor((prev) =>
        prev !== null &&
        prev.x === x &&
        prev.y === y &&
        prev.width === width &&
        prev.height === height
          ? prev
          : { x, y, width, height },
      );
    });
  }, []);

  return { ref, anchor, measure };
}
