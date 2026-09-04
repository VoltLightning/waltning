/**
 * `reorder_groups`, on the device — S16 §5. See `reorder-accounts.executor.ts`
 * for the argument; this is the same write over `account_groups`.
 */

import { type ReorderGroupsInput, reorderGroupsInput } from "@waltning/core/registry/inputs";
import { eq } from "drizzle-orm";
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";
import type { LocalGroupRow } from "./create-group.executor.ts";

const { accountGroups } = schema;
type ReplicaTx = LocalTx<unknown, typeof schema>;

export const reorderGroupsExecutor = defineLocalExecutor<
  typeof reorderGroupsInput,
  readonly LocalGroupRow[],
  ReplicaTx
>({
  operation: "reorder_groups",
  opVersion: 1,
  input: reorderGroupsInput,
  mints: () => [],
  apply: (input, tx) => reorderGroups(input, tx),
});

function reorderGroups(input: ReorderGroupsInput, tx: ReplicaTx): readonly LocalGroupRow[] {
  const rows: LocalGroupRow[] = [];
  for (const [index, id] of input.ids.entries()) {
    const [row] = tx
      .update(accountGroups)
      .set({ sort: index })
      .where(eq(accountGroups.id, id))
      .returning()
      .all();
    if (!row) {
      throw new LocalRefusal(`reorder_groups: no group ${id}`);
    }
    rows.push(row);
  }
  return rows;
}
