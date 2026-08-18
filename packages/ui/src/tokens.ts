/**
 * Design tokens — `design-system/02-tokens.md`, transcribed.
 *
 * **D0, and the reason it comes first.** `12-build-order.md` opens by warning
 * that a screen built before the vocabulary exists coins its own props, and the
 * design system becomes "a retrofit of thirty accumulated inventions". The
 * dashboard proved the point at n=2: it hardcoded `#b3261e` for a negative
 * balance, a colour that appears nowhere in this file.
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

/* ── 2.2 Typography ──────────────────────────────────────────────────────── */

/**
 * Families are named here and **loaded by the app** — a package cannot register
 * a font. Until `expo-font` loads them the platform default is used, which is a
 * visual gap and not a correctness one.
 */
export const fontFamily = {
  /** All interface text. */
  ui: "Figtree",
  /** Headings and figures only — the serif makes totals feel weighed. */
  display: "Source Serif 4",
  mono: "ui-monospace",
} as const;

/**
 * **Mandatory on every amount**, and the single most common omission when
 * figures are rendered ad hoc. It is what lets a column of numbers align
 * without a monospace face.
 */
export const tabularNums = ["tabular-nums", "lining-nums"] as const;

export const type = {
  /** The one dominant total, in the display currency. */
  displayHero: { fontSize: 54, lineHeight: 57 },
  displayOne: { fontSize: 38, lineHeight: 42 },
  displayTwo: { fontSize: 23, lineHeight: 28 },
  displayThree: { fontSize: 17, lineHeight: 22 },
  body: { fontSize: 14.5, lineHeight: 23 },
  bodySm: { fontSize: 13, lineHeight: 20 },
  caption: { fontSize: 11.5, lineHeight: 16 },
  /** Eyebrow labels. */
  kicker: { fontSize: 11, lineHeight: 13, fontWeight: "700", letterSpacing: 0.88 },
  /** Pills and tags. */
  tag: { fontSize: 10.5, lineHeight: 10.5, fontWeight: "700", letterSpacing: 0.84 },
} as const;

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
