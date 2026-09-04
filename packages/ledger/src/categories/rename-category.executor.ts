/**
 * `rename_category`, on the device — J12: *"names are not identifiers,
 * renaming propagates and breaks nothing"*, because history is keyed by id
 * (§6.1). Compare-and-swap on `version`, matching every other structural
 * category write.
 */

import { type RenameCategoryInput, renameCategoryInput } from "@waltning/core/registry/inputs";
import { and, eq, sql } from "drizzle-orm";
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";
import type { LocalCategoryRow } from "./create-category.executor.ts";
import { refuseSiblingCollision } from "./sibling-collision.ts";

const { categories } = schema;
type ReplicaTx = LocalTx<unknown, typeof schema>;

export const renameCategoryExecutor = defineLocalExecutor<
  typeof renameCategoryInput,
  LocalCategoryRow,
  ReplicaTx
>({
  operation: "rename_category",
  opVersion: 1,
  input: renameCategoryInput,
  mints: () => [],
  apply: (input, tx) => renameCategory(input, tx),
});

function renameCategory(input: RenameCategoryInput, tx: ReplicaTx): LocalCategoryRow {
  const [current] = tx.select().from(categories).where(eq(categories.id, input.id)).all();
  if (!current) {
    throw new LocalRefusal(`rename_category: no category ${input.id}`);
  }
  if (current.version !== input.version) {
    throw new LocalRefusal(
      `rename_category: stale version — read ${input.version}, row is at ${current.version}`,
    );
  }

  refuseSiblingCollision(tx, {
    operation: "rename_category",
    id: current.id,
    parentId: current.parentId,
    kind: current.kind,
    name: input.name,
  });

  const [updated] = tx
    .update(categories)
    .set({ name: input.name, version: sql`${categories.version} + 1`, updatedAt: new Date() })
    .where(and(eq(categories.id, input.id), eq(categories.version, input.version)))
    .returning()
    .all();

  if (!updated) {
    throw new Error("rename_category: the row changed between read and write");
  }
  return updated;
}
