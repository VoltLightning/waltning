import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/*/src/**/*.test.ts",
      "apps/*/src/**/*.test.ts",
      // Repo-wide contract tests that belong to no single package —
      // the environment contract, and anything else that spans the workspace.
      "tests/**/*.test.ts",
    ],
    globalSetup: ["packages/db/src/test/global-setup.ts"],
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
