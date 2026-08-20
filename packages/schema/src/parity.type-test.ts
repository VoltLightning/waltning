/**
 * The shared tables mean the same thing on both engines — asserted at compile
 * time, once, over the whole set.
 *
 * **One assertion, not one per table.** A hand-written pair of assertions per
 * table is itself the drift it is meant to prevent: adding a table and
 * forgetting its assertion leaves a silent hole, and nothing fails. Mapping
 * over the two modules covers every table that exists and fails when one side
 * gains or loses one.
 *
 * **Both directions of the contract.** `$inferSelect` is what a read returns
 * and `$inferInsert` is what a write must supply — and they fail on different
 * drift. A column present on one engine and absent on the other moves both. A
 * `.default()` on one side and not the other moves only `$inferInsert`, because
 * the row type is `string` either way and only the *insert* becomes optional.
 * Verified by breaking each in turn.
 */

// Type-only: this file must not pull either dialect's runtime onto anything's
// import graph, least of all both at once.
import type * as pg from "./pg.ts";
import type { SharedTable } from "./shared.ts";
import type * as sqlite from "./sqlite.ts";

/**
 * Invariant under assignability in both directions, so `{a: string}` and
 * `{a: string, b?: number}` are not "equal" and optionality is not silently
 * tolerated. A plain `extends` pair would accept exactly the widening this is
 * here to catch.
 */
type Exact<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

type Selects<S> = { [K in keyof S]: S[K] extends { $inferSelect: infer R } ? R : never };
type Inserts<S> = { [K in keyof S]: S[K] extends { $inferInsert: infer R } ? R : never };

export const readsMatch: Exact<Selects<typeof pg>, Selects<typeof sqlite>> = true;
export const writesMatch: Exact<Inserts<typeof pg>, Inserts<typeof sqlite>> = true;

/**
 * The vacuity guard. `Selects<{}>` is `{}`, and `Exact<{}, {}>` is `true` — so
 * if both modules exported nothing, or the `infer` arm silently produced
 * `never` for every table, the two assertions above would pass over nothing.
 * Naming a real column of a real table is what makes them mean something.
 */
/**
 * Both modules declare exactly the shared set — no more, no less. Without this
 * the two assertions above are satisfied by two modules that agree on the
 * tables they happen to share while each quietly omitting a different one.
 */
export const pgCoversTheSet: Exact<keyof typeof pg, SharedTable> = true;
export const sqliteCoversTheSet: Exact<keyof typeof sqlite, SharedTable> = true;

export const notVacuous: [
  Selects<typeof pg>["transactions"]["amountOriginal"],
  Selects<typeof sqlite>["transactions"]["amountOriginal"],
  Selects<typeof pg>["currencies"]["isPivot"],
] = ["12.34", "12.34", true];
