/**
 * `update_group`, on the device — S16 §5.
 *
 * Sets `name` and/or `institution`. **No version column on `account_groups`**
 * — there is nothing on the row two devices could race over that a plain
 * update does not already resolve last-write-wins, unlike `accounts` and
 * `categories`, which carry history-bearing fields.
 */

import { type UpdateGroupInput, updateGroupInput } from "@waltning/core/registry/inputs";
import { eq } from "drizzle-orm";
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";
import type { LocalGroupRow } from "./create-group.executor.ts";

const { accountGroups } = schema;
type ReplicaTx = LocalTx<unknown, typeof schema>;

export const updateGroupExecutor = defineLocalExecutor<
  typeof updateGroupInput,
  LocalGroupRow,
  ReplicaTx
>({
  operation: "update_group",
  opVersion: 1,
  input: updateGroupInput,
  mints: () => [],
  apply: (input, tx) => patchGroup(input, tx),
});

function patchGroup(input: UpdateGroupInput, tx: ReplicaTx): LocalGroupRow {
  const [updated] = tx
    .update(accountGroups)
    .set(input.patch)
    .where(eq(accountGroups.id, input.id))
    .returning()
    .all();

  if (!updated) {
    throw new LocalRefusal(`update_group: no group ${input.id}`);
  }
  return updated;
}
