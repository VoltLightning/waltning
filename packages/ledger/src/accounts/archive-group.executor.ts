/**
 * `archive_group`, on the device — S16 §5.
 *
 * **Flips `account_groups.archived`, never deletes.** `SPEC.md` §6.9:
 * reference data is archived, not deleted — the rule already holds for
 * `accounts` and `categories`, and `account_groups` gained the same column
 * (`account-groups.pg.ts`, `account-groups.sqlite.ts`) so `archive_group`
 * could actually mean archive.
 *
 * **Refused only while a *live* account still names it** — an archived
 * account may keep naming an archived group; a flag has no foreign key to
 * violate, so there is nothing to orphan the way a delete would have.
 * `readGroups` (`read-groups.ts`) is what excludes an archived group from
 * S16's list, the same way `readAccounts` excludes an archived account.
 */

import { type ArchiveGroupInput, archiveGroupInput } from "@waltning/core/registry/inputs";
import { and, eq } from "drizzle-orm";
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
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
  const [current] = tx.select().from(accountGroups).where(eq(accountGroups.id, input.id)).all();
  if (!current) {
    throw new LocalRefusal(`archive_group: no group ${input.id}`);
  }
  if (current.archived) {
    throw new LocalRefusal(`archive_group: ${input.id} is already archived`);
  }

  const referring = tx
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.groupId, input.id), eq(accounts.archived, false)))
    .all();
  if (referring.length > 0) {
    throw new LocalRefusal(
      `archive_group: ${referring.length} live account(s) still name group ${input.id} — ` +
        "a group with accounts cannot vanish under them",
    );
  }

  const [updated] = tx
    .update(accountGroups)
    .set({ archived: true })
    .where(eq(accountGroups.id, input.id))
    .returning()
    .all();

  if (!updated) {
    throw new LocalRefusal("archive_group: the row changed between read and write");
  }
  return updated;
}
