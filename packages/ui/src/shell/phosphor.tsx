/**
 * The six Phosphor duotone glyphs this app draws, as path data.
 *
 * **Vendored rather than depended on, and the reason is a number.** §2.8 names
 * Phosphor, and `phosphor-react-native` is the obvious way to get it — but its
 * entry re-exports all 1,512 icons (about 24 MB of published source across
 * `src` and `lib`), Metro does not tree-shake across that, and adding it took
 * the iOS bundle from **6.3 MB to 13 MB** — the measurement that decided this. Its per-icon subpath (`phosphor-react-native/src/icons/House`)
 * publishes raw `.tsx`, which does not survive this repository's
 * `exactOptionalPropertyTypes` and does not run under the test resolver.
 *
 * So the renderer stays a dependency (`react-native-svg`, Expo 57's pinned
 * 15.15.4, bundled in Expo Go — no EAS cutover) and the *shapes* live here.
 * Same geometry, from Phosphor 2.x's own `duotone` definitions, in a little
 * over five kilobytes of this file. Phosphor Icons is MIT-licensed, © 2023 Phosphor Icons —
 * https://phosphoricons.com.
 *
 * **Adding a glyph is a copy, not an install.** Take the `duotone` entry from
 * `@phosphor-icons/core`'s SVG for the icon, keeping the order: the tone path
 * (the one carrying `opacity`) first, the outline second. The 256×256 viewBox
 * is Phosphor's own and is what makes these interchangeable with the rest of
 * the set.
 */

import { Path, Svg } from "react-native-svg";

/** Phosphor's own canvas. Every path here is drawn in it. */
const VIEW_BOX = "0 0 256 256";

/**
 * The tone layer's opacity — Phosphor's own duotone default. Named because it
 * is the whole difference between duotone and a flat glyph, and because a
 * value inlined five times is a value that drifts.
 */
const TONE_OPACITY = 0.2;

export type PhosphorIconProps = {
  /** The box the glyph is drawn in. `TAB_ICON_SIZE` for the bar; 20 elsewhere. */
  size: number;
  /** Both layers take it; the tone layer at `TONE_OPACITY`. */
  color: string;
};

export function HouseIcon({ size, color }: PhosphorIconProps) {
  return (
    <Svg width={size} height={size} viewBox={VIEW_BOX}>
      <Path
        d="M216 120v96h-64v-64h-48v64H40v-96a8 8 0 0 1 2.34-5.66l80-80a8 8 0 0 1 11.32 0l80 80A8 8 0 0 1 216 120"
        fill={color}
        opacity={TONE_OPACITY}
      />
      <Path
        d="m219.31 108.68-80-80a16 16 0 0 0-22.62 0l-80 80A15.87 15.87 0 0 0 32 120v96a8 8 0 0 0 8 8h64a8 8 0 0 0 8-8v-56h32v56a8 8 0 0 0 8 8h64a8 8 0 0 0 8-8v-96a15.87 15.87 0 0 0-4.69-11.32M208 208h-48v-56a8 8 0 0 0-8-8h-48a8 8 0 0 0-8 8v56H48v-88l80-80 80 80Z"
        fill={color}
      />
    </Svg>
  );
}

export function ListBulletsIcon({ size, color }: PhosphorIconProps) {
  return (
    <Svg width={size} height={size} viewBox={VIEW_BOX}>
      <Path d="M216 64v128H88V64Z" fill={color} opacity={TONE_OPACITY} />
      <Path
        d="M80 64a8 8 0 0 1 8-8h128a8 8 0 0 1 0 16H88a8 8 0 0 1-8-8m136 56H88a8 8 0 1 0 0 16h128a8 8 0 0 0 0-16m0 64H88a8 8 0 1 0 0 16h128a8 8 0 0 0 0-16M44 52a12 12 0 1 0 12 12 12 12 0 0 0-12-12m0 64a12 12 0 1 0 12 12 12 12 0 0 0-12-12m0 64a12 12 0 1 0 12 12 12 12 0 0 0-12-12"
        fill={color}
      />
    </Svg>
  );
}

export function ArrowsLeftRightIcon({ size, color }: PhosphorIconProps) {
  return (
    <Svg width={size} height={size} viewBox={VIEW_BOX}>
      <Path d="M208 80v96H48V80Z" fill={color} opacity={TONE_OPACITY} />
      <Path
        d="m213.66 181.66-32 32a8 8 0 0 1-11.32-11.32L188.69 184H48a8 8 0 0 1 0-16h140.69l-18.35-18.34a8 8 0 0 1 11.32-11.32l32 32a8 8 0 0 1 0 11.32m-139.32-64a8 8 0 0 0 11.32-11.32L67.31 88H208a8 8 0 0 0 0-16H67.31l18.35-18.34a8 8 0 0 0-11.32-11.32l-32 32a8 8 0 0 0 0 11.32Z"
        fill={color}
      />
    </Svg>
  );
}

