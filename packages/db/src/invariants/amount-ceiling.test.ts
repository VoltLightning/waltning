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
const EURO = "00000000-0000-4000-8000-0000000000c4";
const TXN = "00000000-0000-4000-8000-0000000000c3";

let s: Scratch;

beforeAll(async () => {
  s = await scratchDatabase("amount_ceiling");
  await s.sql`insert into currencies (code, name, decimals, is_pivot) values ('PLN', 'Polish Zloty', 2, true), ('EUR', 'Euro', 2, false)`;
  await s.sql`insert into accounts (id, name, currency) values (${EURO}, 'Bank C · EUR', 'EUR')`;
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

  /**
   * Cross-currency, so `transactions_transfer_same_currency_equal` has nothing
   * to say and the ceiling is the only constraint that can refuse the row —
   * and the in-bounds twin proves the row is otherwise valid.
   */
  it("refuses a transfer's destination leg at the ceiling", async () => {
    const leg = (toAmount: string) =>
      s.sql`insert into transactions (date, type, account_id, amount_original, currency, fx_rate, to_account_id, to_amount, to_currency, to_fx_rate)
        values ('2026-01-01', 'transfer', ${BANK}, 10, 'PLN', 1, ${EURO}, ${toAmount}, 'EUR', 1)`;
    await leg("999999999.99");
    await expect(leg("1000000000")).rejects.toThrow(/transactions_amount_ceiling/);
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

describe("the other tables that hold a typed figure", () => {
  it("bounds a reassigned debt, a target and a receipt's total", async () => {
    const CP1 = "00000000-0000-4000-8000-0000000000d1";
    const CP2 = "00000000-0000-4000-8000-0000000000d2";
    await s.sql`insert into counterparties (id, name, kind) values (${CP1}, 'Nina', 'person'), (${CP2}, 'Tomasz', 'person')`;
    const reassign = (amount: string) =>
      s.sql`insert into debt_reassignments (date, from_counterparty_id, to_counterparty_id, currency, amount)
        values ('2026-01-01', ${CP1}, ${CP2}, 'PLN', ${amount})`;
    await reassign("999999999.99");
    await expect(reassign("1000000000")).rejects.toThrow(/debt_reassignments_amount_ceiling/);

    const target = (amount: string) =>
      s.sql`insert into targets (period, amount, currency, active_from) values ('month', ${amount}, 'PLN', '2026-01-01')`;
    await target("999999999.99");
    await expect(target("1000000000")).rejects.toThrow(/targets_amount_ceiling/);

    const receipt = (total: string) =>
      s.sql`insert into receipts (image_key, total, currency) values ('k', ${total}, 'PLN')`;
    await receipt("999999999.99");
    await expect(receipt("1000000000")).rejects.toThrow(/receipts_total_ceiling/);
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
    "debt_reassignments_amount_ceiling",
    "receipts_total_ceiling",
    "recurring_transactions_amount_ceiling",
    "targets_amount_ceiling",
    "transaction_lines_amount_ceiling",
    "transactions_amount_ceiling",
  ]);
  expect(rows.every((r) => r.convalidated)).toBe(true);
});
