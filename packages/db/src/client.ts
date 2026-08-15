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

export function requireDatabaseUrl(): string {
  const url = process.env["DATABASE_URL"];
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  }
  return url;
}

export { schema };
