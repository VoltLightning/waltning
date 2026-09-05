/**
 * `reorder_accounts`, on the device — `operations.md` *Accounts*, structural.
 *
 * `sort` becomes each id's index in the list the caller sent, so S16's
 * long-press drag is one write of the whole order rather than N single-row
 * moves. No version column is touched: reordering does not contest the same
 * field `update_account` does, and racing two reorders is a last-write-wins
 * question the `sort` column already answers by being overwritten.
 */

import { type ReorderAccountsInput, reorderAccountsInput } from "@waltning/core/registry/inputs";
import { eq } from "drizzle-orm";
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";
import type { LocalAccountRow } from "./create-account.executor.ts";

const { accounts } = schema;
type ReplicaTx = LocalTx<unknown, typeof schema>;

export const reorderAccountsExecutor = defineLocalExecutor<
  typeof reorderAccountsInput,
  readonly LocalAccountRow[],
  ReplicaTx
>({
  operation: "reorder_accounts",
  opVersion: 1,
  input: reorderAccountsInput,
  mints: () => [],
  apply: (input, tx) => reorderAccounts(input, tx),
});

function reorderAccounts(input: ReorderAccountsInput, tx: ReplicaTx): readonly LocalAccountRow[] {
  const rows: LocalAccountRow[] = [];
  for (const [index, id] of input.ids.entries()) {
    const [row] = tx
      .update(accounts)
      .set({ sort: index })
      .where(eq(accounts.id, id))
      .returning()
      .all();
    if (!row) {
      // "Refuse if any id is missing" — a reorder naming an id nothing holds
      // is not a smaller edit than the one it looks like; it is silently
      // dropping an account from the list the caller thought it was writing.
      throw new LocalRefusal(`reorder_accounts: no account ${id}`, { dependency: true });
    }
    rows.push(row);
  }
  return rows;
}
