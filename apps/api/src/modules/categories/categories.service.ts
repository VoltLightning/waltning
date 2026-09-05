/**
 * The category tree, server side — the same depth-first walk
 * `@waltning/ledger`'s `readCategoryTree` does over the phone's replica,
 * against the one table both engines share (`architecture/14-local-first.md`).
 */

import type { Id } from "@waltning/core/id";
import type { DbHandle } from "@waltning/db/client";
import { categories } from "@waltning/db/schema";
import type { CategoryKind } from "@waltning/schema/enums";
import { asc, eq } from "drizzle-orm";

export type CategoryTreeRow = {
  id: Id<"categories">;
  parentId: Id<"categories"> | null;
  name: string;
  kind: CategoryKind;
  isLeaf: boolean;
  isEarnings: boolean;
  archived: boolean;
  sort: number;
  version: number;
  /** 0 for a root category, incrementing one per ancestor — computed, never stored (see `readCategoryTree`). */
  depth: number;
};

export async function listCategoryTree(
  db: DbHandle,
  includeArchived: boolean,
): Promise<CategoryTreeRow[]> {
  const rows = await db
    .select({
      id: categories.id,
      parentId: categories.parentId,
      name: categories.name,
      kind: categories.kind,
      isLeaf: categories.isLeaf,
      isEarnings: categories.isEarnings,
      archived: categories.archived,
      sort: categories.sort,
      version: categories.version,
    })
    .from(categories)
    .where(includeArchived ? undefined : eq(categories.archived, false))
    .orderBy(asc(categories.sort), asc(categories.name), asc(categories.id));

  // Grouped by parent, preserving the query's own order — the depth-first
  // walk below owes its ordering entirely to this grouping being stable.
  const byParent = new Map<Id<"categories"> | null, CategoryTreeRow[]>();
  for (const row of rows) {
    const entry: CategoryTreeRow = { ...row, depth: 0 };
    const siblings = byParent.get(row.parentId);
    if (siblings) siblings.push(entry);
    else byParent.set(row.parentId, [entry]);
  }

  const ordered: CategoryTreeRow[] = [];
  const walk = (parentId: Id<"categories"> | null, depth: number) => {
    for (const node of byParent.get(parentId) ?? []) {
      ordered.push({ ...node, depth });
      walk(node.id, depth + 1);
    }
  };
  walk(null, 0);
  return ordered;
}
