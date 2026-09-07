/**
 * Nothing, on iOS and Android.
 *
 * `NetWorthStrip` says where it goes through `accessibilityHint`, which those
 * two announce. `react-native-svg`'s sibling problem: `react-native-web` drops
 * the hint entirely — no `aria-describedby`, no `aria-description` — so the web
 * needs the destination in the tree instead, and only the web does. Rendering
 * it everywhere had VoiceOver read it twice.
 *
 * The web half is `screen-reader-destination.web.tsx`. This is the platform
 * seam `architecture/10` describes, at its smallest: one fact that is true on
 * one target.
 */

export function ScreenReaderDestination() {
  return null;
}
