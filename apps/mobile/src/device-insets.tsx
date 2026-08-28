/**
 * The one place this client reads the device's safe-area insets.
 *
 * `architecture/11` puts every platform read in `apps/<surface>`, and
 * `react-native-safe-area-context` is a platform read: a native module on the
 * phone, `env(safe-area-inset-*)` in the browser. `packages/ui` renders four
 * numbers and never imports it, which is what lets a story be an iPhone.
 *
 * **A component rather than a line in `platform.ts`**, because the value is a
 * hook: `useSafeAreaInsets()` has to run inside the library's own provider, so
 * something has to sit between the two. This is that something, and keeping it
 * to a bridge is what stops it becoming a place logic lives.
 *
 * One file for both targets. The library ships a web implementation, and
 * `expo-router` already depends on it, so it is in the web bundle either way —
 * a `.web.tsx` variant here would be a second implementation of a thing that
 * already works, and `platform.test.tsx` would then have to check both.
 */

import { SafeAreaProvider as InsetProvider } from "@waltning/ui/primitives/safe-area";
import {
  SafeAreaProvider as DeviceInsetProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

/**
 * Wraps the tree in the device's insets.
 *
 * Two providers, and both are load-bearing: the outer one is the library's,
 * which measures the window and is what `useSafeAreaInsets()` reads; the inner
 * one is ours, which carries the result as plain numbers into `packages/ui`.
 */
export function DeviceInsets({ children }: { children: React.ReactNode }) {
  return (
    <DeviceInsetProvider>
      <Bridge>{children}</Bridge>
    </DeviceInsetProvider>
  );
}

function Bridge({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();

  // `EdgeInsets` and `SafeAreaInsets` are the same four numbers, restated
  // rather than passed through: the library's type carries whatever else it
  // grows, and this is the boundary where that stops being our problem.
  return (
    <InsetProvider
      insets={{
        top: insets.top,
        right: insets.right,
        bottom: insets.bottom,
        left: insets.left,
      }}
    >
      {children}
    </InsetProvider>
  );
}
