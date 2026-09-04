/**
 * `create_category`, on the device — `operations.md`: *"the agent proposes;
 * it never creates silently"* (§11.5). The gate that keeps the agent from
 * calling this directly lives in the registry operation; this is the write
 * either a person or an accepted proposal ends up making.
 *
 * Every row this creates is a **leaf** — `createCategoryInput` has no `isLeaf`
 * field, and the column defaults `true`. A group is a leaf that
 * `convert_leaf_group` later promotes once it is ready to hold children
 * (J12's *Convert leaf ⇄ group*): nothing here ever sets `isLeaf: false`.
 *
 * `parentId`, when given, must name a **group** — `TAXONOMY.md` R1, a category
 * is a group or a leaf, never both, so a leaf cannot have children.
 */

import { type CreateCategoryInput, createCategoryInput } from "@waltning/core/registry/inputs";
import { eq } from "drizzle-orm";
import { defineLocalExecutor } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";

const { categories } = schema;

/** The row as the replica holds it. See `LocalAccountRow` for why not a projection. */
export type LocalCategoryRow = typeof categories.$inferSelect;

type ReplicaTx = LocalTx<unknown, typeof schema>;

export const createCategoryExecutor = defineLocalExecutor<
  typeof createCategoryInput,
  LocalCategoryRow,
  ReplicaTx
>({
  operation: "create_category",
  opVersion: 1,
  input: createCategoryInput,
  mints: (input) => [input.id],
  apply: (input, tx) => insertCategory(input, tx),
});

function insertCategory(input: CreateCategoryInput, tx: ReplicaTx): LocalCategoryRow {
  if (input.parentId !== null) {
    const [parent] = tx.select().from(categories).where(eq(categories.id, input.parentId)).all();
    if (!parent) {
      throw new Error(`create_category: no parent ${input.parentId}`);
    }
    if (parent.isLeaf) {
      throw new Error(
        `create_category: ${input.parentId} is a leaf — a category is a group or a leaf, never both (TAXONOMY.md R1)`,
      );
    }
    if (parent.kind !== input.kind) {
      throw new Error(
        `create_category: parent ${input.parentId} is ${parent.kind}, this category is ${input.kind} — an income leaf under an expense group (or the reverse) sums into the wrong side of every report`,
      );
    }
  }

  const fields = {
    parentId: input.parentId,
    name: input.name,
    kind: input.kind,
    isEarnings: input.isEarnings,
    ...(input.icon !== undefined ? { icon: input.icon } : {}),
    ...(input.color !== undefined ? { color: input.color } : {}),
  };

  const [row] = tx
    .insert(categories)
    .values({ id: input.id, ...fields })
    .onConflictDoUpdate({ target: categories.id, set: fields })
    .returning()
    .all();

  if (!row) {
    throw new Error("create_category: the replica insert returned no row");
  }
  return row;
}
