/**
 * Design tokens — `design-system/02-tokens.md`, transcribed.
 *
 * **The vocabulary comes first.** A screen built before it exists coins its own
 * props, and the design system becomes "a retrofit of thirty accumulated
 * inventions". The dashboard proved the point at n=2: it hardcoded `#b3261e`
 * for a negative balance, a colour that appears nowhere in this file.
 *
 * Plain values, no React and no `StyleSheet`. Two reasons: the same numbers
 * have to reach a native `StyleSheet`, a web style object and a chart library,
 * and a token that can only be consumed one way is a token that gets copied.
 *
 * **This file is a transcription, not a design.** Every value here is in
 * `02-tokens.md`; changing one is a design decision that belongs there first.
 */

/* ── 2.1 Colour ──────────────────────────────────────────────────────────── */

export const color = {
  /** Outside the app frame — design boards only, never a screen. */
  canvas: "#e6ece5",
  /** Page background. Every card sits on this. */
  ground: "#f2f6f1",
  surface: "#ffffff",
  ink: "#1a2620",
  muted: "#5f7168",

  /**
   * The green ramp is the **entire** chart palette: magnitude reads as depth,
   * so there is no second hue to reach for.
   */
  green50: "#f2f9f4",
  green100: "#e4f1e8",
  green200: "#cbe6d6",
  green300: "#a3d2b8",
  green400: "#75bd99",
  green500: "#48a479",
  green600: "#2f7d5a",
  green700: "#215f45",
  green800: "#164531",
  green900: "#0e2e20",

  /**
   * P4's colour: *asserted or aged rather than observed*. One meaning across a
   * manual override, an estimated rate, an unsettled item and a stale figure.
   * **Never error, never success, never chrome** — the moment amber means two
   * things it means nothing.
   */
  amber: "#f8eed9",
  amberInk: "#856223",

  /** Negative balances and rising spend. **Never chrome.** */
  negative: "#a8452f",
  negativeBg: "#f6e7e3",

  /** App icon accent only. Not a UI colour. */
  bolt: "#f5c63d",
} as const;

/** `linear-gradient(160deg, …)` on web; two stops for a native gradient. */
export const shellGradient = { angle: 160, from: color.green900, to: color.green800 } as const;

/** The dark semantic palette — `design-system/02` §2.1, transcribed. */
export const darkColor = {
  ground: "#08130d",
  surface: "#10251a",
  subtleFill: "#173326",
  pressedFill: "#214735",
  border: "#2f5d46",
  hairline: "rgba(203,230,214,.16)",
  text: "#f2f6f1",
  textMuted: "#a3b8ad",
  textOnAccent: "#08130d",
  accent: "#75bd99",
  accentText: "#a3d2b8",
  accentIcon: "#75bd99",
  focusRing: "#75bd99",
  assertedFill: "#3b301c",
  assertedText: "#f1d18a",
  assertedBorder: "#9f7a31",
  dangerFill: "#3b211c",
  dangerText: "#f0a08d",
  dangerBorder: "#b95e49",
  tagNeutralFill: "#173326",
  tagNeutralText: "#a3d2b8",
  shellFrom: "#06100a",
  shellTo: "#0e2e20",
} as const;

/* ── 2.2 Typography ──────────────────────────────────────────────────────── */

/**
 * **Superseded by `theme/fonts.ts`, and kept because the mono entry is real.**
 *
 * This named three families and left the app to load them — which nothing did,
 * so for the whole life of the file every screen rendered in the system face
 * and the comment below described the gap without anything closing it.
 *
 * The deeper problem was that a family name is not enough: React Native selects
 * a weight by *face*, not by family plus `fontWeight`, so `Figtree` + `600`
 * finds nothing and falls back or synthesises. `theme/fonts.ts` names faces;
 * use `face.ui(600)`.
 */
export const fontFamily = {
  /** The platform's own monospace — the one face that is not loaded. */
  mono: "ui-monospace",
} as const;

export const tabularNums = ["tabular-nums", "lining-nums"] as const;

/**
 * The scale — `design-system/02` §2.2.
 *
 * **`lineHeight` is a ratio, not a second absolute.** It was a pair of fixed
 * numbers per step, which cannot survive the OS text-size setting:
 * `allowFontScaling` defaults to `true` on `<Text>`, so the platform scales
 * `fontSize` and the pair's relationship — the thing typography actually cares
 * about — was recorded nowhere and could not be preserved.
 *
 * Stating the ratio means a step scales as a step. `lineHeightFor()` derives
 * the absolute where one is needed.
 *
 * The ratios are the ones the original pairs implied, to three decimals, so
 * this changes no rendered layout at the default text size — verified in
 * `type.test.ts`, which recomputes every pair from the ratio and asserts it
 * lands back on the number §2.2 published.
 */
