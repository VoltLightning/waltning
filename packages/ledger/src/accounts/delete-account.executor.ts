/**
 * `delete_account`, on the device — `operations.md` *Accounts*, structural.
 *
 * **Deletes only an account nothing has ever referenced** (§6.9): no
 * transaction on either leg (soft-deleted ones included), no recurring rule,
 * no opening balance. Anything referenced is archived, never removed —
 * `archive_account` is the verb for it. The refusal is stated three times and
 * on purpose: here, with a message the screen can name; in the replica's
 * `accounts_delete_guard` trigger; and in Postgres's (WA023), which is the
 * one that still holds when this function is wrong.
 *
 * Compare-and-swap on `version`, same as `archive_account`.
 */

import { type DeleteAccountInput, deleteAccountInput } from "@waltning/core/registry/inputs";
import { and, eq } from "drizzle-orm";
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
import { type ReplicaTx, ledgerSchema as schema } from "../schema-map.ts";
import { accountReference } from "./account-references.ts";
import type { LocalAccountRow } from "./create-account.executor.ts";

const { accounts } = schema;

export const deleteAccountExecutor = defineLocalExecutor<
  typeof deleteAccountInput,
  LocalAccountRow,
  ReplicaTx
>({
  operation: "delete_account",
  opVersion: 1,
  input: deleteAccountInput,
  mints: () => [],
  /**
   * **The refusals that name a reason, before the outbox commits.** A refused
   * delete must not leave a blocked entry behind for the person to discard on
   * S30: the answer is knowable here, so it is given here. A row this device
   * does not hold is skipped — `apply` refuses it as a dependency.
   */
  validate: (input, tx) => {
    const [current] = tx.select().from(accounts).where(eq(accounts.id, input.id)).all();
    if (!current) return;
    if (current.version !== input.version) {
      throw new LocalRefusal(
        `delete_account: stale version — read ${input.version}, row is at ${current.version}`,
      );
    }
    assertUnreferenced(input.id, tx);
  },
  apply: (input, tx) => deleteAccount(input, tx),
});

function assertUnreferenced(id: DeleteAccountInput["id"], tx: ReplicaTx): void {
  const reference = accountReference(tx, id);
  if (reference !== undefined) {
    throw new LocalRefusal(
      `delete_account: ${id} has entries (${reference}) — archive it instead (§6.9, accounts_delete_guard)`,
      { params: { reference } },
    );
  }
}

function deleteAccount(input: DeleteAccountInput, tx: ReplicaTx): LocalAccountRow {
  const [current] = tx.select().from(accounts).where(eq(accounts.id, input.id)).all();
  if (!current) {
    throw new LocalRefusal(`delete_account: no account ${input.id}`, { dependency: true });
  }
  if (current.version !== input.version) {
    throw new LocalRefusal(
      `delete_account: stale version — read ${input.version}, row is at ${current.version}`,
    );
  }
  assertUnreferenced(input.id, tx);

  const [deleted] = tx
    .delete(accounts)
    .where(and(eq(accounts.id, input.id), eq(accounts.version, input.version)))
    .returning()
    .all();

  if (!deleted) {
    throw new Error("delete_account: the row changed between read and write");
  }
  return deleted;
}
