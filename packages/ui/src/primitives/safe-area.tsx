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

/**
 * The **window's** insets, which no layer may shadow.
 *
 * `SafeAreaContext` above answers *"what chrome does the box I am in have to
 * clear?"*, and layers re-provide it precisely because that answer differs
 * from the device's: the tab shell hands its slot a zero bottom because the
 * tab bar below already cleared the home indicator, and the floating button's
 * layer hands itself the bar's height so the circle parks on the bar rather
 * than on the device.
 *
 * Both are right, and both are wrong for an overlay. A `Modal` is not in the
 * box it was opened from — it *is* the window — but its children are the same
 * React tree, so a sheet opened from the Ledger tab inherited the tab slot's
 * zeroed bottom and stopped clearing the home indicator, and the floating
 * button's own type picker inherited the tab bar's height and cleared 112px
 * of nothing. The layer a `Modal` was opened from is irrelevant to it.
 *
 * So the device's four numbers are published a second time, once, at the app
 * root, in a context nothing re-provides. Two facts that were sharing one
 * channel now have one each.
 */
const WindowInsetsContext = createContext<SafeAreaInsets | null>(null);

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

export type WindowInsetsProviderProps = {
  insets: SafeAreaInsets;
  children: React.ReactNode;
};

/**
 * Publishes the device's own insets for the overlays. Rendered once, by the
 * app, beside `SafeAreaProvider` and from the same measurement.
 */
export function WindowInsetsProvider({ insets, children }: WindowInsetsProviderProps) {
  const { top, right, bottom, left } = insets;
  const value = useMemo(() => ({ top, right, bottom, left }), [top, right, bottom, left]);

  return <WindowInsetsContext.Provider value={value}>{children}</WindowInsetsContext.Provider>;
}

/**
 * The window's insets, for a component that draws over the whole window.
 *
 * **Falls back to the nearest layer where nothing has published a window.** A
 * story, a test and a bare browser render have no app root to do it, and
 * there the enclosing `SafeAreaProvider` *is* the best description of the
 * device available — a story that says it is an iPhone should still draw a
 * sheet that clears a home indicator. Inside the app the window is always
 * published, so the fallback never decides anything real.
 */
export function useWindowInsets(): SafeAreaInsets {
  const window = useContext(WindowInsetsContext);
  const layer = useContext(SafeAreaContext);
  return window ?? layer;
}
