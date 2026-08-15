import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs with cwd=packages/db, but .env lives at the repo root.
// process.loadEnvFile is built into Node 22+, so this needs no dotenv dep.
const rootEnv = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

// Migrations run as the bootstrap superuser, not the app role: `0005` creates
// a ROLE and issues GRANTs, which `waltning_app` has no privilege to do. This
// is the one place the superuser connection is correct — §13.1's separation
// only holds if everything else refuses it.
const url = process.env["MIGRATE_DATABASE_URL"];
if (!url) {
  throw new Error("MIGRATE_DATABASE_URL is not set — copy .env.example to .env and fill it in");
}

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
