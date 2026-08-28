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
 * > `spend` — debits, negative balances, rising spend. **Never chrome.**
 *
 * **This layer is why the restyle was a token change and not a rewrite.** The
 * palette went from a green world to a neutral one with green as a signal;
 * every component kept naming `surface`, `border`, `accent`, and not one of
 * them was edited for it. The census that produced the set is still worth
 * recording: `color.surface` was doing two unrelated jobs — a card's background
 * and the *label* on a filled primary button — which coincide in light and
 * diverge in dark. They are `surface` and `textOnAccent` here, and separating
 * them is the whole reason this layer exists.
 *
 * **Roles that share a value today are still separate roles.** `pressedFill`
 * and a tag's fill may resolve to the same hex. Merging them would be an
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

  /** Card edges, dividers, and the outline of an unfilled control. Neutral. */
  border: string;
  /** The hairline rule, which is a colour *and* an alpha. */
  hairline: string;

  /** Body text — and heading ink. A heading is not a signal. */
  text: string;
  /** Secondary text: labels, captions, metadata, affixes. */
  textMuted: string;
  /**
   * Text and icons sitting **on** `accent`. Not `surface` — see the header.
   * These coincide in light and must not be assumed to.
   */
  textOnAccent: string;

  /** A primary action's fill. Green's first job. */
  accent: string;
  /** Links, a secondary action's label. */
  accentText: string;
  /** Decorative accent marks — a route arrow, a direction glyph. */
  accentIcon: string;
  /**
   * The focus ring — green's second job. §2.6 puts it on **every** interactive
   * element, never removed and never replaced by a colour change alone.
   */
  focusRing: string;

  /**
   * Money's three colours. `<Amount>` takes a `kind`, never a colour, and
   * resolves it here. `income` is green's third job and is deliberately
   * brighter than `accent`; `spend` is a restrained red; a transfer renders in
   * `textMuted`, so it has no role of its own.
   */
  income: string;
  spend: string;

  /** P4's *asserted or aged*: a manual override, an estimated rate, a stale figure. */
  assertedFill: string;
  assertedText: string;
  assertedBorder: string;

  /** A destructive action or a refused write. **Never chrome.** */
  dangerFill: string;
  dangerText: string;
  dangerBorder: string;

  /** A neutral tag — a category, a count, a state that is not a warning. */
  tagNeutralFill: string;
  tagNeutralText: string;

  /** The shell: one flat colour. The only place green is structural. */
  shell: string;
  /** Text and icons placed on the shell. */
  shellText: string;
  /** Secondary text on the shell — the currency marker, the mine/ours line. */
  shellTextMuted: string;
  /** The dimming layer behind a modal surface. */
  scrim: string;

  /**
   * `card`, `raised` and `frame` all resolve to a border in both themes — the
   * names survive so a component can still say what kind of surface it is.
   * `float` is the one real shadow, reserved for the add button.
   */
  elevation: {
    card: ThemeElevation;
    raised: ThemeElevation;
    frame: ThemeElevation;
    float: ThemeElevation;
    floatLifted: ThemeElevation;
  };
};

/** Elevation by edge: a one-pixel border, no shadow. Both themes. */
function bordered(borderColor: string): ThemeElevation {
  return {
    shadowColor: borderColor,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    borderWidth: 1,
    borderColor,
  };
}

/**
 * The floating button's shadow.
 *
 * React Native's `shadow*` props express **one** shadow, and the design is
 * three layers. The far layer is the one that carries the read of "above the
 * page", so it is the one a native surface gets; the web bundle composes all
 * three from `tokens.shadow` directly. The `borderColor` carries the faint
 * rim the dark theme needs to separate the button from a near-black ground.
 */
type ShadowLayer = { color: string; opacity: number; radius: number; offsetY: number };

function floating(layer: ShadowLayer, rim: string, rimWidth: number): ThemeElevation {
  return {
    shadowColor: layer.color,
    shadowOpacity: layer.opacity,
    shadowRadius: layer.radius,
    shadowOffset: { width: 0, height: layer.offsetY },
    borderWidth: rimWidth,
    borderColor: rim,
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
  subtleFill: color.subtle,
  pressedFill: color.pressed,

  border: color.border,
  hairline: "rgba(23,29,26,.10)",

  text: color.ink,
  textMuted: color.muted,
  textOnAccent: color.surface,

  accent: color.accent,
  accentText: color.accentText,
  accentIcon: color.accentIcon,
  focusRing: color.accentIcon,

  income: color.income,
  spend: color.spend,

  assertedFill: color.amber,
  assertedText: color.amberInk,
  assertedBorder: color.amberBorder,

  dangerFill: color.dangerBg,
  dangerText: color.danger,
  dangerBorder: color.dangerBorder,

  tagNeutralFill: color.subtle,
  tagNeutralText: color.muted,

  shell: color.shell,
  shellText: color.shellText,
  shellTextMuted: color.shellTextMuted,
  scrim: color.ink,

  elevation: {
    card: bordered(color.border),
    raised: bordered(color.border),
    frame: bordered(color.border),
    float: floating(shadow.float.far, color.shell, 0),
    floatLifted: floating(shadow.floatLifted.far, color.shell, 0),
  },
};

export const dark: Theme = {
  ground: darkColor.ground,
  surface: darkColor.surface,
  subtleFill: darkColor.subtle,
  pressedFill: darkColor.pressed,

  border: darkColor.border,
  hairline: "rgba(228,241,232,.12)",

  text: darkColor.ink,
  textMuted: darkColor.muted,
  textOnAccent: darkColor.textOnAccent,

  accent: darkColor.accent,
  accentText: darkColor.accentText,
  accentIcon: darkColor.accentIcon,
  focusRing: darkColor.accentIcon,

  income: darkColor.income,
  spend: darkColor.spend,

  assertedFill: darkColor.amber,
  assertedText: darkColor.amberInk,
  assertedBorder: darkColor.amberBorder,

  dangerFill: darkColor.dangerBg,
  dangerText: darkColor.danger,
  dangerBorder: darkColor.dangerBorder,

  tagNeutralFill: darkColor.subtle,
  tagNeutralText: darkColor.muted,

  shell: darkColor.shell,
  shellText: darkColor.shellText,
  shellTextMuted: darkColor.shellTextMuted,
  scrim: darkColor.ground,

  elevation: {
    card: bordered(darkColor.border),
    raised: bordered(darkColor.border),
    frame: bordered(darkColor.border),
    // A faint green rim: on a near-black ground a dark shadow alone does not
    // separate the button, and the rim is what does.
    float: floating(shadow.float.far, darkColor.accent, 1),
    floatLifted: floating(shadow.floatLifted.far, darkColor.accent, 1),
  },
};

export const themes = { light, dark } as const;

export type ThemeName = keyof typeof themes;
