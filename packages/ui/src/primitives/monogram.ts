/**
 * `monogramFor` — Q10's decision: "monogram on a ramp tint, derived
 * deterministically from the name. No photo picker — it is a debt ledger,
 * not a contacts app" (`design-system/13` §Q10).
 *
 * **In `primitives/`, not `counterparties/`.** `CounterpartyRow`'s own
 * fallback was its first use; `BrandIcon` (`transactions/brand-icon.tsx`,
 * `SPEC.md` §14.4b) needs the identical treatment for an unrecognised
 * payee — "same treatment as CounterpartyRow's fallback" is that
 * component's own spec line, not a coincidence — and a second domain
 * needing it is what moves a symbol to the domain-free foundation
 * (`CLAUDE.md`'s architecture rule; `tests/module-boundaries.test.ts`
 * enforces the direction). Nothing about the function changed; only where
 * it lives.
 *
 * **The green ramp, not the theme.** `tokens.ts`'s `green100`…`green900` is
 * the chart palette (`design-system/02` §2.1) and carries no dark variant —
 * a single set of values reused as data ink regardless of theme, the same
 * property that lets `Treemap` (§7.2) fix its own ink rule against it: *tiles
 * ≥ ramp 500 use white ink; ≤ 400 use ink.* This reuses that exact rule,
 * because the two problems are the same shape — a small tile, a hashed step,
 * legible text on top of it.
 *
 * **Deterministic, not random.** The same folded name always lands on the
 * same step, so a counterparty's monogram is stable across renders, screens
 * and app restarts — a `Math.random()` tint would make every reload look
 * like a different person.
 */

import { fold } from "@waltning/core/capture/names";
import type { Theme } from "../theme/roles.ts";
import { categoryRamp, color } from "../tokens.ts";

/** Six steps, skipping the near-white and near-black ends of the ramp. */
const RAMP_STEPS: readonly [string, number][] = [
  [color.green200, 200],
  [color.green300, 300],
  [color.green400, 400],
  [color.green500, 500],
  [color.green600, 600],
  [color.green700, 700],
];

const DARK_INK = color.green900;

export type Monogram = {
  /** The first grapheme of the name, uppercased. `?` for an empty name. */
  letter: string;
  fill: string;
  ink: string;
};

/**
 * djb2 — a small, stable hash that reads *order*, not just membership (L2).
 * A sum of code points gives every anagram of a name the same hash (`Nina`
 * and `Iann` land on the same ramp step, which is not "deterministic per
 * name", it is "deterministic per multiset of characters") — djb2 folds each
 * character in with a multiply-and-add, so two names sharing every letter but
 * not their order land on different steps almost always.
 */
function hashOf(s: string): number {
  let hash = 5381;
  for (const grapheme of s) {
    hash = (hash * 33 + (grapheme.codePointAt(0) ?? 0)) >>> 0;
  }
  return hash;
}

/**
 * `theme.textOnAccent` for the light-ink steps, never a bare `#ffffff` — a
 * component names a role, not a colour, and `textOnAccent` is the one this
 * value already has everywhere else it sits on a filled background
 * (`Button`, `Checkbox`, `Toggle`). `DARK_INK` stays the ramp's own value,
 * unlike the light case: it is the ramp's dark end, not a theme role, and
 * `monogram.ts`'s own header explains why the ramp is reused as data ink
 * regardless of theme.
 */
export function monogramFor(name: string, theme: Theme): Monogram {
  const trimmed = name.trim();
  const folded = fold(trimmed);
  const [fill, step] = RAMP_STEPS[hashOf(folded) % RAMP_STEPS.length] ??
    RAMP_STEPS[0] ?? [color.green300, 300];
  // The first *grapheme*, not the first UTF-16 code unit (L2) —
  // `trimmed[0]` on a name outside the BMP (an emoji, or a character built
  // from a surrogate pair) would return half of it, an unpaired surrogate no
  // font renders as a letter.
  const firstGrapheme = Array.from(trimmed)[0];
  return {
    letter: trimmed === "" ? "?" : (firstGrapheme?.toUpperCase() ?? "?"),
    fill,
    ink: step >= 500 ? theme.textOnAccent : DARK_INK,
  };
}

/** A category's tint, and the ink that reads on it. */
export type CategoryTint = { fill: string; ink: string };

/**
 * `categoryTintFor` — the colour a category is recognised by, from its name.
 *
 * **The same move `monogramFor` makes, on the palette that can carry it.** A
 * counterparty gets a step of the green ramp because it needs to be *stable*,
 * not *distinguishable* — two people sharing a tint costs nothing. A category
 * is read across a ledger row, a *Where it went* bar and, later, a report's
 * slices, and there the whole job is telling one from another. `categoryRamp`
 * is the palette built for that; its own doc has the measurements.
 *
 * **Derived, not stored, and that is a decision rather than a shortcut.** The
 * schema has no colour on a category and no icon — the drawn palette assumed
 * both. A derived tint gives every category a consistent identity today,
 * across every screen, with no migration and no picker to build; a chosen one
 * is a column and an editor, and it can be added later without moving this,
 * because a stored value simply wins over the derivation.
 *
 * **Folded, so the tint survives a rename that is not one.** `Groceries` and
 * `groceries ` are the same category to a reader and hash the same here.
 * Renaming it to something genuinely different moves the tint, which is
 * correct: it is a different name.
 */
export function categoryTintFor(name: string, theme: Theme): CategoryTint {
  const step = categoryRamp[hashOf(fold(name.trim())) % categoryRamp.length] ?? categoryRamp[0];
  return { fill: step.fill, ink: step.light ? theme.textOnAccent : DARK_INK };
}
