/**
 * `create_group`, on the device — S16 §5.
 *
 * *"Nothing in the specification created a group, renamed one, or set its
 * institution."* `institution` is the field `FX Cost` (`computations.md`
 * §12) totals by — a headline figure whose grouping field nothing could set,
 * until this operation.
 *
 * Client-minted `id`, matching `create_account` (H13): the phone can retry a
 * queued write carrying the same id, so the drain is idempotent by
 * construction.
 */

import { type CreateGroupInput, createGroupInput } from "@waltning/core/registry/inputs";
import { defineLocalExecutor } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";

const { accountGroups } = schema;

/** The row as the replica holds it. See `LocalAccountRow` for why not a projection. */
export type LocalGroupRow = typeof accountGroups.$inferSelect;

type ReplicaTx = LocalTx<unknown, typeof schema>;

export const createGroupExecutor = defineLocalExecutor<
  typeof createGroupInput,
  LocalGroupRow,
  ReplicaTx
>({
  operation: "create_group",
  opVersion: 1,
  input: createGroupInput,
  mints: (input) => [input.id],
  apply: (input, tx) => insertGroup(input, tx),
});

/** An upsert, matching `insertAccount`'s replay argument exactly. */
function insertGroup(input: CreateGroupInput, tx: ReplicaTx): LocalGroupRow {
  const fields = { name: input.name, institution: input.institution };

  const [row] = tx
    .insert(accountGroups)
    .values({ id: input.id, ...fields })
    .onConflictDoUpdate({ target: accountGroups.id, set: fields })
    .returning()
    .all();

  if (!row) {
    throw new Error("create_group: the replica insert returned no row");
  }
  return row;
}
