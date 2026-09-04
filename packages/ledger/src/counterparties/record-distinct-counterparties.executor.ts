/**
 * `record_distinct_counterparties`, on the device — S15 §9.1: *"these are
 * different."* Auto-eligible: it records a person's judgement, so
 * `MatchWarning` never asks about the same pair twice.
 *
 * Normalises the pair to `a < b` before writing — a pair has no direction,
 * and the SQLite table's own CHECK (`counterparty_distinct_pairs_ordered`,
 * `counterparty-distinct-pairs.sqlite.ts`) holds regardless, but normalising
 * here is what makes the primary key actually dedupe: without it, `(X, Y)`
 * and `(Y, X)` would be two different attempts at the same row and only the
 * first would ever land.
 */

import type { Id } from "@waltning/core/id";
import { recordDistinctCounterpartiesInput } from "@waltning/core/registry/inputs";
import { defineLocalExecutor } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";

const { counterpartyDistinctPairs } = schema;
type ReplicaTx = LocalTx<unknown, typeof schema>;

export type LocalDistinctPairRow = typeof counterpartyDistinctPairs.$inferSelect;

export const recordDistinctCounterpartiesExecutor = defineLocalExecutor<
  typeof recordDistinctCounterpartiesInput,
  LocalDistinctPairRow,
  ReplicaTx
>({
  operation: "record_distinct_counterparties",
  opVersion: 1,
  input: recordDistinctCounterpartiesInput,
  // Names two rows that already exist; mints nothing of its own.
  mints: () => [],
  apply: (input, tx) => recordDistinct(input.aId, input.bId, tx),
});

function recordDistinct(
  first: Id<"counterparties">,
  second: Id<"counterparties">,
  tx: ReplicaTx,
): LocalDistinctPairRow {
  const [aId, bId] = first < second ? [first, second] : [second, first];

  const [row] = tx
    .insert(counterpartyDistinctPairs)
    // Idempotent: a pair already recorded distinct is a no-op, not a
    // refusal — asking "these are different" twice about the same pair is
    // not a mistake, it is the same answer arriving again.
    .values({ aId, bId })
    .onConflictDoNothing({ target: [counterpartyDistinctPairs.aId, counterpartyDistinctPairs.bId] })
    .returning()
    .all();

  return row ?? { aId, bId };
}
