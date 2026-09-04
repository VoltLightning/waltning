import { counterparties } from "./counterparties.pg.ts";
import { pgKit as k } from "./kit.ts";

/**
 * S15 §9.1's *these are different* decision, recorded so `MatchWarning` never
 * asks about the same pair twice. Ordered `a_id < b_id` — a pair has no
 * direction, and normalising the order once here is what lets a single row
 * answer the question regardless of which counterparty was on screen when the
 * decision was made.
 *
 * The composite primary key **and** the ordering CHECK are real constraints on
 * Postgres, declared in `packages/db`; this is the bare table, for the parity
 * assertion. See `counterparty-distinct-pairs.sqlite.ts` for why the phone's
 * copy is not bare.
 */
export const counterpartyDistinctPairsColumns = () => ({
  aId: k
    .uuid<"counterparties">("a_id")
    .notNull()
    .references(() => counterparties.id),
  bId: k
    .uuid<"counterparties">("b_id")
    .notNull()
    .references(() => counterparties.id),
});

export const counterpartyDistinctPairs = k.table(
  "counterparty_distinct_pairs",
  counterpartyDistinctPairsColumns(),
);
