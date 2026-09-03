import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  /**
   * `react-native` resolves to `react-native-web` under test.
   *
   * The components are one codebase for phone and browser (§4.3), and the web
   * half is plain React DOM — so it can be rendered and asserted on without a
   * native runtime. This is the same substitution Metro makes for the web
   * bundle, which is what keeps the test honest: it exercises the code the
   * browser actually runs, not a mock of it.
   *
   * The native half is not covered by this. A component with a `.native.tsx`
   * variant would need its own projection, and `architecture/10` already
   * records that as the accepted cost of platform files.
   */
  resolve: {
    alias: [
      // Reanimated's own jsdom mock: every `withTiming`/`withSpring` lands at
      // once and `useAnimatedStyle` is the style. Component tests assert what
      // a control *is*, never how it moved; the motion is looked at in
      // Storybook and on the device.
      {
        find: /^react-native-reanimated$/,
        replacement: fileURLToPath(new URL("packages/ui/.vitest/reanimated.ts", import.meta.url)),
      },
      // gesture-handler cannot load under jsdom (see the stub); its three
      // exports are stood in for.
      {
        find: /^react-native-gesture-handler$/,
        replacement: fileURLToPath(
          new URL("packages/ui/.vitest/gesture-handler.ts", import.meta.url),
        ),
      },
      { find: /^react-native$/, replacement: "react-native-web" },
    ],
    // Platform extensions, web first — the same order Metro uses for the web
    // bundle. Reanimated and gesture-handler ship `.web.js` halves, and without
    // this the native half loads under jsdom and trips on a Flow `typeof`.
    extensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".mts", ".js", ".mjs", ".json"],
  },
  /**
   * `__DEV__` is part of the React Native runtime contract, not of any module.
   *
   * Metro defines it globally, so nothing in `react-native-web` declares it and
   * every file is free to read it. Under Vitest nobody plays Metro's part, and
   * the first import that reaches it dies with `__DEV__ is not defined` — a
   * failure that reads like a broken module and is a missing global.
   *
   * `true` rather than `false`: development is what a test run is, and it is
   * the branch that keeps `react-native-web`'s own invariant warnings switched
   * on rather than compiled out.
   */
  define: { __DEV__: "true" },
  test: {
    server: {
      deps: {
        // Transformed by Vite rather than loaded by Node: the worklets
        // package imports its own files without extensions, which Node's ESM
        // loader refuses and Vite resolves.
        inline: [
          /react-native-worklets/,
          /react-native-reanimated/,
          /react-native-gesture-handler/,
        ],
      },
    },
    include: [
      "packages/*/src/**/*.test.ts",
      // `packages/ui` is components. Without this the design system's render
      // tests match nothing and the suite goes green having run none of them.
      "packages/*/src/**/*.test.tsx",
      "apps/*/src/**/*.test.ts",
      // Components are `.tsx`. Without this the render tests match nothing and
      // the suite goes green having run none of them.
      "apps/*/src/**/*.test.tsx",
      // Repo-wide contract tests that belong to no single package —
      // the environment contract, and anything else that spans the workspace.
      "tests/**/*.test.ts",
    ],
    globalSetup: ["packages/db/src/test/global-setup.ts"],
    setupFiles: ["tests/setup/match-media.ts", "tests/setup/dom-cleanup.ts"],
    /**
     * Pinned to a zone that observes DST, deliberately.
     *
     * `fill-forward.test.ts` guards a bug that only exists across a DST
     * transition: local-time date arithmetic with UTC formatting repeats a date
     * in spring and skips one in autumn. Under `TZ=UTC` that test passes no
     * matter what the code does — a green guard for a bug it cannot see. Under
     * a DST zone it fails when the bug returns.
     *
     * This is the ledger's own zone, which is also the right default: the
     * system stores bare `YYYY-MM-DD` accounting dates and must never let a
     * timezone move one.
     */
    env: { TZ: "Europe/Warsaw" },
    // Database tests share one Postgres server. Each gets its own database, so
    // they are isolated — but cloning a template requires no other connection
    // to it, so file-level parallelism is capped rather than unbounded.
    fileParallelism: true,
    maxWorkers: 4,
    // Migrating the template on a cold Postgres exceeds the 5s default.
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
