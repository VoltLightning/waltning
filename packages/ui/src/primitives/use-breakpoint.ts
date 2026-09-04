/**
 * `useBreakpoint` — `design-system/02` §2.10. The one place the app reads its
 * own width.
 *
 * **Over `useWindowDimensions`, not a platform read.** `react-native`'s own
 * hook is allowed in `packages/ui` — it names no platform, and resolves to
 * `react-native-web`'s DOM-backed implementation under the web bundle and to
 * the native bridge on a phone, the same substitution every other component
 * here relies on. What `architecture/11`'s "the app never reads the width
 * itself" rules out is a *second*, ad hoc read — `Dimensions.get` called from
 * a route, or a `window.innerWidth` in `apps/mobile` — which would make the
 * breakpoint two numbers the day either drifts from `tokens.ts`.
 *
 * **Two values, not a number.** A screen composing `"phone"` vs `"desk"`
 * reads a decision the design already made; a screen comparing a width against
 * `breakpoint.desk` itself is re-deriving that decision at every call site,
 * and a threshold with two owners is a threshold that disagrees with itself
 * the day one of them changes.
 */

import { useWindowDimensions } from "react-native";
import { breakpoint } from "../tokens.ts";

export type Breakpoint = "phone" | "desk";

export function useBreakpoint(): Breakpoint {
  const { width } = useWindowDimensions();
  return width >= breakpoint.desk ? "desk" : "phone";
}
