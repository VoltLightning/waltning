/**
 * S19's *Where money went this month* — each category's spend in one
 * currency, a group's being its children's together, and each leaf's share of
 * the month's largest (the bar's length).
 *
 * **In one currency, never converted.** The rows come from the same read
 * Summary's *Where it went* makes, and the caller names the currency it draws
 * in; spend in any other is left out rather than carried at a guessed rate.
 */

import * as money from "@waltning/core/money";

export type CategorySpendNode = {
  id: string;
  parentId: string | null;
  depth: number;
  isLeaf: boolean;
};

export type CategorySpend = {
  /** Category id → what went there, spend as a positive figure. */
  spent: ReadonlyMap<string, money.Money>;
  /** Leaf id → its spend against the month's largest leaf, `0..1`. */
  share: ReadonlyMap<string, number>;
};

export function categorySpend(
  rows: readonly money.SpendByCategoryRow[],
  tree: readonly CategorySpendNode[],
  currency: string | undefined,
): CategorySpend {
  const spent = new Map<string, money.Money>();
  const share = new Map<string, number>();
  if (currency === undefined) return { spent, share };

  for (const row of rows) {
    if (row.currency !== currency || row.categoryId === null) continue;
    spent.set(
      row.categoryId,
      money.add(spent.get(row.categoryId) ?? money.ZERO, money.abs(row.amount)),
    );
  }

  let largest = money.ZERO;
  for (const node of tree) {
    const own = node.isLeaf ? spent.get(node.id) : undefined;
    if (own !== undefined && money.cmp(own, largest) > 0) largest = own;
  }
  if (!money.isZero(largest)) {
    for (const node of tree) {
      const own = node.isLeaf ? spent.get(node.id) : undefined;
      if (own === undefined) continue;
      share.set(node.id, money.dec(own).dividedBy(money.dec(largest)).toNumber());
    }
  }

  // A group is its children together, one level at a time from the leaves up.
  const deepest = tree.reduce((most, node) => Math.max(most, node.depth), 0);
  for (let depth = deepest; depth > 0; depth--) {
    for (const node of tree) {
      if (node.depth !== depth || node.parentId === null) continue;
      const own = spent.get(node.id);
      if (own === undefined) continue;
      spent.set(node.parentId, money.add(spent.get(node.parentId) ?? money.ZERO, own));
    }
  }
  return { spent, share };
}
