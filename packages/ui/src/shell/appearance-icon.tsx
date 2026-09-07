/**
 * The appearance mark — a half-filled circle, light and dark meeting.
 *
 * **It replaced a full primary button in the header.** *Appearance* was a
 * `Button variant="primary"`: a sage pill as wide as the word, at the top
 * right of every screen, competing with the figures below it for the one thing
 * on the band allowed to be loud. The glyph says the same at 20pt, and
 * `IconButton` keeps the 44pt target underneath it.
 *
 * **Phosphor `duotone`, like the tab bar.** §2.8 gives `duotone` to
 * navigation; this is not navigation, but it sits in the same band as the tab
 * bar's glyphs and a second weight up there would read as a second kind of
 * thing. The spec's two weights are about brand emphasis versus chrome, and
 * this is chrome.
 *
 * **Its own component rather than the icon inline at the call site**, because
 * the call site is in `apps/mobile` and a glyph is `packages/ui`'s to name —
 * the app should not be choosing which of Phosphor's 1,500 shapes means
 * *appearance* here.
 */

import { useTheme } from "../theme/provider";
import { CircleHalfIcon } from "./phosphor";

/** Matches `TAB_ICON_SIZE` — the shell's glyphs are one size. */
const SIZE = 20;

export function AppearanceIcon() {
  // The band's own ink: this sits on `theme.shell`, never on the ground.
  const theme = useTheme();
  return <CircleHalfIcon size={SIZE} color={theme.shellText} />;
}
