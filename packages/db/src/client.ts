import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

export type Database = ReturnType<typeof createDb>;

/** The handle inside `db.transaction(...)`. Not a `Database` — it has no pool. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Anything queries can run on: the pool, or a transaction on it.
 *
 * Services take this rather than `Database`, so the same function works
 * standalone and inside a transaction. Typing them as `Database` forced a cast
 * at every transaction boundary — and a cast at a boundary is how a handle
 * that is *not* in the transaction gets passed to a handler whose effects are
 * then supposed to be atomic with it.
 */
export type DbHandle = Database | Transaction;

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

/**
 * A real round trip, for `/readyz`.
 *
 * Lives here because the driver does: an app asking "is the database up" must
 * not have to import `postgres` to ask it. `SELECT 1` proves the connection
 * rather than the pool's opinion of the connection.
 */
export async function ping(db: Database): Promise<boolean> {
  try {
    await db.$client`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export { schema };
