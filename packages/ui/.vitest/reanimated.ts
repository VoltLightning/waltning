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
// The mock's own `interpolate` is a no-op (`() => {}`) — fine for animated
// styles nobody asserts numeric values on, but `ThinkingIndicator`'s dots
// compute their rest-state style (reduced motion) without calling it at all,
// and no other test reads an interpolated number, so the no-op never shows.
export const interpolate = m.interpolate;
