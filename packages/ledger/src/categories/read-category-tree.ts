/**
 * The category tree, flattened depth-first.
 *
 * A `parent_id` self-reference is the honest shape for a taxonomy — S06's
 * sheet and S19's editor both walk it as a tree — but SQLite has no view that
 * hands back "every row, in tree order" for free. This does the walk once, in
 * JS, over a single `select *`: the table is small (dozens of rows, not
 * thousands), so a second query per level would cost more than it saves.
 *
 * **`depth` is computed, not stored.** Storing it would be a second source of
 * truth that a `move_category` (S19) could desync from `parent_id`; deriving
 * it here means the tree can never disagree with itself.
 */

import type { Id } from "@waltning/core/id";
import type { CategoryKind } from "@waltning/schema/enums";
import { asc } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { categories } = ledgerSchema;

export type LocalCategory = {
  id: Id<"categories">;
  parentId: Id<"categories"> | null;
  name: string;
  kind: CategoryKind;
  isLeaf: boolean;
  isEarnings: boolean;
  archived: boolean;
  sort: number;
  /** 0 for a root category, incrementing one per ancestor. */
  depth: number;
};

export function readCategoryTree<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
): readonly LocalCategory[] {
  const rows = db
    .select({
      id: categories.id,
      parentId: categories.parentId,
      name: categories.name,
      kind: categories.kind,
      isLeaf: categories.isLeaf,
      isEarnings: categories.isEarnings,
      archived: categories.archived,
      sort: categories.sort,
    })
    .from(categories)
    .orderBy(asc(categories.sort), asc(categories.name), asc(categories.id))
    .all();

  // Grouped by parent, preserving the `sort`/`name`/`id` order the query
  // already established — the depth-first walk below owes its ordering
  // entirely to this grouping being stable.
  const byParent = new Map<Id<"categories"> | null, LocalCategory[]>();
  for (const row of rows) {
    const key = row.parentId;
    const siblings = byParent.get(key);
    const entry: LocalCategory = { ...row, depth: 0 };
    if (siblings) siblings.push(entry);
    else byParent.set(key, [entry]);
  }

  const result: LocalCategory[] = [];
  const visit = (parentId: Id<"categories"> | null, depth: number) => {
    for (const entry of byParent.get(parentId) ?? []) {
      entry.depth = depth;
      result.push(entry);
      visit(entry.id, depth + 1);
    }
  };
  visit(null, 0);

  return result;
}
