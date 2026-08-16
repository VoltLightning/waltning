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
