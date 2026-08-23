/**
 * Semantic roles — the layer between a component and a colour.
 *
 * **A component names a job, never a colour.** `tokens.ts` is a palette:
 * `color.green600` is a hex, and nothing about the name says what it is for.
 * That was survivable while there was one theme, because a palette with one
 * arrangement is indistinguishable from a theme. It stops being survivable the
 * moment there are two: re-theming means finding every `green600` and
 * re-deriving what whoever wrote it *meant*, one call site at a time.
 *
 * So this file states the meanings, and `tokens.ts` keeps the values. The
 * meanings are not invented here — `design-system/02` already writes them out
 * in prose, and this makes that prose executable:
 *
 * > `amber` — *not finished, or not fully observed* (P4). **Never error, never
 * > success, never chrome.**
 * > `negative` — negative balances, MoM spend increases. **Never chrome.**
 *
 * **The census that produced this set is worth recording**, because it found a
 * defect the palette could not express. `color.surface` (`#ffffff`) was doing
 * two unrelated jobs: the background of a card, and the *label* on a filled
 * primary button. In light they coincide. In dark they do not — a card
 * background rises towards the ground while a label on an accent fill stays
 * light — and with one name there is no way to move one without moving the
 * other. They are `surface` and `textOnAccent` here, and separating them is the
 * whole reason this layer exists.
 *
 * **Why the value stays in `tokens.ts`.** That file's own docstring gives the
 * reason and it still holds: the same numbers reach a native `StyleSheet`, a
 * web style object and a chart library, and a token consumable one way only is
 * a token that gets copied. This maps roles onto it; it does not replace it.
 *
 * **Roles that share a value today are still separate roles.** `pressedFill`
 * and `tagNeutralFill` are both `green100`. Merging them would be an
 * abstraction over a coincidence: a transient press and a persistent tag
 * background are different things, and the day one moves is the day the merge
 * costs more than it saved. The rule against abstraction before the third use
 * governs *inventing* mechanisms, not *naming* meanings.
 */

import { color, darkColor, shadow } from "../tokens.ts";

export type ThemeElevation = {
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffset: { width: number; height: number };
  borderWidth: number;
  borderColor: string;
};

/**
 * Every colour decision the component library can make.
 *
 * Deliberately a closed record rather than an index signature: a theme that
 * omits a role must fail to compile, because at runtime a missing role is
 * `undefined`, and `undefined` renders as transparent or black. That reads as a
 * styling slip on one screen — so it gets fixed there, locally, and stays
 * broken on every other screen that uses the same role.
 */
export type Theme = {
  /** The page. Every card sits on it. */
  ground: string;
  /** A card, sheet or row lifted above `ground`. */
  surface: string;
  /** Table headers, inset boxes, filled chips — quieter than `surface`. */
  subtleFill: string;
  /** The transient fill under a finger or cursor. */
  pressedFill: string;

  /** Dividers, rules, and the outline of an unfilled control. */
  border: string;
  /** The hairline rule, which is a colour *and* an alpha. */
  hairline: string;

  /** Body text. */
  text: string;
  /** Secondary text: labels, captions, metadata, affixes. */
  textMuted: string;
  /**
   * Text and icons sitting **on** `accent`. Not `surface` — see the header.
   * These coincide in light and must not be assumed to.
   */
  textOnAccent: string;

  /** A primary action's fill. */
  accent: string;
  /** Links, a secondary action's label, heading ink. */
  accentText: string;
  /** Decorative accent marks — a route arrow, a direction glyph. */
  accentIcon: string;
  /**
   * The focus ring. §2.6 puts it on **every** interactive element, never
   * removed and never replaced by a colour change alone.
   */
  focusRing: string;

  /** P4's *asserted or aged*: a manual override, an estimated rate, a stale figure. */
  assertedFill: string;
  assertedText: string;
  assertedBorder: string;

  /** Negative balances and rising spend. **Never chrome.** */
  dangerFill: string;
  dangerText: string;
  dangerBorder: string;

  /** A neutral tag — a category, a count, a state that is not a warning. */
  tagNeutralFill: string;
  tagNeutralText: string;

  /** The shell gradient's two stops. */
  shellFrom: string;
  shellTo: string;

  elevation: {
    card: ThemeElevation;
    raised: ThemeElevation;
    frame: ThemeElevation;
  };
};

function lightElevation(value: (typeof shadow)[keyof typeof shadow]): ThemeElevation {
  return {
    shadowColor: value.color,
    shadowOpacity: value.opacity,
    shadowRadius: value.radius,
    shadowOffset: { width: 0, height: value.offsetY },
    borderWidth: 0,
    borderColor: color.green200,
  };
}

function darkElevation(): ThemeElevation {
  return {
    shadowColor: darkColor.ground,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    borderWidth: 1,
    borderColor: darkColor.border,
  };
}

/**
 * The light theme — `design-system/02` §2.1, mapped rather than restated.
 *
 * Every value here is a `tokens.ts` entry. A literal in this file would be a
 * colour the spec does not contain, which is the thing `tokens.ts` exists to
 * prevent, moved one file along.
 */
export const light: Theme = {
  ground: color.ground,
  surface: color.surface,
  subtleFill: color.green50,
  pressedFill: color.green100,

  border: color.green200,
  hairline: "rgba(14,46,32,.09)",

  text: color.ink,
  textMuted: color.muted,
  textOnAccent: color.surface,

  accent: color.green600,
  accentText: color.green700,
  accentIcon: color.green500,
  focusRing: color.green500,

  assertedFill: color.amber,
  assertedText: color.amberInk,
  assertedBorder: color.amberInk,

  dangerFill: color.negativeBg,
  dangerText: color.negative,
  dangerBorder: color.negative,

  tagNeutralFill: color.green100,
  tagNeutralText: color.green700,

  shellFrom: color.green900,
  shellTo: color.green800,

  elevation: {
    card: lightElevation(shadow.card),
    raised: lightElevation(shadow.raised),
    frame: lightElevation(shadow.frame),
  },
};

export const dark: Theme = {
  ...darkColor,
  elevation: {
    card: darkElevation(),
    raised: darkElevation(),
    frame: darkElevation(),
  },
};

export const themes = { light, dark } as const;

export type ThemeName = keyof typeof themes;
