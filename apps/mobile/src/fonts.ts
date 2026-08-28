/**
 * The font files, and the only place in the repo that names one.
 *
 * Platform wiring, which is why it is in `apps/` — `architecture/11`'s seam is
 * *does this file name a platform*, and a `require()` of a `.ttf` resolved by
 * Metro is about as platform-bound as a line gets. The design system decides
 * **which faces exist** (`packages/ui/.../theme/fonts.ts`); this decides **where
 * their bytes come from**.
 *
 * **Bundled, never fetched.** The faces ship inside `@expo-google-fonts/*`
 * packages rather than being pulled from a webfont CDN on load. A CDN would be
 * a request to a third party on every cold start: it breaks the appliance the
 * moment the Pi has no route out, and it tells whoever hosts it when the owner
 * opened their finance app. The same argument `ServiceIcon` already settled for
 * brand logos, and the same answer.
 */

import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold,
} from "@expo-google-fonts/ibm-plex-sans";
import type { RequiredFace } from "@waltning/ui/theme/fonts";

/**
 * The map `expo-font` loads. **Its keys become the family names** on native and
 * on web alike, which is why they must match the design system's `FACES`
 * exactly rather than merely resemble it.
 *
 * **`satisfies` is doing the entire check.** A face the design system requires
 * and this map forgets fails to compile; so does one supplied here that nothing
 * requires. There is no second list and no runtime comparison — which also
 * means there is no moment at which the app is running and wrong.
 */
export const FONT_ASSETS = {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold,
} satisfies Record<RequiredFace, unknown>;
