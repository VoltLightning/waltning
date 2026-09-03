/**
 * `reparent_category`, on the device — J12: *"move a leaf to another
 * group."* Compare-and-swap on `version`, then three refusals: no cycle, no
 * leaf parent (`TAXONOMY.md` R1), no kind crossing (J12 §4 — *"target group
 * has a different kind"*, refused so an income leaf never sums into the
 * expense side of a report, or the reverse).
 */

import type { Id } from "@waltning/core/id";
import { type ReparentCategoryInput, reparentCategoryInput } from "@waltning/core/registry/inputs";
import { and, eq, sql } from "drizzle-orm";
import { defineLocalExecutor } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";
import type { LocalCategoryRow } from "./create-category.executor.ts";

const { categories } = schema;
type ReplicaTx = LocalTx<unknown, typeof schema>;

export const reparentCategoryExecutor = defineLocalExecutor<
  typeof reparentCategoryInput,
  LocalCategoryRow,
  ReplicaTx
>({
  operation: "reparent_category",
  opVersion: 1,
  input: reparentCategoryInput,
  mints: () => [],
  apply: (input, tx) => reparentCategory(input, tx),
});

function reparentCategory(input: ReparentCategoryInput, tx: ReplicaTx): LocalCategoryRow {
  const [current] = tx.select().from(categories).where(eq(categories.id, input.id)).all();
  if (!current) {
    throw new Error(`reparent_category: no category ${input.id}`);
  }
  if (current.version !== input.version) {
    throw new Error(
      `reparent_category: stale version — read ${input.version}, row is at ${current.version}`,
    );
  }

  if (input.parentId !== null) {
    const [parent] = tx.select().from(categories).where(eq(categories.id, input.parentId)).all();
    if (!parent) {
      throw new Error(`reparent_category: no parent ${input.parentId}`);
    }
    if (parent.isLeaf) {
      throw new Error(
        `reparent_category: ${input.parentId} is a leaf — a category is a group or a leaf, never both (TAXONOMY.md R1)`,
      );
    }
    if (parent.kind !== current.kind) {
      throw new Error(
        `reparent_category: target group ${input.parentId} is ${parent.kind}, ${input.id} is ${current.kind} — refused across kinds (J12 §4)`,
      );
    }
    if (wouldCycle(input.parentId, input.id, tx)) {
      throw new Error(
        `reparent_category: ${input.parentId} is a descendant of ${input.id} — that would make the tree a cycle`,
      );
    }
  }

  const [updated] = tx
    .update(categories)
    .set({
      parentId: input.parentId,
      version: sql`${categories.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(categories.id, input.id), eq(categories.version, input.version)))
    .returning()
    .all();

  if (!updated) {
    throw new Error("reparent_category: the row changed between read and write");
  }
  return updated;
}

/**
 * Whether setting `categoryId`'s parent to `targetParentId` would create a
 * cycle — true exactly when `targetParentId` is `categoryId` itself or one of
 * its descendants, found by walking `targetParentId`'s own ancestor chain up
 * toward the root and watching for `categoryId`.
 *
 * `seen` bounds the walk even against data that is already cyclic somehow —
 * an infinite loop here would hang the write rather than refuse it.
 */
function wouldCycle(
  targetParentId: Id<"categories">,
  categoryId: Id<"categories">,
  tx: ReplicaTx,
): boolean {
  let cursor: Id<"categories"> | null = targetParentId;
  const seen = new Set<Id<"categories">>();

  while (cursor !== null) {
    if (cursor === categoryId) return true;
    if (seen.has(cursor)) return false;
    seen.add(cursor);
    const [row] = tx
      .select({ parentId: categories.parentId })
      .from(categories)
      .where(eq(categories.id, cursor))
      .all();
    cursor = row?.parentId ?? null;
  }
  return false;
}
