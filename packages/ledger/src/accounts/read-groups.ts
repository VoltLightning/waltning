/**
 * Group reads, against the replica.
 *
 * S16 §5 groups the register by `account_groups` and needs the `institution`
 * field `FX Cost` (`computations.md` §12) totals margin by — but that read is
 * this file's future caller. The nearer one is the create-account form's group
 * picker (B2), which needs only `id` and `name`; the row still carries
 * `institution` and `sort` because a second reader with a narrower need is not
 * a reason to narrow the first one's.
 */

import type { Id } from "@waltning/core/id";
import { asc, eq } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { accountGroups } = ledgerSchema;

export type LocalGroup = {
  id: Id<"accountGroups">;
  name: string;
  institution: string | null;
  sort: number;
};

export function readGroups<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
): readonly LocalGroup[] {
  return db
    .select({
      id: accountGroups.id,
      name: accountGroups.name,
      institution: accountGroups.institution,
      sort: accountGroups.sort,
    })
    .from(accountGroups)
    // Archived groups are kept for the accounts that still name them (§6.9);
    // nothing offers one for a new account, and no list shows one.
    .where(eq(accountGroups.archived, false))
    .orderBy(asc(accountGroups.sort), asc(accountGroups.name), asc(accountGroups.id))
    .all();
}
