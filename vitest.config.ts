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
  resolve: { alias: { "react-native": "react-native-web" } },
  test: {
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
    setupFiles: ["tests/setup/dom-cleanup.ts"],
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
