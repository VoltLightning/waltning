/**
 * `create_counterparty`, on the device — §6.6: *"counterparties become
 * first-class entities."*
 *
 * **Refuses an exact folded-name collision.** `counterparties_name_uq`
 * (`counterparties.sqlite.ts`) is the guarantee; this is the error. S15 §6
 * assigns the *exact*-collision case to the index — refused on the field,
 * naming the row it collides with — and leaves the *near*-match case
 * (`MatchWarning`, trigram similarity) to the screen, which is server-backed
 * (`pg_trgm`) and out of scope for a local executor. Checking here rather
 * than only letting the SQLite constraint fire means the refusal names the
 * colliding counterparty instead of a raw `UNIQUE constraint failed`.
 *
 * **Not H13's rule.** A collision the *server* admits at H13 is a merge
 * decision for arc 2 to make, never an error there; this refusal is the
 * phone's own capture-time rule (S15 §6), scoped to what this replica holds.
 */

import {
  type CreateCounterpartyInput,
  createCounterpartyInput,
} from "@waltning/core/registry/inputs";
import { and, ne, sql } from "drizzle-orm";
import { defineLocalExecutor } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";

const { counterparties } = schema;

/** The row as the replica holds it — every column, matching `LocalAccountRow`. */
export type LocalCounterpartyRow = typeof counterparties.$inferSelect;

type ReplicaTx = LocalTx<unknown, typeof schema>;

export const createCounterpartyExecutor = defineLocalExecutor<
  typeof createCounterpartyInput,
  LocalCounterpartyRow,
  ReplicaTx
>({
  operation: "create_counterparty",
  opVersion: 1,
  input: createCounterpartyInput,
  /** One id: the counterparty's own — the same H13 argument as `create_account`. */
  mints: (input) => [input.id],
  apply: (input, tx) => insertCounterparty(input, tx),
});

function insertCounterparty(input: CreateCounterpartyInput, tx: ReplicaTx): LocalCounterpartyRow {
  const [collision] = tx
    .select({ id: counterparties.id, name: counterparties.name })
    .from(counterparties)
    .where(
      and(
        sql`lower(trim(${counterparties.name})) = lower(trim(${input.name}))`,
        // Excluded, not refused: a replayed create of this same row (§14.6 —
        // "twice is once") must not collide with itself.
        ne(counterparties.id, input.id),
      ),
    )
    .all();

  if (collision) {
    throw new Error(
      `create_counterparty: "${input.name}" collides with existing counterparty ` +
        `"${collision.name}" (${collision.id}) — counterparties_name_uq`,
    );
  }

  const fields = {
    name: input.name,
    kind: input.kind,
    settlementCurrency: input.settlementCurrency,
    contact: input.contact,
    note: input.note,
  };

  const [row] = tx
    .insert(counterparties)
    .values({ id: input.id, ...fields })
    .onConflictDoUpdate({ target: counterparties.id, set: fields })
    .returning()
    .all();

  if (!row) {
    throw new Error("create_counterparty: the replica insert returned no row");
  }
  return row;
}
