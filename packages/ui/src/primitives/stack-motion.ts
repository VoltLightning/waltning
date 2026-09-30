/**
 * How a pushed screen arrives — `design-system/02` §2.7's `motion-screen`.
 *
 * **A short fade, never a slide.** Tapping a card used to swap the screen
 * with nothing in between, which reads as a glitch rather than as speed; a
 * fade of about 150 ms says *something changed* without making anyone wait
 * for it. Under the OS's Reduce motion setting the answer is no transition
 * at all: `animation: "none"`, the same end state produced immediately.
 *
 * Returned as a plain object so the two branches are testable without a
 * navigator. Sheets and modals keep their own motion — they are not routes of
 * this stack.
 */

/** `motion-screen`, in milliseconds. */
export const SCREEN_FADE_MS = 150;

export type StackMotion = {
  animation: "fade" | "none";
  animationDuration: number;
};

export function stackMotion(reducedMotion: boolean): StackMotion {
  return reducedMotion
    ? { animation: "none", animationDuration: 0 }
    : { animation: "fade", animationDuration: SCREEN_FADE_MS };
}
