/**
 * Scratch databases for tests.
 *
 * The claim "all ten migrations apply cleanly to an empty database" was prose
 * until now. This makes it a test, and makes every later database test cheap
 * enough to write.
 *
 * **Template, not re-migrate.** Migrating from empty takes ~1s; a suite that
 * did it per file would pay that per file. Instead the template is migrated
 * once per run (`globalSetup`) and each scratch database is a `CREATE DATABASE
 * … TEMPLATE` clone, which Postgres does as a file copy in ~100ms.
 *
 * Roles are **cluster-wide**, so `0005`'s `waltning_export` is shared by every
 * scratch database and survives them. That is why `0005` guards its
 * `CREATE ROLE` with `IF NOT EXISTS` — and why dropping roles is never part of
 * teardown: a parallel test would lose its role mid-run.
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "../schema.ts";

const rootEnv = fileURLToPath(new URL("../../../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

/** The migrations folder, resolved from this file so cwd never matters. */
export const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

export const TEMPLATE_DB = "waltning_test_template";

/**
 * The superuser connection. Migrations create roles and issue grants, which
 * `waltning_app` cannot do — this is the one context where the superuser is
 * correct (§13.1).
 */
export function migrateUrl(): string {
  const url = process.env["MIGRATE_DATABASE_URL"];
  if (!url) {
    throw new Error(
      "MIGRATE_DATABASE_URL is not set. Copy .env.example to .env and fill it in — " +
        "database tests run against a real Postgres (pnpm db:up), never a mock.",
    );
  }
  return url;
}

/** Same server, different database. */
function urlFor(database: string): string {
  const u = new URL(migrateUrl());
  u.pathname = `/${database}`;
  return u.toString();
}

/**
 * Admin connection to the *maintenance* database. `CREATE DATABASE` cannot run
 * inside a transaction or while connected to the database being copied, so
 * this deliberately connects elsewhere and keeps a single connection.
 */
function admin() {
  return postgres(urlFor("postgres"), { max: 1, onnotice: quiet });
}

/**
 * Postgres NOTICEs here are expected, not informative: `DROP … IF EXISTS` on a
 * first run, and the defensively idempotent `ADD COLUMN IF NOT EXISTS` in
 * `0009`. Printing them on every run teaches people to ignore test output,
 * which is the one habit a test suite must not create.
 */
const quiet = () => {};

/** Postgres refuses `CREATE DATABASE … TEMPLATE` while anyone is connected. */
async function disconnectAll(sql: postgres.Sql, database: string): Promise<void> {
  await sql`
    SELECT pg_terminate_backend(pid) FROM pg_stat_activity
    WHERE datname = ${database} AND pid <> pg_backend_pid()`;
}

/**
 * Build the template once per run: an empty database with all migrations
 * applied. Called from `globalSetup`, so a failure here fails the run rather
 * than one test.
 */
export async function createTemplate(): Promise<void> {
  const sql = admin();
  try {
    await disconnectAll(sql, TEMPLATE_DB);
    await sql.unsafe(`DROP DATABASE IF EXISTS "${TEMPLATE_DB}"`);
    await sql.unsafe(`CREATE DATABASE "${TEMPLATE_DB}"`);
  } finally {
    await sql.end();
  }

  const client = postgres(urlFor(TEMPLATE_DB), { max: 1, onnotice: quiet });
  try {
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.end();
  }
}

export async function dropTemplate(): Promise<void> {
  const sql = admin();
  try {
    await disconnectAll(sql, TEMPLATE_DB);
    await sql.unsafe(`DROP DATABASE IF EXISTS "${TEMPLATE_DB}"`);
  } finally {
    await sql.end();
  }
}

export type Scratch = {
  db: ReturnType<typeof drizzle<typeof schema>>;
  /** Raw handle, for the SQL a query builder should not express. */
  sql: postgres.Sql;
  name: string;
  drop: () => Promise<void>;
};

let counter = 0;

/**
 * A fresh migrated database, cloned from the template.
 *
 * ```ts
 * const s = await scratchDatabase();
 * afterAll(() => s.drop());
 * ```
 */
export async function scratchDatabase(label = "t"): Promise<Scratch> {
  // Unique without Math.random: pid plus an in-process counter is unique
  // across parallel workers and readable when one is left behind.
  const name = `waltning_test_${label}_${process.pid}_${++counter}`.toLowerCase();

  const sqlAdmin = admin();
  try {
    await disconnectAll(sqlAdmin, TEMPLATE_DB);
    await sqlAdmin.unsafe(`CREATE DATABASE "${name}" TEMPLATE "${TEMPLATE_DB}"`);
  } finally {
    await sqlAdmin.end();
  }

  const sql = postgres(urlFor(name), { max: 2, onnotice: quiet });
  return {
    db: drizzle(sql, { schema }),
    sql,
    name,
    drop: async () => {
      await sql.end();
      const a = admin();
      try {
        await disconnectAll(a, name);
        await a.unsafe(`DROP DATABASE IF EXISTS "${name}"`);
      } finally {
        await a.end();
      }
    },
  };
}
