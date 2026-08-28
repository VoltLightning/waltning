/**
 * The faces the design system needs, and the one thing about them that is not
 * obvious.
 *
 * **`fontFamily` plus `fontWeight` does not select a weight in React Native.**
 * On the web a browser has the whole family and picks the file; here each
 * weight is a *separate font file* registered under its own name, so
 * `fontFamily: "IBMPlexSans"` with `fontWeight: "600"` finds no such family
 * and falls back — or, worse, finds the regular file and synthesises a bold
 * from it, which is a smeared approximation of the semibold sitting unused in
 * the bundle. Both failures are silent, and the second one looks nearly right.
 *
 * So a weight is chosen by naming the face: `face.ui(600)`, never a family and
 * a weight separately. That is what these maps are for.
 *
 * **The names are the keys the app registers**, which is why they read like
 * package exports rather than like typography. `expo-font` maps a key to a
 * file, and whatever key it is given becomes the family name on both native and
 * web — so the string here and the string in `apps/mobile/src/fonts.ts` must be
 * the same string, and `REQUIRED_FACES` is what makes a mismatch fail rather
 * than fall back.
 *
 * **One family, and the digits chose it.** `design-system/02` §2.2 moved from
 * Figtree + Source Serif 4 to IBM Plex Sans alone, and the constraint that
 * decided between candidates was not taste: Android ignores `fontVariant`, so
 * a money column aligns there only if the face's digits are equal-width *in
 * the file*. Seven sans faces were measured from their `.ttf`s. Inter, Geist,
 * DM Sans and Manrope are proportional by default; Plex is 600 units on every
 * digit at every weight. `fonts.test.ts` pins that, so the day a different
 * family is tried the test says whether it is allowed to be.
 */

import { lineHeightFor, type TypeStep, type } from "../tokens.ts";

/** The families §2.2 names. `mono` is the platform's, so it loads nothing. */
export type FaceFamily = "ui" | "display" | "mono";

/**
 * Every registered face, by family and weight.
 *
 * A nested record rather than a flat `"ui-600"` key so a missing weight is a
 * compile error at the call site — `face.ui(550)` does not typecheck, where a
 * string key would have resolved to `undefined` and rendered in the fallback.
 *
 * **`display` is the same family as `ui`**, and is kept as a name on purpose.
 * A component that says `face.display(600)` is saying *this is a headline or a
 * figure*, and that meaning survives the day the display face is changed
 * again. It costs nothing: the two entries name the same file, and
 * `REQUIRED_FACES` dedupes.
 */
export const FACES = {
  ui: {
    400: "IBMPlexSans_400Regular",
    500: "IBMPlexSans_500Medium",
    600: "IBMPlexSans_600SemiBold",
    700: "IBMPlexSans_700Bold",
  },
  display: {
    600: "IBMPlexSans_600SemiBold",
  },
  /**
   * Not loaded and deliberately so — §2.2 asks for the platform's own
   * monospace, which is already present everywhere and is the one face that
   * should look native rather than branded.
   */
  mono: {
    400: "ui-monospace",
  },
} as const;

export type UiWeight = keyof typeof FACES.ui;
export type DisplayWeight = keyof typeof FACES.display;

/**
 * A face the app must register with `expo-font`.
 *
 * `mono` is excluded by construction: it is the platform's own, so asking the
 * app to load it would fail on a file that does not exist.
 *
 * **A union rather than an array type, because that is what makes the check a
 * compile error.** The app declares its asset map `satisfies Record<
 * RequiredFace, unknown>`, so a face named here and not supplied there fails to
 * build — and one supplied there and not named here fails too. An earlier draft
 * kept a second list in the app and compared the two at runtime; that is a
 * weaker check that also has to be remembered to run, and it put a file naming
 * no platform inside an app, which `tests/architecture.test.ts` correctly
 * refused.
 */
