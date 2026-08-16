/**
 * Development database lifecycle: recreate, and grant.
 *
 * Nothing here is permanent yet, and setup should cost one command —
 * `pnpm db:reset` runs recreate → migrate → grant → seed. It exists so that
 * "drop it and rebuild" is never a reason to hesitate before changing the
 * schema, which is the point of the phase we are in.
 *
 * Two phases, because they straddle the migration:
 *
 *   recreate      drop and create the database          (before migrate)
 *   --grant-only  give waltning_app a password to use   (after migrate,
 *                                                        which creates it)
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const rootEnv = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const url = process.env["MIGRATE_DATABASE_URL"];
if (!url) throw new Error("MIGRATE_DATABASE_URL is not set — copy .env.example to .env");

const target = new URL(url);
const dbName = decodeURIComponent(target.pathname.replace(/^\//, ""));
const grantOnly = process.argv.includes("--grant-only");
const force = process.argv.includes("--force");
const quiet = { max: 1, onnotice: () => {} } as const;

/**
 * Credentials for the app role, local only.
 *
 * The migration creates `waltning_app` NOLOGIN and without a password, because
 * that file is public. Development still has to connect as it — reaching for
 * the superuser instead is the exact shortcut that makes T1 unenforceable — so
 * the password is applied here, from the gitignored `.env`.
 */
async function grant(): Promise<void> {
  const appUrl = process.env["APP_DATABASE_URL"];
  if (!appUrl) {
    console.log("APP_DATABASE_URL is not set — skipping the app-role grant");
    return;
  }
  const app = new URL(appUrl);
  const role = decodeURIComponent(app.username);
  const password = decodeURIComponent(app.password);
  if (!role || !password) {
    console.log("APP_DATABASE_URL has no user:password — skipping the app-role grant");
    return;
  }

  const db = postgres(url as string, quiet);
  try {
    const [found] = await db<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_roles WHERE rolname = ${role}`;
    if (!found?.n) throw new Error(`role "${role}" does not exist — run the migrations first`);
    await db.unsafe(
      `ALTER ROLE "${role.replace(/"/g, '""')}" LOGIN PASSWORD '${password.replace(/'/g, "''")}'`,
    );
    console.log(`granted LOGIN to ${role}`);
  } finally {
    await db.end();
  }
}

async function recreate(): Promise<void> {
  const local = ["127.0.0.1", "localhost", "::1", "postgres"].includes(target.hostname);
  if (!local && !force) {
    throw new Error(
      `refusing to drop "${dbName}" on ${target.hostname} — pass --force if you mean it`,
    );
  }

  const admin = postgres(new URL("/postgres", target).toString(), quiet);
  try {
    console.log(`dropping and recreating ${dbName} on ${target.hostname}`);
    await admin`
      SELECT pg_terminate_backend(pid) FROM pg_stat_activity
      WHERE datname = ${dbName} AND pid <> pg_backend_pid()`;
    await admin.unsafe(`DROP DATABASE IF EXISTS "${dbName.replace(/"/g, '""')}"`);
    await admin.unsafe(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
  } finally {
    await admin.end();
  }
}

await (grantOnly ? grant() : recreate());
