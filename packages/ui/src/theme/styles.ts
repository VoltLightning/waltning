/**
 * `makeStyles` — a stylesheet that depends on the theme, built once per theme.
 *
 * **The problem it solves.** Every component in this package built its styles
 * with `StyleSheet.create` at module scope, which resolves colours at import
 * time. That is what made the theme a build-time constant, and moving the
 * colours inline instead would split each component's styling across two
 * places — layout in a stylesheet, colour in a JSX attribute — which is how a
 * hardcoded colour eventually gets added back without anyone noticing.
 *
 * So the whole stylesheet becomes a function of the theme, and this turns that
 * function into a hook.
 *
 * **Built once per theme, not once per render.** The cache is keyed on the
 * theme object's identity, and themes are module constants, so each theme's
 * stylesheet is created exactly once for the lifetime of the process. That
 * matters more than it looks: on native, `StyleSheet.create` registers styles
 * and returns handles, and re-registering them every render of every row in a
 * long list is exactly the workload a ledger app spends its time on.
 *
 * A `WeakMap` rather than a `Map` so a theme that stops being reachable — a
 * computed one, a test fixture — does not pin its stylesheet forever.
 */

import type { ImageStyle, TextStyle, ViewStyle } from "react-native";
import { StyleSheet } from "react-native";
import { useTheme } from "./provider";
import type { Theme } from "./roles.ts";

/**
 * What `StyleSheet.create` accepts. Spelled out rather than imported: React
 * Native's own `NamedStyles` is not part of its public type surface, and
 * reaching into it has broken across two minor versions.
 */
export type Styles = Record<string, ViewStyle | TextStyle | ImageStyle>;

/**
 * Turn a theme-dependent stylesheet into a hook.
 *
 * ```ts
 * const useStyles = makeStyles((theme) => ({
 *   card: { backgroundColor: theme.surface },
 *   title: { color: theme.text },
 * }));
 *
 * function Card() {
 *   const styles = useStyles();
 *   …
 * }
 * ```
 *
 * `T` is inferred from `build`, so the returned hook is typed with the exact
 * style names the component declared — a typo in `styles.titel` is a compile
 * error rather than an ignored `undefined` that renders as an unstyled element.
 */
export function makeStyles<T extends Styles>(build: (theme: Theme) => T): () => T {
  const cache = new WeakMap<Theme, T>();

  return function useStyles(): T {
    const theme = useTheme();

    const cached = cache.get(theme);
    if (cached) return cached;

    const created = StyleSheet.create(build(theme));
    cache.set(theme, created);
    return created;
  };
}
