/**
 * `convert_leaf_group`, on the device — J12 §4.
 *
 * *Leaf → group* is refused while a transaction or line still references it:
 * a group holds no transactions, only leaves do (J12's own merge rule says
 * the identical thing about a merge survivor). *Group → leaf* is refused
 * while it still has children — a leaf cannot have children, `TAXONOMY.md`
 * R1.
 */

import type { Id } from "@waltning/core/id";
import { type ConvertLeafGroupInput, convertLeafGroupInput } from "@waltning/core/registry/inputs";
import { and, count, eq, sql } from "drizzle-orm";
import { defineLocalExecutor } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";
import type { LocalCategoryRow } from "./create-category.executor.ts";

const { categories, transactionLines, transactions } = schema;
type ReplicaTx = LocalTx<unknown, typeof schema>;

export const convertLeafGroupExecutor = defineLocalExecutor<
  typeof convertLeafGroupInput,
  LocalCategoryRow,
  ReplicaTx
>({
  operation: "convert_leaf_group",
  opVersion: 1,
  input: convertLeafGroupInput,
  mints: () => [],
  apply: (input, tx) => convertLeafGroup(input, tx),
});

function convertLeafGroup(input: ConvertLeafGroupInput, tx: ReplicaTx): LocalCategoryRow {
  const [current] = tx.select().from(categories).where(eq(categories.id, input.id)).all();
  if (!current) {
    throw new Error(`convert_leaf_group: no category ${input.id}`);
  }
  if (current.version !== input.version) {
    throw new Error(
      `convert_leaf_group: stale version — read ${input.version}, row is at ${current.version}`,
    );
  }

  if (input.to === "group") {
    const referenced = referenceCount(input.id, tx);
    if (referenced > 0) {
      throw new Error(
        `convert_leaf_group: ${referenced} transaction(s) reference ${input.id} — recategorise or merge first`,
      );
    }
  } else {
    const [{ value: children } = { value: 0 }] = tx
      .select({ value: count() })
      .from(categories)
      .where(eq(categories.parentId, input.id))
      .all();
    if (children > 0) {
      throw new Error(`convert_leaf_group: ${input.id} has ${children} child(ren) — refused`);
    }
  }

  const [updated] = tx
    .update(categories)
    .set({
      isLeaf: input.to === "leaf",
      version: sql`${categories.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(categories.id, input.id), eq(categories.version, input.version)))
    .returning()
    .all();

  if (!updated) {
    throw new Error("convert_leaf_group: the row changed between read and write");
  }
  return updated;
}

function referenceCount(categoryId: Id<"categories">, tx: ReplicaTx): number {
  const [{ value: txnCount } = { value: 0 }] = tx
    .select({ value: count() })
    .from(transactions)
    .where(eq(transactions.categoryId, categoryId))
    .all();
  const [{ value: lineCount } = { value: 0 }] = tx
    .select({ value: count() })
    .from(transactionLines)
    .where(eq(transactionLines.categoryId, categoryId))
    .all();
  return txnCount + lineCount;
}
