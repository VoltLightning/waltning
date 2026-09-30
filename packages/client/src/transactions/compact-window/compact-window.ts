/**
 * Whether Quick add runs its compact column (`screens/S05-quick-add.md` §3).
 *
 * The keyboard leaves a phone about 300 pt, and the full column — the name and
 * its day, the kind, the amount card, *From*, Save — needs about 850 pt of
 * window beside it. Text the reader has enlarged takes more of those points, so
 * the window is measured in *text-scale-free* points: a 915 pt window at 1.3x
 * text is as short as a 704 pt one at 1x. Decided from the window on the first
 * frame, never from keyboard events.
 */
export const COMPACT_BELOW_HEIGHT = 860;

export function isCompactWindow(windowHeight: number, fontScale: number): boolean {
  const scale = fontScale > 0 ? fontScale : 1;
  return windowHeight / scale < COMPACT_BELOW_HEIGHT;
}
