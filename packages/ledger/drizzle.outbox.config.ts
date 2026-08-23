import { defineConfig } from "drizzle-kit";

/** The outbox database's DDL. See `drizzle.replica.config.ts` for why there are two. */
export default defineConfig({
  schema: "./src/outbox.ts",
  out: "./drizzle/outbox",
  dialect: "sqlite",
});
