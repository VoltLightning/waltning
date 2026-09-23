/**
 * The icons a *primitive* draws — a field's magnifier, a control's ×.
 *
 * **Here rather than in `shell/phosphor.tsx` because of which way the
 * foundation points.** A domain may import the foundation and never the
 * reverse (`tests/architecture.test.ts`), and `SearchField` is foundation: it
 * drew its magnifier out of two views for as long as the only icon file lived
 * in a domain, and at 16pt that is a ring with a stick near it. Vendored
 * Phosphor paths, like the rest — never the npm package, which doubled the
 * bundle.
 */

import { Path, Svg } from "react-native-svg";

const VIEW_BOX = "0 0 256 256";

export type PrimitiveIconProps = {
  size: number;
  color: string;
};

export function XIcon({ size, color }: PrimitiveIconProps) {
  return (
    <Svg width={size} height={size} viewBox={VIEW_BOX}>
      <Path
        d="M205.66 194.34a8 8 0 0 1-11.32 11.32L128 139.31l-66.34 66.35a8 8 0 0 1-11.32-11.32L116.69 128 50.34 61.66a8 8 0 0 1 11.32-11.32L128 116.69l66.34-66.35a8 8 0 0 1 11.32 11.32L139.31 128Z"
        fill={color}
      />
    </Svg>
  );
}

/** A stepper's own two marks — Phosphor `minus` and `plus`, vendored like the rest. */
export function MinusIcon({ size, color }: PrimitiveIconProps) {
  return (
    <Svg width={size} height={size} viewBox={VIEW_BOX}>
      <Path d="M224 128a8 8 0 0 1-8 8H40a8 8 0 0 1 0-16h176a8 8 0 0 1 8 8" fill={color} />
    </Svg>
  );
}

export function PlusIcon({ size, color }: PrimitiveIconProps) {
  return (
    <Svg width={size} height={size} viewBox={VIEW_BOX}>
      <Path
        d="M224 128a8 8 0 0 1-8 8h-80v80a8 8 0 0 1-16 0v-80H40a8 8 0 0 1 0-16h80V40a8 8 0 0 1 16 0v80h80a8 8 0 0 1 8 8"
        fill={color}
      />
    </Svg>
  );
}

export function MagnifyingGlassIcon({ size, color }: PrimitiveIconProps) {
  return (
    <Svg width={size} height={size} viewBox={VIEW_BOX}>
      <Path
        d="M229.66 218.34l-50.06-50.06a88.21 88.21 0 1 0-11.32 11.32l50.06 50.06a8 8 0 0 0 11.32-11.32M40 112a72 72 0 1 1 72 72 72.08 72.08 0 0 1-72-72"
        fill={color}
      />
    </Svg>
  );
}
