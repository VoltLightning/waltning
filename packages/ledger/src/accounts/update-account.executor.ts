/**
 * `update_account`, on the device — `operations.md` *Accounts*, structural.
 *
 * **Compare-and-swap on `version`, then patch.** `architecture/14` §14.2: the
 * write carries the version it read; a mismatch means the row moved under the
 * writer and the write is refused rather than applied on top. Mirrors A2's
 * `patchTransaction` exactly.
 *
 * **`currency` has no in-place path** — `updateAccountInput` refuses it at the
 * schema, so there is nothing to re-check here (S16 §7).
 *
 * **The shared/business refusal runs on the *merged* row, not the patch
 * alone.** `createAccountInput`'s own refine checks the payload a caller
 * wrote in one step; a patch can flip either field on its own, so the row
 * `accounts_shared_not_business` actually evaluates is `current` with the
 * patch applied over it — checking the patch in isolation would let
 * `{ isBusiness: true }` through on a row that is already `shared`.
 */

import { type UpdateAccountInput, updateAccountInput } from "@waltning/core/registry/inputs";
import { and, eq, sql } from "drizzle-orm";
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";
import type { LocalAccountRow } from "./create-account.executor.ts";

const { accounts } = schema;
type ReplicaTx = LocalTx<unknown, typeof schema>;

export const updateAccountExecutor = defineLocalExecutor<
  typeof updateAccountInput,
  LocalAccountRow,
  ReplicaTx
>({
  operation: "update_account",
  opVersion: 1,
  input: updateAccountInput,
  mints: () => [],
  apply: (input, tx) => patchAccount(input, tx),
});

function patchAccount(input: UpdateAccountInput, tx: ReplicaTx): LocalAccountRow {
  const [current] = tx.select().from(accounts).where(eq(accounts.id, input.id)).all();
  if (!current) {
    throw new LocalRefusal(`update_account: no account ${input.id}`);
  }
  if (current.archived) {
    throw new LocalRefusal(`update_account: ${input.id} is archived`);
  }
  if (current.version !== input.version) {
    throw new LocalRefusal(
      `update_account: stale version — read ${input.version}, row is at ${current.version}`,
    );
  }

  const mergedOwnership = input.patch.ownership ?? current.ownership;
  const mergedIsBusiness = input.patch.isBusiness ?? current.isBusiness;
  if (mergedOwnership === "shared" && mergedIsBusiness) {
    throw new LocalRefusal(
      "update_account: a shared account is never business — §6.7, accounts_shared_not_business",
    );
  }

  const [updated] = tx
    .update(accounts)
    .set({ ...input.patch, version: sql`${accounts.version} + 1`, updatedAt: new Date() })
    .where(
      and(
        eq(accounts.id, input.id),
        eq(accounts.version, input.version),
        eq(accounts.archived, false),
      ),
    )
    .returning()
    .all();

  if (!updated) {
    throw new Error("update_account: the row changed between read and write");
  }
  return updated;
}
