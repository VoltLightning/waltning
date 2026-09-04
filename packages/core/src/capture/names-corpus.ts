/**
 * The corpus `name-collision-parity` proves both name-fold guards against.
 *
 * `packages/db/src/invariants/name-collision-parity.test.ts` and
 * `packages/ledger/src/invariants/name-collision-parity.test.ts` each insert
 * `a` into `counterparties`, then attempt `b`, and assert *their own* engine's
 * refuse-or-accept verdict equals `collide` — Postgres's unique index on
 * `lower(btrim(name))` (`packages/db/src/schema.ts`) on one side, SQLite's on
 * `lower(trim(name))` (`packages/schema/src/counterparties.sqlite.ts`) fed
 * through the executor's own `z.string().trim()` on the other
 * (`create-counterparty.executor.ts`, `packages/core/src/registry/inputs.ts`).
 * Neither engine folds a Polish letter or normalises NFD — the corpus states
 * what a person would call a collision, not what today's code detects, and
 * the two files' `it`/`it.fails` split is the record of where each engine's
 * verdict lands relative to that.
 *
 * A pair does *not* say which finding it belongs to — that is per engine,
 * decided at the call site, because the two engines can (and do) disagree on
 * the same pair for different reasons.
 */

export type NamePair = {
  /** Inserted first, always accepted. */
  readonly a: string;
  /** Attempted second. */
  readonly b: string;
  /** What a person would call this pair — the same name, or two different ones. */
  readonly collide: boolean;
  readonly why: string;
};

export const NAME_PAIRS: readonly NamePair[] = [
  {
    a: "Łukasz Placeholder",
    b: "łukasz placeholder",
    collide: true,
    why: "a Polish letter's case pair — Ł and ł are the same letter",
  },
  {
    a: "Józef Placeholder",
    b: "Józef Placeholder".normalize("NFD"),
    collide: true,
    why: "the same name, once precomposed (NFC) and once decomposed (NFD) — one person's name in two Unicode representations of the identical text",
  },
  {
    a: "Anna Placeholder",
    b: "anna placeholder",
    collide: true,
    why: "a plain ASCII case difference",
  },
  {
    a: "Anna Placeholder",
    b: "Anna Placeholder ",
    collide: true,
    why: "a trailing ASCII space (U+0020) — trim covers it",
  },
  {
    a: "Anna Placeholder",
    b: "Anna Placeholder\t",
    collide: true,
    why: "a trailing tab (U+0009)",
  },
  {
    a: "Anna Placeholder",
    b: "Anna Placeholder ",
    collide: true,
    why: "a trailing no-break space (U+00A0) — whitespace to a person, not to every trim",
  },
  {
    a: "Anna Placeholder",
    b: "Anna Placeholder\v",
    collide: true,
    why: "a trailing vertical tab (U+000B, the \\v escape) — invisible, and easy to paste in from a spreadsheet export",
  },
  {
    a: "Ivanov",
    b: "Ivano",
    collide: false,
    why: "a prefix of the other name, not the same name",
  },
  {
    a: "Lev",
    b: "Le",
    collide: false,
    why: "a prefix of the other name, not the same name",
  },
  {
    a: "Café",
    b: "Cafe",
    collide: false,
    why: "a non-Polish diacritic — é is not in the fold table (SPEC.md §6.6's two languages are en and pl), so a café and a cafe are two different spellings, not a collision",
  },
  {
    a: "Zażółć",
    b: "ZAZOLC",
    collide: true,
    why: "the same name under a full Polish diacritic fold plus case — every letter (ż, ó, ł) as well as the case",
  },
];
