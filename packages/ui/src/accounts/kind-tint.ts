/**
 * The colour an account kind wears — `02-tokens` §2.1b's `accountKindRamp`,
 * resolved against the active theme.
 *
 * **A lookup, not a hash.** `categoryTintFor` hashes a category's *name*,
 * because categories are created by whoever is using the app and there is no
 * fixed list to key on. Account kinds are a closed enum the schema enforces,
 * so the mapping is written down once and a kind's colour is a property of the
 * kind rather than of how its label happens to spell. That is what lets the
 * ramp promise a hue is never reassigned.
 *
 * **Total over `AccountKind`.** The ramp carries an entry per kind and this
 * indexes it by that key, so adding a tenth kind to the enum fails to compile
 * here until it has been given a colour — rather than falling through to a
 * default and shipping two kinds wearing the same mark.
 */

import type { AccountColor, AccountKind } from "@waltning/core/registry/inputs";
import type { Theme } from "../theme/roles.ts";
import { accountKindRamp } from "../tokens.ts";

/** The two values a kind's mark and label are drawn from. */
export type KindTint = {
  /** The mark's fill. */
  tint: string;
  /** The square inside the mark, and the section label beside it. */
  ink: string;
};

const BY_KIND = new Map(accountKindRamp.map((step) => [step.kind, step]));

/**
 * **Total by construction.** `accountKindRamp` is declared `as const` with one
 * entry per `AccountKind`, so this record is the compiler's proof that every
 * kind has a colour: a kind added to the enum and not to the ramp leaves a
 * missing key here.
 */
const STEPS: Record<AccountKind, (typeof accountKindRamp)[number]> = {
  bank: mustHave("bank"),
  cash: mustHave("cash"),
  card: mustHave("card"),
  clearing: mustHave("clearing"),
  loan_receivable: mustHave("loan_receivable"),
  loan_payable: mustHave("loan_payable"),
  investment: mustHave("investment"),
  deposit: mustHave("deposit"),
  other: mustHave("other"),
};

function mustHave(kind: AccountKind): (typeof accountKindRamp)[number] {
  const step = BY_KIND.get(kind);
  // Unreachable while the ramp holds every kind, which the record above is
  // what makes true — this is the throw that turns a silent `undefined` into
  // a failure at module load rather than a mark drawn in no colour at all.
  if (step === undefined) throw new Error(`accountKindRamp has no entry for ${kind}`);
  return step;
}

export function kindTint(kind: AccountKind, theme: Theme): KindTint {
  const step = STEPS[kind];
  return theme.scheme === "dark"
    ? { tint: step.darkTint, ink: step.darkInk }
    : { tint: step.tint, ink: step.ink };
}

/**
 * The colour an **account** wears: the one picked for it by hand, or its
 * kind's (`02-tokens` §2.1b). The nine picks are the ramp's own pairs, so a
 * hand-picked colour keeps every contrast and spacing guarantee the defaults
 * carry — there is no colour an account can be given that the ramp has not
 * been checked with.
 */
export function accountTint(
  account: { kind: AccountKind; color?: AccountColor | null | undefined },
  theme: Theme,
): KindTint {
  if (account.color === null || account.color === undefined) return kindTint(account.kind, theme);
  const step = BY_COLOR.get(account.color);
  if (step === undefined) return kindTint(account.kind, theme);
  return theme.scheme === "dark"
    ? { tint: step.darkTint, ink: step.darkInk }
    : { tint: step.tint, ink: step.ink };
}

const BY_COLOR = new Map<AccountColor, (typeof accountKindRamp)[number]>(
  accountKindRamp.map((step) => [step.color, step]),
);
