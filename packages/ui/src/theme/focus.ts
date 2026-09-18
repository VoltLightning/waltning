/**
 * **Focus is drawn once, and a bordered control draws it in its own border.**
 *
 * `design-system/02` §2.6 puts a ring on every interactive element. Taken
 * literally that produced two edges on everything that already had one: the
 * control's 1px border, a 2px gap of whatever the page is made of, then a 2px
 * green ring — three concentric rectangles to say one thing. Across the app
 * 242 story-and-element pairs drew it that way, every field among them.
 *
 * So the ring moves *into* the border where there is one. A focused field
 * thickens from 1 to 2 and turns accent; a focused row or icon button, which
 * has no border to turn, still gets the offset ring. Both are the same two
 * signals — a colour and a change of thickness — and neither is colour alone,
 * which §2.6 forbids for the population the ring exists for.
 *
 * **The padding shrinks by exactly what the border grows.** React Native sizes
 * a box border-box, so a border that thickens by 1 eats 1 of the content's
 * room on each side: without the compensation every label inside a focused
 * field steps 1px inward, which reads as the text flinching when you tap it.
 * Vertical room needs no such care where the box states a `minHeight` — Yoga
 * clamps the content back to it — so only the paddings a caller names are
 * adjusted.
 */

import { focus } from "../tokens.ts";

/** What a bordered control rests at. Everything here is relative to it. */
export const BORDER_REST = 1;

/** How much the border grows when it becomes the focus indicator. */
const GROWTH = focus.width - BORDER_REST;

type Padding = {
  /** The control's resting `paddingHorizontal`, if it states one. */
  horizontal?: number;
  /** The control's resting `paddingVertical`, if it states one. */
  vertical?: number;
};

/**
 * Focus for a control that **draws its own border**: the border becomes the
 * indicator. Pass whichever resting paddings the control states, so the
 * content does not move when the border thickens.
 */
export function focusBorder(color: string, padding: Padding = {}) {
  return {
    borderWidth: focus.width,
    borderColor: color,
    // **Silence is not enough on the web.** A focused element with no author
    // outline keeps Chromium's `outline-style: auto` and gets the UA's own
    // blue ring, drawn at the UA's width in a colour this palette never
    // names — so removing the ring is an instruction, not an omission.
    //
    // `"solid"` at width 0 rather than `"none"`, which React Native's own
    // `outlineStyle` union does not offer. Naming a style is the part that
    // matters: it takes rendering off Chromium's `auto`, which ignores an
    // author width, and onto the zero named here.
    outlineWidth: 0,
    outlineStyle: "solid",
    ...(padding.horizontal === undefined ? {} : { paddingHorizontal: padding.horizontal - GROWTH }),
    ...(padding.vertical === undefined ? {} : { paddingVertical: padding.vertical - GROWTH }),
  } as const;
}

/**
 * Focus for a control with **no border of its own** — a row, a bare icon
 * button, a tab. The ring is drawn outside it at `focus.offset`.
 *
 * `outlineStyle: "solid"` is load-bearing on the web: without it Chromium
 * keeps `outline-style: auto` and renders the UA's own ring at the UA's width
 * and offset, ignoring both values named here.
 */
export function focusRing(color: string) {
  return {
    outlineWidth: focus.width,
    outlineStyle: "solid",
    outlineColor: color,
    outlineOffset: focus.offset,
  } as const;
}
