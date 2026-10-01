/**
 * S19's order: inside each group, the categories with entries come first.
 *
 * A seeded taxonomy is 59 leaves and a ledger uses a handful, so the ones in
 * use were buried among rows tagged *unused*. The walk is the tree's own
 * depth-first one; each group's children are partitioned — used, then unused —
 * keeping their current relative order inside both halves, so the order is
 * stable and only the boundary moves. Groups keep their order, and a node with
 * no group above it keeps its place.
 */

export type UsedFirstNode = {
  id: string;
  parentId: string | null;
  isLeaf: boolean;
  usageCount: number;
};

export function usedFirst<TNode extends UsedFirstNode>(nodes: readonly TNode[]): TNode[] {
  const groupIds = new Set(nodes.filter((node) => !node.isLeaf).map((node) => node.id));
  const childrenOf = new Map<string, TNode[]>();
  for (const node of nodes) {
    if (node.parentId === null || !groupIds.has(node.parentId)) continue;
    const siblings = childrenOf.get(node.parentId);
    if (siblings) siblings.push(node);
    else childrenOf.set(node.parentId, [node]);
  }

  const result: TNode[] = [];
  for (const node of nodes) {
    if (node.parentId !== null && groupIds.has(node.parentId)) continue;
    result.push(node);
    const children = childrenOf.get(node.id);
    if (children === undefined) continue;
    result.push(...children.filter((child) => child.usageCount > 0));
    result.push(...children.filter((child) => child.usageCount === 0));
  }
  return result;
}
