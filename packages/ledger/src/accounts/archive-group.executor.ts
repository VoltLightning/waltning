/**
 * `archive_group`, on the device — S16 §5.
 *
 * **Named to match the server operation; behaves like a delete.** `CLAUDE.md`'s
 * *"archive, never delete"* is stated about `accounts` (§6.9 — history
 * references them). `account_groups` carries no history of its own: nothing
 * but `accounts.group_id` ever points at one, and `packages/schema` never gave
 * either dialect's `account_groups` table an `archived` column — checked in
 * `account-groups.pg.ts` and `account-groups.sqlite.ts`, both of which declare
 * only `id`, `name`, `institution`, `sort`. There is no flag this executor
 * could set even if it wanted one, so the operation the registry calls
 * "archive" is a delete underneath, and this file says so rather than
 * inventing a column `packages/schema` deliberately does not have.
 *
 * **Refused while *any* account still names it, archived or not** — not only
 * a live one, which is what the plan's own shorthand says and what the FK
 * would enforce anyway: `accounts.group_id` references `account_groups.id`
 * `ON DELETE no action` (`ddl.ts`), so a group an archived account still names
 * would fail this delete with a raw SQLite constraint violation rather than
 * the clear refusal a caller can render. Checking every account, not only the
 * live ones, is what keeps the two in agreement.
 */

import { type ArchiveGroupInput, archiveGroupInput } from "@waltning/core/registry/inputs";
import { eq } from "drizzle-orm";
import { defineLocalExecutor } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";
import type { LocalGroupRow } from "./create-group.executor.ts";

const { accountGroups, accounts } = schema;
type ReplicaTx = LocalTx<unknown, typeof schema>;

export const archiveGroupExecutor = defineLocalExecutor<
  typeof archiveGroupInput,
  LocalGroupRow,
  ReplicaTx
>({
  operation: "archive_group",
  opVersion: 1,
  input: archiveGroupInput,
  mints: () => [],
  apply: (input, tx) => archiveGroup(input, tx),
});

function archiveGroup(input: ArchiveGroupInput, tx: ReplicaTx): LocalGroupRow {
  const referring = tx
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.groupId, input.id))
    .all();
  if (referring.length > 0) {
    throw new Error(
      `archive_group: ${referring.length} account(s) still name group ${input.id} — ` +
        "a group with accounts cannot vanish under them",
    );
  }

  const [deleted] = tx
    .delete(accountGroups)
    .where(eq(accountGroups.id, input.id))
    .returning()
    .all();

  if (!deleted) {
    throw new Error(`archive_group: no group ${input.id}`);
  }
  return deleted;
}
