/**
 * The faces, for the browser — declared once, checked by the compiler.
 *
 * **This is `apps/mobile/src/fonts.ts` again, for a different loader.** That
 * file says it plainly: *"The design system decides **which faces exist**; this
 * decides **where their bytes come from**."* Storybook is a third place bytes
 * have to come from, and it gets the same treatment rather than a second list.
 *
 * **`satisfies Record<RequiredFace, string>` is doing the entire check**, as it
 * does in the app. A face the design system requires and this map forgets fails
 * to compile; one supplied here that nothing requires fails too. An earlier
 * draft of this card wrote the `@font-face` rules by hand in a `.css` file and
 * added a test that read the stylesheet back and compared it to
 * `REQUIRED_FACES` — which is a second list plus a runtime comparison that has
 * to be remembered to run, i.e. exactly what that file rejected. Deleted in
 * favour of this.
 *
 * **Bundled, never fetched.** Same reasoning, unchanged: a webfont CDN "breaks
 * the appliance the moment the Pi has no route out, and it tells whoever hosts
 * it when the owner opened their finance app." These are the same `.ttf` bytes
 * inside `@expo-google-fonts/*` that the app ships, resolved by Vite.
 */

import Figtree_400Regular from "@expo-google-fonts/figtree/400Regular/Figtree_400Regular.ttf?url";
import Figtree_500Medium from "@expo-google-fonts/figtree/500Medium/Figtree_500Medium.ttf?url";
import Figtree_600SemiBold from "@expo-google-fonts/figtree/600SemiBold/Figtree_600SemiBold.ttf?url";
import Figtree_700Bold from "@expo-google-fonts/figtree/700Bold/Figtree_700Bold.ttf?url";
import SourceSerif4_600SemiBold from "@expo-google-fonts/source-serif-4/600SemiBold/SourceSerif4_600SemiBold.ttf?url";
import type { RequiredFace } from "../src/theme/fonts.ts";

const FONT_URLS = {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  SourceSerif4_600SemiBold,
} satisfies Record<RequiredFace, string>;

/**
 * One `@font-face` per face, never one family with four weights.
 *
 * `src/theme/fonts.ts` explains why the tidier alternative is a trap:
 * `fontFamily` plus `fontWeight` does not select a weight in React Native, so a
 * face is chosen by **name** — `face.ui(600)` emits
 * `fontFamily: "Figtree_600SemiBold"` and no weight at all. Register these as
 * one family with several weights and every call resolves to nothing, silently.
 *
 * `font-display: block` because the default lets the browser paint a fallback
 * first and swap. On a review surface that is the worst available behaviour:
 * the first frame — the one a screenshot catches and an eye judges spacing on —
 * is the wrong typeface in the wrong metrics, and it corrects itself before
 * anyone can point at it.
 */
export const FONT_FACE_CSS = Object.entries(FONT_URLS)
  .map(
    ([family, url]) => `@font-face {
  font-family: "${family}";
  src: url("${url}") format("truetype");
  font-display: block;
}`,
  )
  .join("\n");
