/**
 * Ids are branded by table, asserted at compile time.
 *
 * Twenty-two id columns were one type, so `{ accountId: categoryId }`
 * compiled — and the failure is quiet: nullable columns take it without
 * complaint, and a foreign key only catches it if one exists and the id is not
 * a real row somewhere else.
 */

import type { Id } from "./id.ts";

type Expect<T extends true> = T;
type Not<T extends boolean> = T extends true ? false : true;
type Extends<A, B> = A extends B ? true : false;

/* ── two tables, two types ───────────────────────────────────────────────── */

export type AccountIsNotCategory = Expect<Not<Extends<Id<"accounts">, Id<"categories">>>>;
export type CategoryIsNotAccount = Expect<Not<Extends<Id<"categories">, Id<"accounts">>>>;

/** And a bare string is neither, which is what makes a route parameter parse. */
export type StringIsNotAnId = Expect<Not<Extends<string, Id<"accounts">>>>;

/* ── but an id is still a string, so it serialises untouched ─────────────── */

export type IdIsAString = Expect<Extends<Id<"accounts">, string>>;

/**
 * Non-vacuous: every assertion above is satisfied by `never`, so naming a value
 * of each type is what stops this file passing while proving nothing.
 */
export const inhabited: [Id<"accounts">, Id<"categories">] = [
  "a" as Id<"accounts">,
  "c" as Id<"categories">,
];
