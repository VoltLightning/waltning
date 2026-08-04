import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs with cwd=packages/db, but .env lives at the repo root.
// process.loadEnvFile is built into Node 22+, so this needs no dotenv dep.
const rootEnv = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const url = process.env["DATABASE_URL"];
if (!url) throw new Error("DATABASE_URL is not set — copy .env.example to .env");

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
