/**
 * A scratch phone database, in memory.
 *
 * **`better-sqlite3`, not `expo-sqlite`.** The device driver cannot run under
 * Node — it needs the Expo native runtime — and the property under test is
 * atomicity, so the harness must have *real* transactions. `sqlite-proxy` was
 * the obvious zero-dependency option and is wrong for exactly that reason: it
 * has no transaction support, so a test written against it would report success
 * on a write path that commits in two pieces.
 *
 * Both drivers speak the same drizzle SQLite dialect over the same schema, so
 * what is exercised here is the write path rather than the driver.
 *
 * **The tables come from the migrator's own chains, not from a second emitter.**
 * This file used to reproduce `CREATE TABLE` from drizzle's table objects, the
 * same way `migrate.ts` did — two copies of the same derivation, and the same
 * blind spots in both. Running `REPLICA_MIGRATIONS` and `OUTBOX_MIGRATIONS`
 * means a test is exercising the DDL that ships, constraints included, and a
 * table the phone would refuse cannot be one this harness quietly accepts.
 *
 * **Both chains, into one database.** The device has two files (§5.7) and this
 * has one, because the harness exists for `write.ts` — which touches the ledger
 * row and the outbox entry together, and needs both reachable from a single
 * `:memory:` connection. The file boundary is `open.ts`'s to enforce and
 * `migrate.test.ts`'s to test; nothing here depends on it.
 */

import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { OUTBOX_MIGRATIONS, REPLICA_MIGRATIONS } from "../migrate.ts";
import { ledgerSchema as schema } from "../schema-map.ts";

export type Scratch = ReturnType<typeof scratchLedger>;

/** Fifteen shared tables, `local_meta`, `outbox`, `outbox_seq`. */
const EXPECTED_TABLES = 18;

export function scratchLedger() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });

  /**
   * Foreign keys **off**, said out loud rather than inherited.
   *
   * `better-sqlite3` turns them on when it opens a file, and the generated DDL
   * now carries the references the old emitter dropped — so this line is the
   * difference between the harness this was and a stricter database than the
   * one that ships. The device turns them on per-connection for the replica and
   * leaves them off for the outbox (`open.ts`); a harness that enforced them
   * across one merged database would be enforcing a shape the phone never has.
   */
  sqlite.pragma("foreign_keys = OFF");

  for (const migration of [...REPLICA_MIGRATIONS, ...OUTBOX_MIGRATIONS]) migration.up(db);

  // No re-assert here (L1). A SQLite table rebuild — the shape drizzle-kit
  // emits for a migration that adds a `CHECK`, this package's own
  // `0007_schema.sql` included — used to wrap itself in `PRAGMA
  // foreign_keys=OFF; … PRAGMA foreign_keys=ON;`, which would have left this
  // harness enforcing foreign keys again after the loop above, silently,
  // regardless of the line before it. `tools/embed-ddl.ts` now strips that
  // bookend pragma out of a rebuild export's own statements (M2's own header
  // says why: it is a no-op once `migrate.ts` has a transaction open, which
  // is every real launch), so nothing between the `= OFF` above and here can
  // have turned it back on — reasserting would be setting a pragma to what
  // it already is.

  // Non-vacuous: a chain that stopped emitting tables — an empty `ddl.ts`, a
  // schema map that lost its entries — would otherwise give every test an empty
  // database and a green suite.
  const created = db.all<{ n: number }>(
    sql.raw(
      `select count(*) as n from sqlite_master where type = 'table' and name not like 'sqlite_%'`,
    ),
  );
  const count = created[0]?.n;
  if (count !== EXPECTED_TABLES) {
    throw new Error(
      `expected ${EXPECTED_TABLES} tables from the migrator's chains, found ${count}`,
    );
  }

  return {
    db,
    /** The raw handle, for asserting on what is actually stored. */
    sqlite,
    close: () => sqlite.close(),
  };
}

/**
 * The transaction handle this harness's database hands to a callback.
 *
 * Derived from `scratchLedger` rather than written out, so a test cannot pin a
 * shape the driver does not actually produce — and so nothing here has to name
 * `better-sqlite3`'s own types, which is what forked `drizzle-orm` into two
 * instances the first time round.
 */
export type LedgerTx = Parameters<Parameters<Scratch["db"]["transaction"]>[0]>[0];
