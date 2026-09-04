/**
 * `monogramFor` — Q10's decision: "monogram on a ramp tint, derived
 * deterministically from the name. No photo picker — it is a debt ledger,
 * not a contacts app" (`design-system/13` §Q10).
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
import { color } from "../tokens.ts";

/** Five steps, skipping the near-white and near-black ends of the ramp. */
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

/** A small, stable hash — sum of code points is enough for six ramp steps. */
function hashOf(s: string): number {
  let total = 0;
  for (let i = 0; i < s.length; i++) total += s.codePointAt(i) ?? 0;
  return total;
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
  return {
    letter: trimmed === "" ? "?" : (trimmed[0]?.toUpperCase() ?? "?"),
    fill,
    ink: step >= 500 ? theme.textOnAccent : DARK_INK,
  };
}
