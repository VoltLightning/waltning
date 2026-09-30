/**
 * `useFrozenOrder` — a list's order, fixed for the life of the mount.
 *
 * **Why.** A row list that re-sorts while its screen is visible (the
 * composer's chips, by usage) moves keyed `Pressable`s — Reanimated views — between positions
 * in a flattened parent. Fabric on Android answers that with "addViewAt: View
 * already has a parent" and a white window. Saving a transaction is the
 * trigger that reaches it: the ledger snapshot refreshes while the composer
 * is still on screen. A list that rearranges under the thumb that
 * just acted is no help to anyone either.
 *
 * **The rule.** The first order seen is kept. An item that is no longer
 * present drops out; an item not seen before is appended in the order it
 * arrives; an item already placed never moves. Every item is rendered with its
 * *current* data, so a figure still updates in place — only its position is
 * remembered. The next mount starts from the new ranking.
 *
 * `keyOf` must be a stable function (a module-level one), for the same reason
 * any memo dependency must.
 */

import { useMemo, useRef } from "react";

export function useFrozenOrder<Item>(
  items: readonly Item[],
  keyOf: (item: Item) => string,
): readonly Item[] {
  const placed = useRef<readonly string[]>([]);
  return useMemo(() => {
    const current = new Map(items.map((item) => [keyOf(item), item]));
    const kept = placed.current.filter((key) => current.has(key));
    const keptSet = new Set(kept);
    const appended = [...current.keys()].filter((key) => !keptSet.has(key));
    placed.current = [...kept, ...appended];
    const ordered: Item[] = [];
    for (const key of placed.current) {
      const item = current.get(key);
      if (item !== undefined) ordered.push(item);
    }
    return ordered;
  }, [items, keyOf]);
}
