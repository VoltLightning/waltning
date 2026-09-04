/**
 * M1 — `0009_transactions_to_amount_and_fee_positive.sql` repairs two shapes
 * before either CHECK goes on: a `fee` of `0` (this migration's own repair,
 * added alongside the pre-existing `to_amount` one) and a same-currency
 * transfer's `to_amount` of `0`. `transactions-fee-and-to-amount-check.test.ts`
 * proves the CHECKs fire on a fully migrated database; this proves the
 * *repair* runs first, by migrating only up to `0008` — the migration
 * already renumbered onto this branch, so this proves `0009` runs on a
 * database already at `0008` — seeding both bad shapes while nothing
 * forbids them, then applying `0009` and reading the rows back.
 */

import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "../client.ts";
import { migrateUrl, migrationsFolder } from "./scratch.ts";

const CURRENCY = { code: "PLN", name: "Polish Zloty", decimals: 2 };
const ACCOUNT = {
  id: "00000000-0000-4000-8000-000000000101",
  name: "Bank A · PLN",
  currency: "PLN",
};
const TO_ACCOUNT = {
  id: "00000000-0000-4000-8000-000000000102",
  name: "Cash · PLN",
  currency: "PLN",
};

/** Same server, different database — the same shape `scratch.ts` uses. */
function urlFor(database: string): string {
  const u = new URL(migrateUrl());
  u.pathname = `/${database}`;
  return u.toString();
}

function admin() {
  return postgres(urlFor("postgres"), { max: 1, onnotice: () => {} });
}

/**
 * A migrations folder holding only the journal entries up to (and including)
 * `uptoTag`, copied into a scratch temp directory — `readMigrationFiles`
 * needs nothing but `meta/_journal.json` and the `.sql` files it names.
 */
function migrationsFolderUpto(uptoTag: string): string {
  const journal = JSON.parse(
    readFileSync(join(migrationsFolder, "meta/_journal.json"), "utf8"),
  ) as {
    entries: { idx: number; tag: string; when: number; version: string; breakpoints: boolean }[];
  };
  const cut = journal.entries.findIndex((e) => e.tag === uptoTag);
  if (cut === -1) throw new Error(`No journal entry tagged ${uptoTag}`);
  const entries = journal.entries.slice(0, cut + 1);

  const dir = mkdtempSync(join(tmpdir(), "waltning-migrations-upto-"));
  mkdirSync(join(dir, "meta"), { recursive: true });
  writeFileSync(join(dir, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
  for (const entry of entries) {
    copyFileSync(join(migrationsFolder, `${entry.tag}.sql`), join(dir, `${entry.tag}.sql`));
  }
  return dir;
}

describe("0009 repairs a zero fee and a same-currency zero to_amount", () => {
  let name: string;
  let sql: postgres.Sql;
  let partialFolder: string;

  beforeAll(async () => {
    partialFolder = migrationsFolderUpto("0008_transaction_lines_category_index");

    name = `waltning_test_0009_repair_${process.pid}`.toLowerCase();
    const sqlAdmin = admin();
    try {
      await sqlAdmin.unsafe(`DROP DATABASE IF EXISTS "${name}"`);
      await sqlAdmin.unsafe(`CREATE DATABASE "${name}"`);
    } finally {
      await sqlAdmin.end();
    }

    const migrateClient = postgres(urlFor(name), { max: 1, onnotice: () => {} });
    try {
      // Everything before 0009 — the bad shapes below are still legal.
      await migrate(drizzle(migrateClient), { migrationsFolder: partialFolder });
    } finally {
      await migrateClient.end();
    }

    sql = createDb(urlFor(name)).$client;

    await sql`insert into currencies (code, name, decimals, is_pivot)
      values (${CURRENCY.code}, ${CURRENCY.name}, ${CURRENCY.decimals}, true)`;
    await sql`insert into accounts (id, name, currency, ownership, is_business, opening_balance, kind)
      values (${ACCOUNT.id}, ${ACCOUNT.name}, ${ACCOUNT.currency}, 'own', false, '0', 'other'),
             (${TO_ACCOUNT.id}, ${TO_ACCOUNT.name}, ${TO_ACCOUNT.currency}, 'own', false, '0', 'other')`;

    // The fee shape: an otherwise-valid expense with `fee = 0`, legal before
    // `transactions_fee_positive` exists.
    await sql`insert into transactions
      (id, date, type, account_id, amount_original, currency, fx_rate, fee)
      values (gen_random_uuid(), '2026-08-12', 'expense', ${ACCOUNT.id}, '10.00', ${CURRENCY.code}, '1', '0.00')`;

    // The to_amount shape: a same-currency transfer with `to_amount = 0`,
    // legal before `>= 0` tightened to `> 0`.
    await sql`insert into transactions
      (id, date, type, account_id, to_account_id, amount_original, to_amount, currency, to_currency, fx_rate, to_fx_rate)
      values (gen_random_uuid(), '2026-08-12', 'transfer', ${ACCOUNT.id}, ${TO_ACCOUNT.id}, '10.00', '0.00', ${CURRENCY.code}, ${CURRENCY.code}, '1', '1')`;

    // Apply the rest — 0009 included — against the real, full folder.
    // `dialect.migrate` skips anything already recorded by its own `when`.
    const finishClient = postgres(urlFor(name), { max: 1, onnotice: () => {} });
    try {
      await migrate(drizzle(finishClient), { migrationsFolder });
    } finally {
      await finishClient.end();
    }
  }, 60_000);

  afterAll(async () => {
    rmSync(partialFolder, { recursive: true, force: true });
    await sql?.end();
    const sqlAdmin = admin();
    try {
      await sqlAdmin.unsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${name}' AND pid <> pg_backend_pid()`,
      );
      await sqlAdmin.unsafe(`DROP DATABASE IF EXISTS "${name}"`);
    } finally {
      await sqlAdmin.end();
    }
  });

  it("repairs the zero fee to NULL", async () => {
    const [row] = await sql<{ fee: string | null }[]>`
      SELECT fee FROM transactions WHERE type = 'expense'`;
    expect(row?.fee).toBeNull();
  });

  it("repairs the same-currency zero to_amount back to amount_original", async () => {
    const [row] = await sql<{ to_amount: string; amount_original: string }[]>`
      SELECT to_amount, amount_original FROM transactions WHERE type = 'transfer'`;
    expect(row?.to_amount).toBe(row?.amount_original);
    expect(row?.to_amount).toBe("10.00000000");
  });

  it("both CHECKs are live afterward", async () => {
    await expect(
      sql`insert into transactions
        (id, date, type, account_id, amount_original, currency, fx_rate, fee)
        values (gen_random_uuid(), '2026-08-12', 'expense', ${ACCOUNT.id}, '10.00', ${CURRENCY.code}, '1', '0.00')`,
    ).rejects.toThrow(/transactions_fee_positive/);

    await expect(
      sql`insert into transactions
        (id, date, type, account_id, to_account_id, amount_original, to_amount, currency, to_currency, fx_rate, to_fx_rate)
        values (gen_random_uuid(), '2026-08-12', 'transfer', ${ACCOUNT.id}, ${TO_ACCOUNT.id}, '10.00', '0.00', ${CURRENCY.code}, ${CURRENCY.code}, '1', '1')`,
    ).rejects.toThrow(/transactions_to_amount_positive/);
  });
});
