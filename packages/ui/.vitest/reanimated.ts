/**
 * Reanimated's own jsdom mock, given the module shape our imports expect.
 *
 * `react-native-reanimated/lib/module/mock` is written as `module.exports =
 * { …everything, default: Animated }`, and Vite's CommonJS interop hands a
 * default import the *whole* object — so `Animated.View` came back
 * `undefined` and every component that moves failed to mount. This file
 * unpacks it once: the default export is the animated component map, the
 * named exports are the hooks and animations this package uses. Every
 * `withTiming` and `withSpring` lands immediately; component tests assert
 * what a control *is*, never how it moved — motion is looked at in Storybook
 * and on the device.
 */

import { useRef } from "react";

import type * as Reanimated from "react-native-reanimated";
import mock from "react-native-reanimated/lib/module/mock";

// The one cast: a CommonJS bag with no declared type, narrowed to the
// module it stands in for.
const m = mock as unknown as typeof Reanimated & { default: (typeof Reanimated)["default"] };

export default m.default;
export const useSharedValue = m.useSharedValue;
export const useAnimatedStyle = m.useAnimatedStyle;
export const withTiming = m.withTiming;
export const withSpring = m.withSpring;
export const withRepeat = m.withRepeat;
export const withDelay = m.withDelay;
export const withSequence = m.withSequence;
export const runOnJS = m.runOnJS;
export const Easing = m.Easing;
export const Extrapolation = m.Extrapolation;
// The mock's own `interpolate` is a no-op (`() => {}`) — fine as long as no
// test reads a number out of it. A component whose shape depends on
// `interpolate`'s real arithmetic — not just its end-state style — needs
// that arithmetic pulled into a plain `.ts` function and exercised directly,
// where `vitest` runs it for real rather than through this mock.
export const interpolate = m.interpolate;
export const useAnimatedReaction = m.useAnimatedReaction;
export const useAnimatedScrollHandler = m.useAnimatedScrollHandler;
/**
 * **The mock omits `interpolateColor` entirely**, and `useAnimatedStyle` calls
 * its worklet immediately — so a component that tints with it crashed every
 * test that rendered the shell, not just its own. The end colour is what a
 * component test can assert, so this returns the middle stop: the value at
 * rest, which is what every story and every screenshot is taken at.
 */
export const interpolateColor = (
  value: number,
  input: readonly number[],
  output: readonly (string | number)[],
): string | number => {
  const at = input.findIndex((stop) => stop >= value);
  return output[at === -1 ? output.length - 1 : at] ?? output[0] ?? "";
};

/**
 * **Three the upstream mock does not carry, and none of them can be faked
 * into doing anything.**
 *
 * `useFrameCallback` is a UI-thread loop, `scrollTo` is a direct write to a
 * native scroller, and `useAnimatedRef` is the handle that joins them. jsdom
 * has no frames to run on and no scroller to write to, so a stub that *did*
 * something would be inventing behaviour this environment cannot have — the
 * same reason `interpolate` above is a no-op rather than a reimplementation.
 *
 * What this costs is that `DayRibbon`'s scrubbing is invisible to the
 * component suite: the arithmetic is tested directly in `scrub.ts`'s own
 * tests, the placement is a story the visual suite screenshots in a real
 * browser, and the wiring is `tools/e2e`, which drives the built app where
 * both are real. That division is deliberate, and it is written down here
 * because a test that renders this component and sees a still strip is seeing
 * the mock, not the component.
 */
export const useAnimatedRef = <T>() => useRef<T | null>(null);
/**
 * **A page at rest, which is the only offset jsdom can honestly report.**
 * There is no scroller here to read, and the one thing this drives —
 * `GroundPanel`'s top edge — is a function of the offset rather than of the
 * hook, so the arithmetic is asserted directly (`card.test.tsx`'s own
 * `edgeOpacity`) and the wiring is looked at on a device.
 */
export const useScrollViewOffset = () => m.useSharedValue(0);
export const scrollTo = () => {};
export const useFrameCallback = (): {
  setActive: (active: boolean) => void;
  isActive: boolean;
} => ({
  setActive: () => {},
  isActive: false,
});
