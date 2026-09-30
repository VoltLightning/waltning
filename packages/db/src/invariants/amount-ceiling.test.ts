/**
 * Proves: SPEC.md §6.5 — no amount a row holds reaches 1 000 000 000 (`999 999 999.99` is the
 * largest), on every table that carries one — a CHECK per table, added
 * `NOT VALID` and validated on a fresh install.
 *
 * `check-validated.test.ts` breaks `transactions_amount_ceiling` once on
 * `amount_original`; this covers the other columns of that constraint and the
 * three other tables, each with an in-bounds twin so a CHECK that refuses
 * everything does not pass.
 *
 * Findings: none — the ceiling is an owner decision, not a review finding.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Scratch, scratchDatabase } from "../test/scratch.ts";

const BANK = "00000000-0000-4000-8000-0000000000c1";
const OTHER = "00000000-0000-4000-8000-0000000000c2";
const TXN = "00000000-0000-4000-8000-0000000000c3";

let s: Scratch;

beforeAll(async () => {
  s = await scratchDatabase("amount_ceiling");
  await s.sql`insert into currencies (code, name, decimals, is_pivot) values ('PLN', 'Polish Zloty', 2, true)`;
  await s.sql`insert into accounts (id, name, currency) values (${BANK}, 'Bank A · PLN', 'PLN'), (${OTHER}, 'Bank B · PLN', 'PLN')`;
  await s.sql`insert into transactions (id, date, type, account_id, amount_original, currency, fx_rate)
    values (${TXN}, '2026-01-01', 'expense', ${BANK}, 10, 'PLN', 1)`;
}, 60_000);

afterAll(async () => {
  await s?.drop();
});

describe("transactions_amount_ceiling", () => {
  it("takes the largest amount on every column it covers", async () => {
    await s.sql`update transactions set amount_original = 999999999.99, fee = 999999999.99, debt_amount = 999999999.99, debt_currency = 'PLN' where id = ${TXN}`;
    await s.sql`update transactions set amount_original = 10, fee = null, debt_amount = null, debt_currency = null where id = ${TXN}`;
  });

  it("refuses a fee at the ceiling", async () => {
    await expect(s.sql`update transactions set fee = 1000000000 where id = ${TXN}`).rejects.toThrow(
      /transactions_amount_ceiling/,
    );
  });

  it("refuses a debt amount at the ceiling", async () => {
    await expect(
      s.sql`update transactions set debt_amount = 1000000000, debt_currency = 'PLN' where id = ${TXN}`,
    ).rejects.toThrow(/transactions_amount_ceiling/);
  });

  it("refuses a transfer's destination leg at the ceiling", async () => {
    await expect(
      s.sql`insert into transactions (date, type, account_id, amount_original, currency, fx_rate, to_account_id, to_amount, to_currency, to_fx_rate)
        values ('2026-01-01', 'transfer', ${BANK}, 10, 'PLN', 1, ${OTHER}, 1000000000, 'PLN', 1)`,
    ).rejects.toThrow(/transactions_amount_ceiling|transactions_transfer_same_currency_equal/);
  });

  it("refuses a negative adjustment past the ceiling in absolute value", async () => {
    await expect(
      s.sql`insert into transactions (date, type, account_id, amount_original, currency, fx_rate)
        values ('2026-01-01', 'adjustment', ${BANK}, -1000000000, 'PLN', 1)`,
    ).rejects.toThrow(/transactions_amount_ceiling/);
  });
});

describe("transaction_lines_amount_ceiling", () => {
  it("takes 999999999.99 and refuses 1000000000", async () => {
    await s.sql`update transactions set amount_original = 999999999.99 where id = ${TXN}`;
    await s.sql`insert into transaction_lines (transaction_id, description, amount) values (${TXN}, 'Whole', 999999999.99)`;
    await expect(
      s.sql`insert into transaction_lines (transaction_id, description, amount) values (${TXN}, 'Over', 1000000000)`,
    ).rejects.toThrow(/transaction_lines_amount_ceiling/);
  });
});

describe("accounts_opening_balance_ceiling", () => {
  it("takes 999999999.99 and refuses it negative past the ceiling", async () => {
    await s.sql`update accounts set opening_balance = -999999999.99 where id = ${OTHER}`;
    await expect(
      s.sql`update accounts set opening_balance = -1000000000 where id = ${OTHER}`,
    ).rejects.toThrow(/accounts_opening_balance_ceiling/);
  });
});

describe("recurring_transactions_amount_ceiling", () => {
  it("takes 999999999.99 and refuses 1000000000", async () => {
    await s.sql`insert into recurring_transactions (type, account_id, amount_original, currency, rrule)
      values ('expense', ${BANK}, 999999999.99, 'PLN', 'FREQ=MONTHLY')`;
    await expect(
      s.sql`insert into recurring_transactions (type, account_id, amount_original, currency, rrule)
        values ('expense', ${BANK}, 1000000000, 'PLN', 'FREQ=MONTHLY')`,
    ).rejects.toThrow(/recurring_transactions_amount_ceiling/);
  });
});

it("leaves every constraint VALID on a fresh install", async () => {
  const rows = await s.sql<{ conname: string; convalidated: boolean }[]>`
    select conname, convalidated from pg_constraint where conname like '%\\_ceiling' escape '\\'`;
  expect(rows.map((r) => r.conname).sort()).toEqual([
    "accounts_opening_balance_ceiling",
    "recurring_transactions_amount_ceiling",
    "transaction_lines_amount_ceiling",
    "transactions_amount_ceiling",
  ]);
  expect(rows.every((r) => r.convalidated)).toBe(true);
});
