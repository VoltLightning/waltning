/**
 * `archive_account`, on the device — `operations.md` *Accounts*, structural.
 *
 * **Archive, never delete** (S16 §8, §6.9) — history references accounts, so
 * this flips a flag rather than removing the row. Compare-and-swap on
 * `version`, same as `update_account`.
 */

import { type ArchiveAccountInput, archiveAccountInput } from "@waltning/core/registry/inputs";
import { and, eq, sql } from "drizzle-orm";
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";
import type { LocalAccountRow } from "./create-account.executor.ts";

const { accounts } = schema;
type ReplicaTx = LocalTx<unknown, typeof schema>;

export const archiveAccountExecutor = defineLocalExecutor<
  typeof archiveAccountInput,
  LocalAccountRow,
  ReplicaTx
>({
  operation: "archive_account",
  opVersion: 1,
  input: archiveAccountInput,
  mints: () => [],
  apply: (input, tx) => archiveAccount(input, tx),
});

function archiveAccount(input: ArchiveAccountInput, tx: ReplicaTx): LocalAccountRow {
  const [current] = tx.select().from(accounts).where(eq(accounts.id, input.id)).all();
  if (!current) {
    throw new LocalRefusal(`archive_account: no account ${input.id}`);
  }
  if (current.archived) {
    throw new LocalRefusal(`archive_account: ${input.id} is already archived`);
  }
  if (current.version !== input.version) {
    throw new LocalRefusal(
      `archive_account: stale version — read ${input.version}, row is at ${current.version}`,
    );
  }

  const [updated] = tx
    .update(accounts)
    .set({ archived: true, version: sql`${accounts.version} + 1`, updatedAt: new Date() })
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
    throw new Error("archive_account: the row changed between read and write");
  }
  return updated;
}
