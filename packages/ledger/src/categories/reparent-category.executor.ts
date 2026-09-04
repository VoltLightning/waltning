/**
 * `reparent_category`, on the device — J12: *"move a leaf to another
 * group."* Compare-and-swap on `version`, then four refusals: no group
 * anywhere but the root (`TAXONOMY.md` R2 — two levels, never deeper), no
 * leaf parent (R1), no kind crossing (J12 §4 — *"target group has a
 * different kind"*, refused so an income leaf never sums into the expense
 * side of a report, or the reverse), no cycle.
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
    // R2 first, and unconditionally — a group taking on *any* non-null
    // parent is a third level, which `TAXONOMY.md` names explicitly as never
    // allowed. Everything below this line runs only for a leaf, which is the
    // only thing R1/R2 together permit to have a parent at all.
    if (!current.isLeaf) {
      throw new Error(
        `reparent_category: ${input.id} is a group — a group may only sit at the root, never nested under another (TAXONOMY.md R2, two levels)`,
      );
    }

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
 * **Unreachable in practice once R2 is enforced above, and kept anyway.**
 * This only ever runs for a leaf (the R2 guard refuses every group before
 * reaching it), and a leaf has no descendants — so `categoryId` can never
 * appear in `targetParentId`'s ancestor chain. Left in rather than deleted:
 * it costs one query, and a guarantee that depends on nothing upstream ever
 * changing is a fragile guarantee.
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
