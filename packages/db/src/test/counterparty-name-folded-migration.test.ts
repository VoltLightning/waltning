/**
 * `0010_counterparty_name_folded.sql`'s own pre-check (R2 M2), tested by
 * execution rather than by reading the SQL.
 *
 * `scratchDatabase()` always hands back a database with every migration
 * already applied — useless here, since the whole point is a database that
 * has *not yet* run 0010, carrying exactly the colliding data a real
 * Money Manager migration could leave behind. So this builds its own,
 * migration-by-migration, stopping short of 0010 on purpose.
 *
 * Replayed inside one transaction per attempt, the same as the real
 * migrator (`drizzle-orm`'s `PgDialect.migrate` wraps every statement of
 * every pending migration in a single `session.transaction`) — without that,
 * a collision caught mid-migration would leave the generated column behind
 * instead of rolling back with it, which is not what a real failed
 * migration does.
 */

import { readFileSync } from "node:fs";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrateUrl } from "./scratch.ts";

const STATEMENT_BREAK = "--> statement-breakpoint";
const MIGRATION_0010 = "0010_counterparty_name_folded";

/** One migration file's statements, in the order the migrator would run them. */
function statementsOf(tag: string): string[] {
  const text = readFileSync(new URL(`../../drizzle/${tag}.sql`, import.meta.url), "utf8");
  return text
    .split(STATEMENT_BREAK)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Every migration tag before `0010`, in the journal's own order. */
function tagsBefore0010(): string[] {
  const journal = JSON.parse(
    readFileSync(new URL("../../drizzle/meta/_journal.json", import.meta.url), "utf8"),
  ) as { entries: { tag: string }[] };
  const tags = journal.entries.map((e) => e.tag);
  const cut = tags.indexOf(MIGRATION_0010);
  if (cut === -1) throw new Error(`${MIGRATION_0010} is not in the journal`);
  return tags.slice(0, cut);
}

function urlFor(database: string): string {
  const u = new URL(migrateUrl());
  u.pathname = `/${database}`;
  return u.toString();
}

const DB_NAME = `waltning_test_r2m2_${process.pid}`;

let admin: postgres.Sql;
let target: postgres.Sql;

beforeAll(async () => {
  admin = postgres(urlFor("postgres"), { max: 1 });
  await admin.unsafe(`DROP DATABASE IF EXISTS "${DB_NAME}"`);
  await admin.unsafe(`CREATE DATABASE "${DB_NAME}"`);

  target = postgres(urlFor(DB_NAME), { max: 1 });
  // Every migration up to, but not including, 0010 — the state a real
  // upgrade is in the instant before this one runs.
  for (const tag of tagsBefore0010()) {
    for (const statement of statementsOf(tag)) {
      await target.unsafe(statement);
    }
  }
}, 60_000);

afterAll(async () => {
  await target?.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS "${DB_NAME}"`);
  await admin.end();
});

// Each test names its own rows; a leftover from a previous one would collide
// (that is the whole point of the next describe block) for the wrong reason.
beforeEach(async () => {
  await target`DELETE FROM counterparties`;
});

/** Replays 0010 the way the real migrator would: as one transaction. */
async function apply0010(): Promise<void> {
  await target.begin(async (tx) => {
    for (const statement of statementsOf(MIGRATION_0010)) {
      await tx.unsafe(statement);
    }
  });
}

describe("a colliding pair aborts with both ids named, before the index ever fires", () => {
  it("raises naming the folded value and both ids, not a bare unique-violation", async () => {
    // R2 C1's own case: `lower(btrim(...))` — the *old* index this migration
    // replaces — does not see these two collide (`Łukasz` keeps its `ł`
    // under a plain `lower()`), so both inserts land under the pre-0010
    // schema; only the fold this migration adds sees them as the same name.
    const [a] = await target`
      INSERT INTO counterparties (name, kind) VALUES ('Łukasz', 'person') RETURNING id`;
    const [b] = await target`
      INSERT INTO counterparties (name, kind) VALUES ('lukasz', 'person') RETURNING id`;

    let caught: unknown;
    try {
      await apply0010();
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain("counterparties_name_uq");
    expect(message).toContain("lukasz");
    expect(message).toContain(String(a?.["id"]));
    expect(message).toContain(String(b?.["id"]));
    expect(message).toContain("merge them first");

    // Rolled back with the rest of the failed transaction — the generated
    // column and its index never landed.
    const [row] = await target`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'counterparties' AND column_name = 'name_folded'`;
    expect(row).toBeUndefined();
  });
});

/**
 * R4 M2 — before this, `ADD CONSTRAINT counterparties_name_trimmed` ran
 * ahead of the collision check above and with no pre-check of its own, so a
 * pre-existing padded name (`'Bank A '`, written before this migration ever
 * existed to refuse it) aborted with Postgres's own bare "column … of
 * relation … contains values that violate the new constraint" — naming
 * neither the row nor what "trimmed" even means here.
 */
describe("an untrimmed name aborts naming the id, before the CHECK ever fires", () => {
  it("raises naming the offending id, not a bare constraint violation", async () => {
    const [row] = await target`
      INSERT INTO counterparties (name, kind) VALUES ('Bank A ', 'person') RETURNING id`;

    let caught: unknown;
    try {
      await apply0010();
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain("counterparties_name_trimmed");
    expect(message).toContain(String(row?.["id"]));
    expect(message).toContain("trim these names first");

    // Rolled back with the rest of the failed transaction, same as the
    // collision case above.
    const [column] = await target`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'counterparties' AND column_name = 'name_folded'`;
    expect(column).toBeUndefined();
  });

  it("succeeds once the offending name is trimmed", async () => {
    const [row] = await target`
      INSERT INTO counterparties (name, kind) VALUES ('Bank A ', 'person') RETURNING id`;

    await expect(apply0010()).rejects.toThrow();

    await target`UPDATE counterparties SET name = 'Bank A' WHERE id = ${row?.["id"] as string}`;

    // Only the column-add, this test's own DO block, and the CHECK it
    // guards — not the rest of `apply0010()` (the collision DO block, the
    // two `counterparty_merges` statements), which this file's other
    // describe block already exercises to completion and undoes. Rolled
    // back deliberately at the end via `ROLLBACK_AFTER_SUCCESS`, so this
    // test needs no undo of its own and cannot collide with that one.
    const nameTrimmedStatements = statementsOf(MIGRATION_0010).slice(0, 3);
    class RolledBackAfterSuccess extends Error {}
    let nameFolded: string | undefined;
    try {
      await target.begin(async (tx) => {
        for (const statement of nameTrimmedStatements) {
          await tx.unsafe(statement);
        }
        const [after] = await tx<{ name_folded: string }[]>`
          SELECT name_folded FROM counterparties WHERE id = ${row?.["id"] as string}`;
        nameFolded = after?.name_folded;
        throw new RolledBackAfterSuccess();
      });
    } catch (e) {
      if (!(e instanceof RolledBackAfterSuccess)) throw e;
    }

    expect(nameFolded).toBe("bank a");
  });
});

describe("no collision — the migration runs clean", () => {
  it("adds the generated column and the index without raising", async () => {
    await target`INSERT INTO counterparties (name, kind) VALUES ('Marek', 'person')`;

    await apply0010();

    const [row] = await target<{ name_folded: string }[]>`
      SELECT name_folded FROM counterparties WHERE name = 'Marek'`;
    expect(row?.name_folded).toBe("marek");

    // Undo, so this test can run again in the same process without a second
    // "column already exists" from a migration that is not meant to be
    // idempotent (it never is, in the real journal either).
    await target`ALTER TABLE counterparties DROP COLUMN name_folded`;
    await target`
      CREATE UNIQUE INDEX counterparties_name_uq ON counterparties (lower(btrim(name)))`;
  });
});
