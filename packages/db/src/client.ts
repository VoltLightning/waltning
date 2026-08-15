import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

export type Database = ReturnType<typeof createDb>;

export function createDb(url: string = requireDatabaseUrl()) {
  const sql = postgres(url, {
    max: 10,
    // Keep numerics as strings — see money.ts. postgres.js would otherwise be
    // tempted to hand back a lossy JS number for some numeric shapes.
    types: {
      numeric: {
        to: 1700,
        from: [1700],
        serialize: (v: string | number) => String(v),
        parse: (v: string) => v,
      },
    },
  });
  return drizzle(sql, { schema });
}

/**
 * The **app** connection — `waltning_app`, deliberately not the superuser.
 *
 * A superuser bypasses every GRANT, so T1 (§13.1) is unenforceable the moment
 * this returns one: the tax export's REVOKEs stop meaning anything while every
 * query still succeeds, which is the failure shape that looks like health.
 * The export path takes `EXPORT_DATABASE_URL` and must pass it to `createDb`
 * explicitly — the default here is never the right connection for it.
 */
export function requireDatabaseUrl(): string {
  const url = process.env["APP_DATABASE_URL"];
  if (!url) {
    throw new Error("APP_DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  }
  return url;
}

export { schema };
