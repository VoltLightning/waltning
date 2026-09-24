/**
 * `set_account_visibility`, on the device — S16 §3's two pills.
 *
 * **What the register shows, and what its total counts.** Two flags because
 * they are two questions: a vault you want to see but not spend is in the list
 * and out of the total; a card you have stopped using is out of both.
 *
 * **Not `archive_account`, and the difference is not one of degree.**
 * Archiving says the account is *finished* — it refuses an account still
 * holding money and takes it out of every picker. This says *I do not want to
 * look at this one*: the account stays open, stays captured into, and every
 * figure outside the register is unchanged. A person with a joint account they
 * never manage wants the second and would be lied to by the first.
 *
 * **It refuses an archived account**, because there is nothing there to show
 * or hide — an archived account is already out of the register, and letting
 * this write flags onto one would leave a row claiming to be counted in a
 * total it can never appear in.
 *
 * Compare-and-swap on `version`, the same as `update_account` and
 * `archive_account`: two devices deciding what the register shows is an
 * ordinary conflict, and the one that read a stale row loses.
 */

import {
  type SetAccountVisibilityInput,
  setAccountVisibilityInput,
} from "@waltning/core/registry/inputs";
import { and, eq, sql } from "drizzle-orm";
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
import { type ReplicaTx, ledgerSchema as schema } from "../schema-map.ts";
import type { LocalAccountRow } from "./create-account.executor.ts";

const { accounts } = schema;

export const setAccountVisibilityExecutor = defineLocalExecutor<
  typeof setAccountVisibilityInput,
  LocalAccountRow,
  ReplicaTx
>({
  operation: "set_account_visibility",
  opVersion: 1,
  input: setAccountVisibilityInput,
  mints: () => [],
  apply: (input, tx) => setAccountVisibility(input, tx),
});

function setAccountVisibility(input: SetAccountVisibilityInput, tx: ReplicaTx): LocalAccountRow {
  const [current] = tx.select().from(accounts).where(eq(accounts.id, input.id)).all();
  if (!current) {
    throw new LocalRefusal(`set_account_visibility: no account ${input.id}`, { dependency: true });
  }
  // An archived account is already out of the register, so there is nothing
  // here to show or hide — and a row flagged `in_total` that can never appear
  // in one is a claim with no way to check it.
  if (current.archived) {
    throw new LocalRefusal(
      `set_account_visibility: ${input.id} is archived — an archived account is not in the register`,
    );
  }
  if (current.version !== input.version) {
    throw new LocalRefusal(
      `set_account_visibility: stale version — read ${input.version}, row is at ${current.version}`,
    );
  }

  const [updated] = tx
    .update(accounts)
    .set({
      hidden: input.hidden,
      inTotal: input.inTotal,
      version: sql`${accounts.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(accounts.id, input.id), eq(accounts.version, input.version)))
    .returning()
    .all();

  if (!updated) {
    throw new Error("set_account_visibility: the row changed between read and write");
  }
  return updated;
}
