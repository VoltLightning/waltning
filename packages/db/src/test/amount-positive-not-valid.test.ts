/**
 * M1 — `0014_transactions_amount_strictly_positive.sql` tightens
 * `transactions_amount_positive` from `>= 0` to `> 0` (H4, `schema.ts`).
 * `DROP CONSTRAINT IF EXISTS` plus `ADD CONSTRAINT … NOT VALID` is the whole
 * point: a database that already holds a zero-amount, non-adjustment row
 * (legal under the old constraint) must not have this migration fail on it.
 *
 * Proved by actually holding one open — migrated up through the migration
 * before this one, a zero-amount transfer inserted while the old constraint
 * still allows it, then this migration applied on top. `scratchDatabase`
 * (`scratch.ts`) cannot express this: it clones the fully-migrated template,
 * where the tightened constraint already refuses the very row this test
 * needs to plant first. So this builds its own two-step migration folder
 * instead — the real files, run in two calls to the same `migrate()` the
 * template uses, so a fabricated migration path never diverges from the real
 * one.
 *
 * **L2 — `pg_constraint.convalidated` is read directly, not inferred from
 * prose.** The migration's own comment claims a fresh install ends up
 * `VALID` and a database holding a violating row is left `NOT VALID` until
 * the owner runs `VALIDATE CONSTRAINT` by hand; nothing checked either half
 * of that before now. `conrelid = 'transactions'::regclass` scopes the name
 * lookup to this table, the same way `conname` alone would not if another
 * table ever grew a constraint with the same short name.
 */

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateUrl, migrationsFolder, scratchDatabase } from "./scratch.ts";

/** `pg_constraint.convalidated` for `transactions_amount_positive` — L2. */
async function isConvalidated(sql: postgres.Sql): Promise<boolean | undefined> {
  const rows = await sql<{ convalidated: boolean }[]>`
    SELECT convalidated FROM pg_constraint
    WHERE conname = 'transactions_amount_positive'
      AND conrelid = 'transactions'::regclass`;
  return rows[0]?.convalidated;
}

const TARGET_TAG = "0014_transactions_amount_strictly_positive";

type Journal = { entries: { idx: number; tag: string; when: number }[] };

/** A temp copy of the real journal, truncated to every entry before `TARGET_TAG`. */
function priorMigrationsFolder(): string {
  const journal: Journal = JSON.parse(
    readFileSync(path.join(migrationsFolder, "meta/_journal.json"), "utf8"),
  );
  const targetIdx = journal.entries.findIndex((e) => e.tag === TARGET_TAG);
  if (targetIdx < 0) {
    throw new Error(`${TARGET_TAG} is not in the journal — has it been renamed?`);
  }
  const priorEntries = journal.entries.slice(0, targetIdx);

  const dir = mkdtempSync(path.join(tmpdir(), "waltning-migrate-prior-"));
  const metaDir = path.join(dir, "meta");
  mkdirSync(metaDir);
  for (const entry of priorEntries) {
    const file = `${entry.tag}.sql`;
    writeFileSync(path.join(dir, file), readFileSync(path.join(migrationsFolder, file), "utf8"));
  }
  writeFileSync(
    path.join(metaDir, "_journal.json"),
    JSON.stringify({ ...journal, entries: priorEntries }),
  );
  return dir;
}

function urlFor(database: string): string {
  const u = new URL(migrateUrl());
  u.pathname = `/${database}`;
  return u.toString();
}

/** `DROP … IF EXISTS` and `CREATE SCHEMA/TABLE IF NOT EXISTS` NOTICEs are
 * expected here, not informative — see `scratch.ts`'s own copy. */
const quiet = () => {};

describe("M1 — 0014 on a database already holding a zero-amount transfer", () => {
  const name = `waltning_test_amt_${process.pid}`;
  let client: postgres.Sql;

  beforeAll(async () => {
    const admin = postgres(urlFor("postgres"), { max: 1, onnotice: quiet });
    try {
      await admin.unsafe(`DROP DATABASE IF EXISTS "${name}"`);
      await admin.unsafe(`CREATE DATABASE "${name}"`);
    } finally {
      await admin.end();
    }
    client = postgres(urlFor(name), { max: 1, onnotice: quiet });

    // Every migration except the one under test — the old `>= 0` constraint
    // (`0000_schema.sql`) is still in force here.
    await migrate(drizzle(client), { migrationsFolder: priorMigrationsFolder() });

    await client.unsafe(`
      INSERT INTO currencies (code, name, decimals, is_pivot) VALUES
        ('USD', 'US Dollar', 2, true),
        ('PLN', 'Polish Zloty', 2, false);
      INSERT INTO accounts (id, name, currency, opening_balance) VALUES
        ('11111111-1111-1111-1111-111111111111', 'Household · USD', 'USD', 0),
        ('22222222-2222-2222-2222-222222222222', 'Cash · PLN', 'PLN', 0);
    `);
    // Legal under the pre-0014 constraint (`>= 0`) — a zero-amount transfer,
    // never an adjustment. This is the row 0014 must not choke on.
    await client.unsafe(`
      INSERT INTO transactions
        (id, date, type, account_id, to_account_id, amount_original, to_amount,
         currency, to_currency, fx_rate, to_fx_rate)
      VALUES
        ('33333333-3333-3333-3333-333333333333', '2026-01-01', 'transfer',
         '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
         0.00, 0.00, 'USD', 'PLN', 1, 1)
    `);
  }, 60_000);

  afterAll(async () => {
    await client?.end();
    const admin = postgres(urlFor("postgres"), { max: 1, onnotice: quiet });
    try {
      await admin.unsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${name}' AND pid <> pg_backend_pid()`,
      );
      await admin.unsafe(`DROP DATABASE IF EXISTS "${name}"`);
    } finally {
      await admin.end();
    }
  });

  it("applies without failing on the pre-existing zero-amount row", async () => {
    await migrate(drizzle(client), { migrationsFolder });

    const rows = await client<{ amount_original: string }[]>`
      SELECT amount_original::text FROM transactions
      WHERE id = '33333333-3333-3333-3333-333333333333'`;
    expect(rows[0]?.amount_original).toBe("0.00000000");
  });

  it("L2 — leaves the constraint NOT VALID, since a violating row is still there", async () => {
    expect(await isConvalidated(client)).toBe(false);
  });

  it("refuses a new zero-amount, non-adjustment row from this point on", async () => {
    await expect(
      client.unsafe(`
        INSERT INTO transactions
          (id, date, type, account_id, to_account_id, amount_original, to_amount,
           currency, to_currency, fx_rate, to_fx_rate)
        VALUES
          ('44444444-4444-4444-4444-444444444444', '2026-01-02', 'transfer',
           '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
           0.00, 0.00, 'USD', 'PLN', 1, 1)
      `),
    ).rejects.toThrow(/transactions_amount_positive/);
  });
});

describe("L2 — 0014 on a fresh install", () => {
  it("validates transactions_amount_positive immediately — no violating row exists", async () => {
    const scratch = await scratchDatabase("amt_fresh");
    try {
      expect(await isConvalidated(scratch.sql)).toBe(true);
    } finally {
      await scratch.drop();
    }
  });
});