export type RequiredFace = (typeof FACES.ui)[UiWeight] | (typeof FACES.display)[DisplayWeight];

/** The same set at runtime, deduplicated, for anything that needs to enumerate it. */
export const REQUIRED_FACES: readonly RequiredFace[] = [
  ...new Set<RequiredFace>([...Object.values(FACES.ui), ...Object.values(FACES.display)]),
];

/**
 * A face, as a style fragment.
 *
 * Returns `fontFamily` **alone**, with no `fontWeight`. The weight is already
 * expressed by the file, and setting it again invites the synthetic-bold path
 * on the platform where the family has exactly one weight registered — a bug
 * that looks like a slightly-too-heavy heading and is never reported.
 */
export const face = {
  ui: (weight: UiWeight) => ({ fontFamily: FACES.ui[weight] }) as const,
  display: (weight: DisplayWeight) => ({ fontFamily: FACES.display[weight] }) as const,
  mono: () => ({ fontFamily: FACES.mono[400] }) as const,
};

/**
 * A **whole** scale step, as a style fragment.
 *
 * **The same bug as `face`, one level up.** That function exists because naming
 * a family and a weight separately does not select a face; this one exists
 * because naming a size and nothing else does not select a *step*. A step is
 * four properties — size, leading, tracking, weight — and every call site in
 * the package was taking one of them. `lineHeightRatio` reached exactly one
 * component out of twenty, and the display tracking §2.2 spent a paragraph
 * justifying reached none of them: a 54pt headline rendered at the platform's
 * default leading with no tracking, which does not look broken, it looks
 * *slightly wrong*, forever.
 *
 * So the step is the unit. `text.ui("body")` is body text; `text.ui("body",
 * 600)` overrides the weight, which is what a button label is; `text.display(
 * "displayHero")` is the figure. The weight argument is optional because the
 * step already states its own, so the default is the design system's answer
 * rather than the component's.
 *
 * **Two functions, mirroring `face`, and `display` is not decoration.** The
 * two resolve to the same file today. A component that says `display` is
 * saying *this is a headline or a figure*, and that survives the day the
 * display face changes again — which is the whole reason `FACES.display`
 * exists as a separate entry.
 *
 * `lineHeight` is resolved at the default text scale, which is what a
 * `StyleSheet` can hold. A screen that must honour a non-default scale reads
 * `lineHeightFor(step, scale)` itself; nothing does yet, and when something
 * does it will be a hook, not a constant.
 */
export type TextStep = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
};

function step(name: TypeStep, family: string): TextStep {
  const tokens = type[name];
  return {
    fontFamily: family,
    fontSize: tokens.fontSize,
    lineHeight: lineHeightFor(name),
    // Conditional rather than `letterSpacing: undefined`, which React Native
    // accepts and applies as `0` — a *different* thing from the step not
    // tracking, because it also overrides whatever a parent `Text` set.
    ...("letterSpacing" in tokens ? { letterSpacing: tokens.letterSpacing } : {}),
  };
}

export const text = {
  /** The step's own weight unless a component overrides it. */
  ui: (name: TypeStep, weight: UiWeight = type[name].weight) => step(name, FACES.ui[weight]),
  /**
   * The display face has exactly one weight, so it is the default rather than
   * the step's — a step's weight names a UI face, and `display` is a claim
   * about *what the text is*, not about how heavy it should be.
   */
  display: (name: TypeStep, weight: DisplayWeight = 600) => step(name, FACES.display[weight]),
  /**
   * A step in the platform's own monospace — codes, IDs, rate values.
   *
   * It exists because the alternative is `...text.ui("caption"), ...face.mono()`
   * and **the order of those two spreads decides whether the text is
   * monospaced at all.** Both rate lines had them the other way round, so the
   * caption's family won and the mono face was set and immediately discarded.
   * Nothing failed; the rates just were not monospaced.
   */
  mono: (name: TypeStep) => step(name, FACES.mono[400]),
};
