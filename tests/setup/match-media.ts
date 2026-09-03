/**
 * `window.matchMedia`, which jsdom does not implement.
 *
 * Reanimated's web half asks it for `prefers-reduced-motion` when it loads,
 * so without this every component that moves fails to import under test.
 * The answer is "no preference", which is the answer a browser gives by
 * default and the one `useReducedMotion` already falls back to.
 */

if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}
