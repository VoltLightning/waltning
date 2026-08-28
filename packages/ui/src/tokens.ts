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

/**
 * The light palette.
 *
 * **Neutral ground; green is a signal.** The previous palette tinted the
 * ground, the borders, the headings and the shell green, and a green on
 * everything is a green that means nothing. The neutrals here carry a faint
 * green bias — chosen, not inherited — and green itself is reserved for four
 * jobs: a primary action, the focus ring, income, and the data ramp.
 */
export const color = {
  /** Outside the app frame — design boards only, never a screen. */
  canvas: "#e9ecea",
  /** Page background. Every card sits on this. */
  ground: "#f5f7f6",
  surface: "#ffffff",
  /** Table headers, inset boxes, filled chips — quieter than `surface`. */
  subtle: "#eef2f0",
  /** The transient fill under a finger. */
  pressed: "#e3e9e6",
  /** Card edges, dividers, the outline of an unfilled control. */
  border: "#dfe5e2",
  ink: "#171d1a",
  muted: "#667069",

  /** A primary action's fill. Job 1. */
  accent: "#22754f",
  /** Links, a secondary action's label. */
  accentText: "#1f6a48",
  /** Decorative accent marks, and the focus ring. Job 2. */
  accentIcon: "#3d9a6c",

  /**
   * Money has three colours of its own, and none of them is the accent.
   *
   * `income` is a *more vivid* green than `accent`, so a credit reads as an event
   * and a button reads as a control — related, never confused. Vivid by
   * saturation, not by lightness: the first value tried, `#1f9a5c`, was lighter
   * and failed 4.5:1 on white in `theme.test.tsx`. Same hue at 70% saturation
   * passes at 4.85 and still reads as the livelier of the two. `spend` is a
   * restrained red: unmistakable, not alarming. A transfer is neither; money
   * moved between your own accounts is `muted`, because nothing was gained or
   * lost. Job 3 is `income`.
   */
  income: "#178249",
  spend: "#b0402a",

  /**
   * The green ramp is the **entire** chart palette: magnitude reads as depth,
   * so there is no second hue to reach for. Job 4, and unchanged.
   */
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
  amber: "#f6efdc",
  amberInk: "#7b5b1d",
  amberBorder: "#dcc07a",

  /** Danger — a destructive action, a refused write. **Never chrome.** */
  danger: "#a33d26",
  dangerBg: "#f9e9e5",
  dangerBorder: "#e3a898",

  /**
   * The shell: one flat colour, no gradient. A gradient was the one thing on
   * the screen that read as decoration rather than as a surface.
   */
  shell: "#0f2b1f",
  shellText: "#f4f7f5",
  shellTextMuted: "#a9c4b6",

  /** App icon accent only. Not a UI colour. */
  bolt: "#f5c63d",
} as const;

/**
 * The dark palette — `design-system/02` §2.1, transcribed.
 *
 * Neutral near-black with the same faint green bias, the same four jobs for
 * green, and the same three money colours lifted for a dark ground. The shell
 * stays green in both themes; it is the one place the brand colour is allowed
 * to be structural.
 */
export const darkColor = {
  ground: "#0e1210",
  surface: "#161b18",
  subtle: "#1c2320",
  pressed: "#252e29",
  border: "#2b3530",
  ink: "#eef2ef",
  muted: "#9ba79f",
  accent: "#5cc08f",
  accentText: "#8fd6b3",
  accentIcon: "#5cc08f",
  textOnAccent: "#0b1a12",
  income: "#62d495",
  spend: "#ea8f7b",
  amber: "#3a301b",
  amberInk: "#f0d38c",
  amberBorder: "#8f7332",
  danger: "#f1a390",
  dangerBg: "#3b201b",
  dangerBorder: "#a85a48",
  shell: "#0a1f16",
  shellText: "#f0f5f2",
  shellTextMuted: "#86a496",
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
 * a weight by *face*, not by family plus `fontWeight`, so a family plus `600`
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

/**
 * Tightened. Cards were 20 and the ground panel 24, which together with a
 * 26px blur read as a consumer app; a tool is squarer. `pill` stays for chips
 * and tags, and for exactly one other thing — the floating add button, which
 * is the only circle on the screen and is findable because of it.
 */
export const radius = {
  pill: 999,
  xs: 3,
  /** Controls: buttons, inputs. */
  sm: 8,
  /** Cards, inset boxes. */
  md: 12,
  /** Sheets, and the ground panel lifting over the shell. */
  lg: 16,
} as const;

/* ── 2.5 Elevation ───────────────────────────────────────────────────────── */

/**
 * **One shadow, on the one thing that floats.**
 *
 * Nothing that sits in the layout casts a shadow: a card is a surface with a
 * hairline, a sheet is a surface with a scrim behind it. Elevation is conveyed
 * by edge and by surface step, which is what the dark theme was already doing
 * and light now does too. The `card` / `raised` / `frame` levels are kept as
 * names so a component can still say which kind of surface it is; they all
 * resolve to a border.
 *
 * `float` is the exception, and it is reserved: the add button is the only
 * object *above* the page, and the shadow is what says so. Three layers — a
 * tight contact edge, a mid cast, a soft far cast — rather than one large blur,
 * which is the glow this design system removed everywhere else.
 *
 * Expressed as the parts a platform needs rather than a CSS string: React
 * Native takes offset/opacity/radius and the web takes a `box-shadow`, and a
 * string here would be usable by exactly one of them.
 */
export const shadow = {
  float: {
    contact: { color: "#0f2b1f", opacity: 0.22, radius: 2, offsetY: 1 },
    mid: { color: "#0f2b1f", opacity: 0.18, radius: 10, offsetY: 4 },
    far: { color: "#0f2b1f", opacity: 0.35, radius: 24, offsetY: 12 },
  },
  /** The same three, lifted, while the button is being dragged. */
  floatLifted: {
    contact: { color: "#0f2b1f", opacity: 0.22, radius: 4, offsetY: 2 },
    mid: { color: "#0f2b1f", opacity: 0.22, radius: 22, offsetY: 10 },
    far: { color: "#0f2b1f", opacity: 0.45, radius: 40, offsetY: 24 },
  },
} as const;

export const hairline = { width: 1, color: "rgba(23,29,26,.10)" } as const;

/* ── 2.6 Focus ───────────────────────────────────────────────────────────── */

/**
 * On **every** interactive element. Never removed, never replaced by a colour
 * change alone — a colour-only focus state is invisible to anyone who cannot
 * distinguish the two colours, which is the population it exists for.
 */
export const focus = { width: 2, offset: 2, color: color.accentIcon } as const;

/* ── 2.7 Motion ──────────────────────────────────────────────────────────── */

/**
 * Every animation needs the `none` branch. `prefers-reduced-motion` is not a
 * preference about taste — for some people the sheet rise is the difference
 * between using the app and feeling ill.
 */
export const motion = {
  fast: { duration: 120, easing: "ease-out" },
  base: { duration: 200, easing: "cubic-bezier(.2,0,0,1)" },
  /** The header fold and the sheet rise share one curve. */
  fold: { duration: 260, easing: "cubic-bezier(.2,0,0,1)" },
  sheet: { duration: 280, easing: "cubic-bezier(.2,0,0,1)" },
  none: { duration: 0, easing: "linear" },
} as const;

/* ── §10 Accessibility ───────────────────────────────────────────────────── */

/**
 * The 44px floor, fixed once here rather than thirty times across screens.
 * `03-primitives.md` records that chips currently measure ~34 against it.
 */
export const touchTarget = { min: 44 } as const;
