/**
 * The device's safe-area insets, as a value.
 *
 * **The same shape as `ThemeProvider`, for the same reason.** A component that
 * reads the notch itself is a component that names a platform, and
 * `architecture/11` puts every platform read in `apps/<surface>`. So the app
 * reads the device once and hands the four numbers down; this package renders
 * numbers and never imports a safe-area library.
 *
 * That is also what makes it testable and previewable. `useSafeAreaInsets()`
 * from `react-native-safe-area-context` returns whatever the running device
 * reports, which on a laptop is always zero — so the layout that breaks on an
 * iPhone with a Dynamic Island is the one nothing can render. Insets as a prop
 * means a story can *be* that phone.
 *
 * **The default is zero, and that is a real value rather than a sentinel.** A
 * browser has no notch, and neither does a story or a test. What zero must not
 * become is a silent floor for a phone that does have one — which is what
 * `TodayFrame`'s hardcoded `34` was: a status-bar guess frozen into a layout
 * constant, right on nothing and close enough on some things.
 */

import { createContext, useContext, useMemo } from "react";

/**
 * All four edges, even though only `top` and `bottom` have a consumer today.
 *
 * A phone held in landscape puts the notch on a *side*, and the left/right
 * insets are how a row of figures avoids running under it. Shipping two of the
 * four would mean the day someone rotates the device is the day this shape
 * changes and every provider with it.
 */
export type SafeAreaInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

/** A surface with no device chrome: a browser, a story, a test. */
export const NO_INSETS: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

const SafeAreaContext = createContext<SafeAreaInsets>(NO_INSETS);

export type SafeAreaProviderProps = {
  insets: SafeAreaInsets;
  children: React.ReactNode;
};

export function SafeAreaProvider({ insets, children }: SafeAreaProviderProps) {
  // Destructured first, then memoised on the four numbers rather than on the
  // object. The platform hook that feeds this returns a fresh object every
  // render, so passing it straight through would hand every consumer a new
  // context value each time and re-run every layout below.
  const { top, right, bottom, left } = insets;
  const value = useMemo(() => ({ top, right, bottom, left }), [top, right, bottom, left]);

  return <SafeAreaContext.Provider value={value}>{children}</SafeAreaContext.Provider>;
}

/**
 * The active insets. Never `undefined` — the context default is a real value,
 * so no call site needs a null check and none can forget one.
 */
export function useSafeArea(): SafeAreaInsets {
  return useContext(SafeAreaContext);
}
