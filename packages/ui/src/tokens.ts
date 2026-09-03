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
  /**
   * The component-fill steps, and the border steps — six values that the
   * 12-step scales (Radix, Geist) reserve so every state has a colour before a
   * component needs one. Ours were three; the audit found no hover, no
   * interactive border and no strong border, and each was going to be invented
   * ad hoc by the first component that wanted it. Derived by OKLab
   * interpolation between the existing anchors, so the new steps sit between
   * the old ones rather than beside them.
   */
  /** Table headers, inset boxes, filled chips — quieter than `surface`. */
  subtle: "#eef2f0",
  /** The fill under a pointer, between `subtle` and `pressed`. */
  hover: "#e8edeb",
  /** The transient fill under a finger. */
  pressed: "#e3e9e6",
  /** Card edges, dividers, the outline of an unfilled control. */
  border: "#dfe5e2",
  /** The border of an interactive control at rest — an input, a chip. */
  borderInteractive: "#bbc3be",
  /**
   * A border that must read on its own: a selected control, a focus-adjacent
   * edge. Held to 3:1 against `surface`, the WCAG floor for a UI boundary —
   * the first interpolation landed at 2.59 and was pushed.
   */
  borderStrong: "#8c958f",
  ink: "#171d1a",
  muted: "#667069",

  /** A primary action's fill. Job 1. */
  accent: "#22754f",
  /** Links, a secondary action's label. */
  accentText: "#1f6a48",
  /** Decorative accent marks, and the focus ring. Job 2. */
  accentIcon: "#3d9a6c",
  /**
   * A subtle green fill and its edge — a selected segment, a toggled chip, an
   * inset that belongs to the accent. Radix's steps 3 and 6; the accent text
   * reads on the fill at 4.9:1.
   */
  accentFill: "#e9f1ec",
  accentFillBorder: "#adc9b9",

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
   *
   * **A deep green, not a near-black.** The first value was `#0f2b1f` at L\* 15,
   * which on a phone is a black band with a green cast you have to be told
   * about. §2.1 grants the shell the one structural use of the brand colour;
   * a value that does not read as the brand colour spends that grant on
   * nothing. L\* 27 is where it starts reading as green, and it still holds
   * `shellText` at 9.6:1 and `shellTextMuted` at 5.5:1.
   */
  shell: "#18492f",
  shellText: "#f4f7f5",
  shellTextMuted: "#a9c4b6",

  /**
   * The ink the one shadow is cast in — the old shell value, kept because a
   * shadow wants a near-black with the page's green bias and the shell no
   * longer is one. Never a fill, never a text colour.
   */
  shadowInk: "#0f2b1f",

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
  hover: "#202824",
  pressed: "#252e29",
  border: "#2b3530",
  borderInteractive: "#48534d",
  borderStrong: "#66716a",
  ink: "#eef2ef",
  muted: "#9ba79f",
  accent: "#5cc08f",
  accentText: "#8fd6b3",
  accentIcon: "#5cc08f",
  accentFill: "#223229",
  accentFillBorder: "#365f4a",
  textOnAccent: "#0b1a12",
  income: "#62d495",
  spend: "#ea8f7b",
  amber: "#3a301b",
  amberInk: "#f0d38c",
  amberBorder: "#8f7332",
  danger: "#f1a390",
  dangerBg: "#3b201b",
  dangerBorder: "#a85a48",
  /**
   * **Lighter than the light theme's, and that is the point.** At `#0a1f16` the
   * band measured 1.10:1 against `ground` and 1.01:1 against `surface` — a
   * header indistinguishable from the page behind it and from the cards on it,
   * which is what it looked like. On a near-black ground a surface reads by
   * rising, so the dark shell ends up the lighter of the two: 1.95:1 on ground,
   * 1.80:1 on surface. `theme.test.tsx` holds the floor.
   */
  shell: "#1c4d38",
  shellText: "#f0f5f2",
  /** Lifted with the shell — `#86a496` was tuned for a near-black band and
   *  reads at 3.58:1 on this one, under the 4.5 floor. */
  shellTextMuted: "#a9c4b6",
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
 *
 * **A step carries its weight too**, because a scale that does not is a scale
 * every call site completes from memory. `fontWeight: "700"` sat on two steps
 * here and was read by nothing — the faces are separate files, so a weight is
 * chosen by naming a face — while every other step left the decision to
 * whoever wrote the component. `weight` names the face `theme/fonts.ts` should
 * resolve, and `text.ui("kicker")` is now the whole step rather than its size.
 *
 * **Read this through `text.*`, not field by field.** A step is four
 * properties and the call sites were taking one: `lineHeightRatio` reached
 * exactly one component and the display tracking reached none, so a heading
 * rendered at the platform's default leading with no tracking and looked
 * *nearly* right. `conformance.test.ts` refuses a bare `type.x.fontSize`.
 */
