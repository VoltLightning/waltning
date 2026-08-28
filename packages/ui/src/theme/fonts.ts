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
