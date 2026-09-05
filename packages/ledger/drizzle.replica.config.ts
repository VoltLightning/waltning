import { defineConfig } from "drizzle-kit";

/**
 * The replica database's DDL, generated rather than emitted at run time.
 *
 * **Two configs, because there are two SQLite files.** Each has its own
 * `user_version`, its own chain and its own table list — the replica
 * migrates in place, one version per generated file
 * (`architecture/08`, `tools/embed-ddl.ts`), and the outbox is *"never
 * drop"*. Neither is ever dropped by this package; a refetch from a backend
 * is sync's own operation (arc 2), triggered by sync, never by a schema
 * version. See `drizzle.outbox.config.ts` for the other half.
 *
 * **No `dbCredentials`, and that is not an omission.** `generate` diffs the
 * schema against the snapshot in `drizzle/replica/meta` and never opens a
 * database; the database this describes lives on a phone, so there is no URL
 * that could be correct here. `packages/db`'s config needs one because it also
 * runs `migrate` and `studio` against a real Postgres.
 *
 * `--name` is passed by the `generate` script rather than left to drizzle-kit's
 * random tag, so the filenames read like `packages/db`'s: `0000_schema.sql`
 * beside the hand-written `0001_database_objects.sql`.
 */
export default defineConfig({
  schema: ["../schema/src/*.sqlite.ts", "./src/local-meta.ts"],
  out: "./drizzle/replica",
  dialect: "sqlite",
});
