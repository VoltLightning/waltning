/**
 * P1, enforced by the compiler.
 *
 * `design-system/04` §4.2: *"`<FxAmount>` cannot be rendered without a rate.
 * That is what makes P1 a guarantee rather than a convention."*
 *
 * A guarantee that only fails at run time fails **after** the converted figure
 * is on screen, which is the moment it needed to have failed. So these are
 * compile-time assertions, in `pnpm -r typecheck`, which the pre-commit hook
 * gates on — the same mechanism `registry/contract.types.ts` uses. Weakening the
 * props type is then a `tsc` error, deterministic and offline, rather than a
 * review someone has to notice.
 *
 * Type-only, and deliberately: the file emits nothing, so it cannot be run,
 * imported by accident, or pass because a mock was wrong. If it compiles, P1
 * holds.
 */

import type { FxAmountProps, FxProvenance } from "./fx-amount";

type Expect<T extends true> = T;
type Not<T extends boolean> = T extends true ? false : true;
/** Whether `A` would satisfy `B` — the question "is this prop optional" asks. */
type Assignable<A, B> = A extends B ? true : false;

/* ── 1 · the rate is not optional ────────────────────────────────────────── */

/**
 * **The assertion this whole file exists for.**
 *
 * Props without a rate must *not* satisfy `FxAmountProps`. If `rate` were ever
 * made optional this flips to `true` and the build fails — which is the only
 * form of "cannot be rendered without a rate" that survives someone editing the
 * props in a hurry.
 */
export type RateIsRequired = Expect<Not<Assignable<Omit<FxAmountProps, "rate">, FxAmountProps>>>;

/** And it must not accept `undefined` in place of a rate, which is the same hole. */
export type RateIsNotUndefined = Expect<Not<Assignable<undefined, FxAmountProps["rate"]>>>;

/**
 * The display currency is required for the same reason: a converted figure with
 * no stated target currency is a number whose meaning the reader has to guess.
 */
export type DisplayCurrencyIsRequired = Expect<
  Not<Assignable<Omit<FxAmountProps, "displayCurrency">, FxAmountProps>>
>;

/* ── 2 · provenance carries what its marker needs ────────────────────────── */

/**
 * `stale` requires an age. "Stale" without one tells a reader that something is
 * wrong and nothing about whether it matters — and a flat
 * `{ kind: string; ageDays?: number }` permits exactly that, which is why this
 * is a discriminated union rather than a string plus optional fields.
 */
export type StaleCarriesItsAge = Expect<
  Assignable<Extract<FxProvenance, { kind: "stale" }>, { ageDays: number }>
>;

/** A `stale` without its age is not a valid provenance. */
export type StaleWithoutAgeIsRejected = Expect<Not<Assignable<{ kind: "stale" }, FxProvenance>>>;

/** The variants with nothing to qualify must not carry an age they cannot mean. */
export type SyncedHasNoAge = Expect<
  Not<Assignable<Extract<FxProvenance, { kind: "synced" }>, { ageDays: number }>>
>;

/**
 * Every non-synced variant is one the design system marks amber. Adding a
 * variant without deciding its marker fails `MARKER`'s `Record` in the
 * component; this pins the set itself so the two cannot drift apart silently.
 */
export type ProvenanceKinds = Expect<
  Assignable<FxProvenance["kind"], "synced" | "override" | "estimated" | "stale">
>;
