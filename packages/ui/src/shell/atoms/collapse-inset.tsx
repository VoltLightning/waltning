/**
 * How far a page's content has to start below the top of the box it is drawn
 * in, so that a header which collapses over it never moves it — asked of the
 * pager, never assumed by the page.
 *
 * **Why the page carries the room instead of the frame.** S04's header gives up
 * its height as the page scrolls. Done by moving the page's box — shrinking
 * what sits above it and translating the pager to follow — the scroller's own
 * frame becomes a function of its own offset: the finger drags the content by
 * `d`, the frame moves by `d` under the finger, and the scroller reads half the
 * drag and then, a frame late, the rest. That is a feedback loop, and at the
 * point where the header changes shape it is an oscillation.
 *
 * So the box never moves. The header overlays the top of it, and the page
 * leaves this much room above its first row — room that scrolls away at exactly
 * the rate the header collapses, so at the end of the travel the first row sits
 * against the collapsed header with nothing between them.
 *
 * **Zero outside the pager**, which is true of every page that has no
 * collapsing header over it, and the answer that needs no opt-out
 * (`floating-clearance.tsx` sets the precedent).
 */

import { createContext, useContext } from "react";

const CollapseInsetContext = createContext(0);

export type CollapseInsetProviderProps = {
  /** Usually `COLLAPSE_TRAVEL`: the height the header gives up. */
  value: number;
  children: React.ReactNode;
};

export function CollapseInsetProvider({ value, children }: CollapseInsetProviderProps) {
  return <CollapseInsetContext.Provider value={value}>{children}</CollapseInsetContext.Provider>;
}

/** The room a page leaves above its first row, in points. `0` under no collapsing header. */
export function useCollapseInset(): number {
  return useContext(CollapseInsetContext);
}
