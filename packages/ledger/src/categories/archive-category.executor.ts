/**
 * `archive_category`, on the device — `operations.md`: *"archiving is not
 * deletion — a leaf with history keeps it and stops being offerable"*
 * (`TAXONOMY.md` R2). Refused on a group with unarchived children — the tree
 * cannot show a group whose contents vanished without a trace, one leaf at a
 * time.
 *
 * A leaf may be archived with transactions still referencing it — the whole
 * point (`operations.md`, J12's *Archive* branch: *"Category has
 * transactions → Allowed."*). Only a group's own children gate it.
 */

import { type ArchiveCategoryInput, archiveCategoryInput } from "@waltning/core/registry/inputs";
import { and, count, eq, sql } from "drizzle-orm";
import { defineLocalExecutor } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";
import type { LocalCategoryRow } from "./create-category.executor.ts";

const { categories } = schema;
type ReplicaTx = LocalTx<unknown, typeof schema>;

export const archiveCategoryExecutor = defineLocalExecutor<
  typeof archiveCategoryInput,
  LocalCategoryRow,
  ReplicaTx
>({
  operation: "archive_category",
  opVersion: 1,
  input: archiveCategoryInput,
  mints: () => [],
  apply: (input, tx) => archiveCategory(input, tx),
});

function archiveCategory(input: ArchiveCategoryInput, tx: ReplicaTx): LocalCategoryRow {
  const [current] = tx.select().from(categories).where(eq(categories.id, input.id)).all();
  if (!current) {
    throw new Error(`archive_category: no category ${input.id}`);
  }
  if (current.archived) {
    throw new Error(`archive_category: ${input.id} is already archived`);
  }
  if (current.version !== input.version) {
    throw new Error(
      `archive_category: stale version — read ${input.version}, row is at ${current.version}`,
    );
  }

  if (!current.isLeaf) {
    const [{ value: unarchivedChildren } = { value: 0 }] = tx
      .select({ value: count() })
      .from(categories)
      .where(and(eq(categories.parentId, input.id), eq(categories.archived, false)))
      .all();
    if (unarchivedChildren > 0) {
      throw new Error(
        `archive_category: ${input.id} has ${unarchivedChildren} unarchived child(ren) — refused`,
      );
    }
  }

  const [updated] = tx
    .update(categories)
    .set({ archived: true, version: sql`${categories.version} + 1`, updatedAt: new Date() })
    .where(and(eq(categories.id, input.id), eq(categories.version, input.version)))
    .returning()
    .all();

  if (!updated) {
    throw new Error("archive_category: the row changed between read and write");
  }
  return updated;
}