export function SlidersHorizontalIcon({ size, color }: PhosphorIconProps) {
  return (
    <Svg width={size} height={size} viewBox={VIEW_BOX}>
      <Path
        d="M128 80a24 24 0 1 1-24-24 24 24 0 0 1 24 24m40 72a24 24 0 1 0 24 24 24 24 0 0 0-24-24"
        fill={color}
        opacity={TONE_OPACITY}
      />
      <Path
        d="M40 88h33a32 32 0 0 0 62 0h81a8 8 0 0 0 0-16h-81a32 32 0 0 0-62 0H40a8 8 0 0 0 0 16m64-24a16 16 0 1 1-16 16 16 16 0 0 1 16-16m112 104h-17a32 32 0 0 0-62 0H40a8 8 0 0 0 0 16h97a32 32 0 0 0 62 0h17a8 8 0 0 0 0-16m-48 24a16 16 0 1 1 16-16 16 16 0 0 1-16 16"
        fill={color}
      />
    </Svg>
  );
}

export function CalendarBlankIcon({ size, color }: PhosphorIconProps) {
  return (
    <Svg width={size} height={size} viewBox={VIEW_BOX}>
      <Path
        d="M216 48v40H40V48a8 8 0 0 1 8-8h160a8 8 0 0 1 8 8"
        fill={color}
        opacity={TONE_OPACITY}
      />
      <Path
        d="M208 32h-24v-8a8 8 0 0 0-16 0v8H88v-8a8 8 0 0 0-16 0v8H48a16 16 0 0 0-16 16v160a16 16 0 0 0 16 16h160a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16M72 48v8a8 8 0 0 0 16 0v-8h80v8a8 8 0 0 0 16 0v-8h24v32H48V48Zm136 160H48V96h160z"
        fill={color}
      />
    </Svg>
  );
}

export function CircleHalfIcon({ size, color }: PhosphorIconProps) {
  return (
    <Svg width={size} height={size} viewBox={VIEW_BOX}>
      <Path
        d="M224 128a96 96 0 0 1-96 96V32a96 96 0 0 1 96 96"
        fill={color}
        opacity={TONE_OPACITY}
      />
      <Path
        d="M128 24a104 104 0 1 0 104 104A104.11 104.11 0 0 0 128 24M40 128a88.11 88.11 0 0 1 80-87.63v175.26A88.11 88.11 0 0 1 40 128m96 87.63V40.37a88 88 0 0 1 0 175.26"
        fill={color}
      />
    </Svg>
  );
}

/**
 * Four regular-weight glyphs for `PagerHeader`, not duotone.
 *
 * §2.8 gives duotone to *navigation* — the tab bar is the navigation, and a
 * chevron that steps a month is a control. A duotone caret at 18px is a
 * smudge: the tone layer has nowhere to sit inside a stroke that thin.
 */
export function CaretLeftIcon({ size, color }: PhosphorIconProps) {
  return (
    <Svg width={size} height={size} viewBox={VIEW_BOX}>
      <Path
        d="M165.66 202.34a8 8 0 0 1-11.32 11.32l-80-80a8 8 0 0 1 0-11.32l80-80a8 8 0 0 1 11.32 11.32L91.31 128Z"
        fill={color}
      />
    </Svg>
  );
}

/** The affordance on a title that opens a picker — never a step. */
export function CaretDownIcon({ size, color }: PhosphorIconProps) {
  return (
    <Svg width={size} height={size} viewBox={VIEW_BOX}>
      <Path
        d="M213.66 101.66l-80 80a8 8 0 0 1-11.32 0l-80-80a8 8 0 0 1 11.32-11.32L128 164.69l74.34-74.35a8 8 0 0 1 11.32 11.32Z"
        fill={color}
      />
    </Svg>
  );
}

export function CaretRightIcon({ size, color }: PhosphorIconProps) {
  return (
    <Svg width={size} height={size} viewBox={VIEW_BOX}>
      <Path
        d="M181.66 133.66l-80 80a8 8 0 0 1-11.32-11.32L164.69 128 90.34 53.66a8 8 0 0 1 11.32-11.32l80 80a8 8 0 0 1 0 11.32"
        fill={color}
      />
    </Svg>
  );
}

export function MagnifyingGlassIcon({ size, color }: PhosphorIconProps) {
  return (
    <Svg width={size} height={size} viewBox={VIEW_BOX}>
      <Path
        d="M229.66 218.34l-50.06-50.06a88.21 88.21 0 1 0-11.32 11.32l50.06 50.06a8 8 0 0 0 11.32-11.32M40 112a72 72 0 1 1 72 72 72.08 72.08 0 0 1-72-72"
        fill={color}
      />
    </Svg>
  );
}
