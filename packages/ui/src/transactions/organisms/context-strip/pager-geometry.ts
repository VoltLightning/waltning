/**
 * The context strip's paging arithmetic, out of the component so a test can
 * reach it (`pager-geometry.test.ts`).
 *
 * **A card is exactly as wide as the cards under it.** The scroller runs the
 * full width `width`; its content is padded by `lead` and `trail` — the page
 * gutter plus the device's side insets, the same padding every other card on
 * the page sits inside — and each card fills the space between them. A
 * narrower card, sized to leave the next one peeking, read as a different,
 * lesser kind of card than the details beneath it. What shows of the next
 * card is the gutter less the gap between cards; the page dots say the rest.
 *
 * With every card that width, each stop is a whole card further along and
 * the last is exactly the end of the row, so every stop is reachable and none
 * lies beyond it.
 */
export type PagerGeometry = {
  cardWidth: number;
  /** One per card, the last the end of the row. Mutable: `snapToOffsets` is typed `number[]`. */
  snaps: number[];
};

export function pagerGeometry(
  width: number,
  count: number,
  { lead, trail, gap }: { lead: number; trail: number; gap: number },
): PagerGeometry {
  const cardWidth = Math.max(0, width - lead - trail);
  const snaps: number[] = [];
  for (let index = 0; index < count; index++) snaps.push(index * (cardWidth + gap));
  return { cardWidth, snaps };
}

/** The page whose stop is nearest `offset`. */
export function pageAt(snaps: readonly number[], offset: number): number {
  let best = 0;
  for (let index = 1; index < snaps.length; index++) {
    const here = Math.abs((snaps[index] ?? 0) - offset);
    if (here < Math.abs((snaps[best] ?? 0) - offset)) best = index;
  }
  return best;
}
