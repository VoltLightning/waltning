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
 *
 * **Compares `name_folded`, not `lower(trim(name))` (R2 C1).** SQLite's
 * `lower()` is ASCII-only, so `ŁUKASZ` and `łukasz` used to fold to two
 * different strings on the phone and both land — the index that was meant to
 * catch that never saw them collide. `fold()`
 * (`@waltning/core/capture/names`) runs the same case-fold-plus-diacritics in
 * JavaScript instead, so the value stored here is exactly what
 * `counterparties_name_uq` indexes.
 *
 * **Archived rows are excluded (R2 M3)**, matching the index: an archived
 * counterparty's old name is free for a fresh one to take, and history stays
 * under the archived row regardless (§9.2).
 */

import { fold } from "@waltning/core/capture/names";
import {
  type CreateCounterpartyInput,
  createCounterpartyInput,
} from "@waltning/core/registry/inputs";
import { and, eq, ne } from "drizzle-orm";
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
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
  // `fold()` never trims by itself (see the header note); trimmed here so
  // this holds regardless of whether the caller already did.
  const nameFolded = fold(input.name.trim());
  const [collision] = tx
    .select({ id: counterparties.id, name: counterparties.name })
    .from(counterparties)
    .where(
      and(
        eq(counterparties.nameFolded, nameFolded),
        eq(counterparties.archived, false),
        // Excluded, not refused: a replayed create of this same row (§14.6 —
        // "twice is once") must not collide with itself.
        ne(counterparties.id, input.id),
      ),
    )
    .all();

  if (collision) {
    throw new LocalRefusal(
      `create_counterparty: "${input.name}" collides with existing counterparty ` +
        `"${collision.name}" (${collision.id}) — counterparties_name_uq`,
    );
  }

  const fields = {
    name: input.name,
    nameFolded,
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
