/**
 * `<ThemeProvider>` and `useTheme()` — the theme as a value, not a module
 * constant.
 *
 * Resolving colours at import time fixes the theme at build time. Everything
 * else in this package already takes its dependencies as parameters —
 * `architecture/11`'s rule that `useAccounts(api)` is testable and
 * `useAccounts()` is not — and a colour is a dependency like any other.
 *
 * **The default is `light` and that is a deliberate choice, not a fallback.**
 * A component rendered with no provider — in a test, in a diff preview, in a
 * Storybook-shaped harness that nobody wired up — still renders correctly
 * rather than throwing. Throwing would be defensible if a missing provider were
 * a bug worth catching, but the population of call sites that legitimately have
 * no provider is large and growing, and every one of them would need a wrapper
 * that exists only to satisfy the check.
 */

import { createContext, useContext, useMemo } from "react";
import { light, type Theme, type ThemeName, themes } from "./roles.ts";

const ThemeContext = createContext<Theme>(light);

export type ThemeProviderProps = {
  /** Which shipped theme to render. Ignored when `theme` is given. */
  name?: ThemeName;
  /**
   * A theme object, for a caller that has one that is not in `themes` — a test,
   * or a computed theme.
   *
   * **An earlier version of this file took `name` alone**, on the stated
   * grounds that an object prop would let a caller supply a partial theme. That
   * reasoning does not hold: `Theme` is a closed record, so a partial object
   * fails to compile exactly as a missing entry in `themes` would. What it did
   * do was make *swapping* untestable — with one shipped theme there was
   * nothing to swap to — which is to say the safety it bought was imaginary and
   * the coverage it cost was not.
   */
  theme?: Theme;
  children: React.ReactNode;
};

export function ThemeProvider({ name = "light", theme, children }: ThemeProviderProps) {
  // Memoised so a parent re-render does not hand every consumer a new context
  // value and re-run every `makeStyles` cache lookup below it.
  const value = useMemo(() => theme ?? themes[name], [theme, name]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * The active theme.
 *
 * Returns a `Theme`, never `undefined` — the context's default is a real theme
 * rather than a sentinel, so no call site needs a null check and none can
 * forget one.
 */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}