export const type = {
  /** The one dominant total, in the display currency. */
  displayHero: { fontSize: 54, lineHeightRatio: 57 / 54 },
  displayOne: { fontSize: 38, lineHeightRatio: 42 / 38 },
  displayTwo: { fontSize: 23, lineHeightRatio: 28 / 23 },
  displayThree: { fontSize: 17, lineHeightRatio: 22 / 17 },
  body: { fontSize: 14.5, lineHeightRatio: 23 / 14.5 },
  bodySm: { fontSize: 13, lineHeightRatio: 20 / 13 },
  caption: { fontSize: 11.5, lineHeightRatio: 16 / 11.5 },
  /** Eyebrow labels. */
  kicker: { fontSize: 11, lineHeightRatio: 13 / 11, fontWeight: "700", letterSpacing: 0.88 },
  /**
   * Pills and tags. A ratio of exactly 1 is **deliberate** — the step is
   * `textTransform: uppercase`, so there are no descenders to clip. Recorded
   * because it looks like an oversight and is the one step where it is not.
   */
  tag: { fontSize: 10.5, lineHeightRatio: 1, fontWeight: "700", letterSpacing: 0.84 },
} as const;

export type TypeStep = keyof typeof type;

/**
 * The absolute line height for a step, at a given text scale.
 *
 * Takes the scale explicitly rather than reading `PixelRatio.getFontScale()`
 * itself: a function that reads a global cannot be tested at 200% without a
 * device set to 200%, and the behaviour worth pinning is exactly the one at the
 * sizes nobody browses at.
 */
export function lineHeightFor(step: TypeStep, fontScale = 1): number {
  const { fontSize, lineHeightRatio } = type[step];
  return Math.round(fontSize * fontScale * lineHeightRatio * 100) / 100;
}

/**
 * How far a step may grow under the OS text-size setting.
 *
 * **A decision, not a default, and it differs by step.** Body text is
 * uncapped — someone who turned the setting up did so to read body text, and
 * capping it defeats the setting for the person it exists for.
 *
 * The display steps are capped, and `displayHero` hardest. At 54 it is the one
 * dominant figure on the screen; at an unbounded 200% it is 108pt in a layout
 * built for 54, and it stops being a headline and becomes the whole screen.
 * The figure stays legible at 1.4× — it is the largest thing rendered either
 * way — so the cap costs nothing that the setting was asked for.
 */
export const maxFontScale: Partial<Record<TypeStep, number>> = {
  displayHero: 1.4,
  displayOne: 1.5,
  displayTwo: 1.6,
};

/* ── 2.3 Spacing ─────────────────────────────────────────────────────────── */

/**
 * 4px base, and **deliberately coarse above 16**: the mockups use 22, 26, 34,
 * 44 and 52 for board and card padding, and rounding those onto a strict 8-grid
 * would visibly change the designs.
 */
export const space = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  x2: 14,
  x3: 16,
  x4: 20,
  x5: 22,
  x6: 26,
  x7: 34,
  x8: 44,
  x9: 52,
} as const;

/* ── 2.4 Radius ──────────────────────────────────────────────────────────── */

export const radius = {
  pill: 999,
  xs: 3,
  sm: 8,
  md: 12,
  lg: 20,
  /** The ground panel lifting over the shell. */
  xl: 24,
} as const;

/* ── 2.5 Elevation ───────────────────────────────────────────────────────── */

/**
 * Expressed as the parts a platform needs, rather than a CSS string: React
 * Native takes offset/opacity/radius and the web takes a `box-shadow`, and a
 * string here would be usable by exactly one of them.
 */
export const shadow = {
  card: { color: "#123022", opacity: 0.05, radius: 26, offsetY: 10 },
  raised: { color: "#0e2e20", opacity: 0.1, radius: 26, offsetY: 8 },
  frame: { color: "#0e2e20", opacity: 0.14, radius: 34, offsetY: 8 },
} as const;

export const hairline = { width: 1, color: "rgba(14,46,32,.09)" } as const;

/* ── 2.6 Focus ───────────────────────────────────────────────────────────── */

/**
 * On **every** interactive element. Never removed, never replaced by a colour
 * change alone — a colour-only focus state is invisible to anyone who cannot
 * distinguish the two colours, which is the population it exists for.
 */
export const focus = { width: 2, offset: 2, color: color.green500 } as const;

/* ── 2.7 Motion ──────────────────────────────────────────────────────────── */

/**
 * Every animation needs the `none` branch. `prefers-reduced-motion` is not a
 * preference about taste — for some people the sheet rise is the difference
 * between using the app and feeling ill.
 */
export const motion = {
  fast: { duration: 120, easing: "ease-out" },
  base: { duration: 200, easing: "cubic-bezier(.2,0,0,1)" },
  sheet: { duration: 280, easing: "cubic-bezier(.2,0,0,1)" },
  none: { duration: 0, easing: "linear" },
} as const;

/* ── §10 Accessibility ───────────────────────────────────────────────────── */

/**
 * The 44px floor, fixed once here rather than thirty times across screens.
 * `03-primitives.md` records that chips currently measure ~34 against it.
 */
export const touchTarget = { min: 44 } as const;
