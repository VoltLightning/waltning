/**
 * Counterparties, for a picker.
 *
 * The table exists from the shared schema (`#e3`'s ground work), but nothing
 * in this arc writes to it yet — `create_counterparty` is S15's, not built
 * here. So this is a genuine read over a genuinely empty table: it is not
 * hand-stubbed to `[]`, it simply has nothing to return until a later PR adds
 * the write path. A screen offering the counterparty field only when this
 * list is non-empty (S05 §5) is what makes that safe to ship now rather than
 * waiting on `#e3`.
 */

import type { Id } from "@waltning/core/id";
import { asc, eq } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { counterparties } = ledgerSchema;

export type LocalCounterparty = {
  id: Id<"counterparties">;
  name: string;
};

export function readCounterparties<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
): readonly LocalCounterparty[] {
  return db
    .select({ id: counterparties.id, name: counterparties.name })
    .from(counterparties)
    .where(eq(counterparties.archived, false))
    .orderBy(asc(counterparties.sort), asc(counterparties.name), asc(counterparties.id))
    .all();
}