export const type = {
  /**
   * The display steps carry negative tracking, stated in pixels because that
   * is what React Native's `letterSpacing` takes: −0.02em at 54, −0.015em at
   * 38, −0.01em at 23. Large sans type sets loose by default and reads as
   * unset; the tracking is what makes a headline figure look engineered
   * rather than typed. Geist runs −2.4px at 48.
   */
  /** The one dominant total, in the display currency. */
  displayHero: { fontSize: 54, lineHeightRatio: 57 / 54, letterSpacing: -1.08, weight: 600 },
  displayOne: { fontSize: 38, lineHeightRatio: 42 / 38, letterSpacing: -0.57, weight: 600 },
  displayTwo: { fontSize: 23, lineHeightRatio: 28 / 23, letterSpacing: -0.23, weight: 600 },
  displayThree: { fontSize: 17, lineHeightRatio: 22 / 17, weight: 600 },
  /**
   * **16, not 14.5.** The old body was a desktop size on a phone held at
   * arm's length: Apple's floor for that is 17, Material's and Carbon's body
   * is 16. The dense-row size moves up with it and keeps the old body's
   * number, so a transaction row is now set at what was body.
   */
  body: { fontSize: 16, lineHeightRatio: 24 / 16, weight: 400 },
  bodySm: { fontSize: 14.5, lineHeightRatio: 22 / 14.5, weight: 400 },
  caption: { fontSize: 12, lineHeightRatio: 16 / 12, weight: 400 },
  /** Eyebrow labels. */
  kicker: { fontSize: 11, lineHeightRatio: 13 / 11, letterSpacing: 0.88, weight: 700 },
  /**
   * Pills and tags. A ratio of exactly 1 is **deliberate** — the step is
   * `textTransform: uppercase`, so there are no descenders to clip. Recorded
   * because it looks like an oversight and is the one step where it is not.
   */
  tag: { fontSize: 10.5, lineHeightRatio: 1, letterSpacing: 0.84, weight: 700 },
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
  /**
   * The tight pair: a label and the hint directly under it. Earned its place
   * the usual way — `gap: 2` was hand-written in five components before anyone
   * noticed the scale had no step for it, and a repeated off-scale value is a
   * missing token, not five mistakes.
   */
  xxs: 2,
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
  /**
   * Halved from the first cut. The construction was right — three hue-matched
   * layers with doubling offset and blur — and the ink was three times the
   * field: Geist stacks its layers at 4–12%, Comeau's layered shadows run
   * about 0.075 per layer. At the old 22/18/35 the button read as glowing,
   * which is the one thing a shadow in this system must not do.
   */
  float: {
    contact: { color: color.shadowInk, opacity: 0.1, radius: 2, offsetY: 1 },
    mid: { color: color.shadowInk, opacity: 0.08, radius: 10, offsetY: 4 },
    far: { color: color.shadowInk, opacity: 0.16, radius: 24, offsetY: 12 },
  },
  /** The same three, lifted, while the button is being dragged. */
  floatLifted: {
    contact: { color: color.shadowInk, opacity: 0.12, radius: 4, offsetY: 2 },
    mid: { color: color.shadowInk, opacity: 0.1, radius: 22, offsetY: 10 },
    far: { color: color.shadowInk, opacity: 0.22, radius: 40, offsetY: 24 },
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
  /**
   * Entering, exiting, responding: a **strong** ease-out. The built-in
   * `ease-out` is the one Kowalski names as too weak — it barely decelerates,
   * so the element arrives at the same speed it left. This curve does most of
   * its travel in the first third, which is where the eye is.
   */
  fast: { duration: 120, easing: "cubic-bezier(.23,1,.32,1)" },
  base: { duration: 200, easing: "cubic-bezier(.2,0,0,1)" },
  /**
   * Something that **moves** on screen rather than appears — the header's
   * title sliding into its collapsed place, a row reordering. Ease-in-out,
   * because a thing already visible should leave gently as well as arrive
   * gently; ease-out on movement looks like it was fired.
   */
  move: { duration: 220, easing: "cubic-bezier(.77,0,.175,1)" },
  /** The header fold. Decelerate; the moving parts inside it use `move`. */
  fold: { duration: 260, easing: "cubic-bezier(.2,0,0,1)" },
  /** The iOS drawer curve: quick to leave the edge, long settle. */
  sheet: { duration: 280, easing: "cubic-bezier(.32,.72,0,1)" },
  none: { duration: 0, easing: "linear" },
} as const;

/**
 * **How often an interaction happens decides whether it animates at all.**
 *
 * Kowalski's table, adopted as a rule: something done a hundred times a day
 * gets no animation; tens of times a day, as little as possible; occasionally,
 * the standard motion; rarely, delight. The named zero-animation case in this
 * product is the keypad — J02 runs several times a day and a capture is a
 * dozen taps, so a keypad that animates is a keypad that feels slow by the
 * second week. The sheet that holds it may rise; the keys inside it may not.
 */
export const motionFrequency = {
  /** A keypad key, a keyboard shortcut. */
  constant: "none",
  /** Navigation, a chip tap, a row press. Press feedback only. */
  frequent: "fast",
  /** A sheet, a toast, the header fold. */
  occasional: "base",
  /** First run, a milestone. */
  rare: "sheet",
} as const satisfies Record<string, keyof typeof motion>;

/* ── §10 Accessibility ───────────────────────────────────────────────────── */

/**
 * The 44px floor, fixed once here rather than thirty times across screens.
 * `03-primitives.md` records that chips currently measure ~34 against it.
 */
export const touchTarget = { min: 44 } as const;
