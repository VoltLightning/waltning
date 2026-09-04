/**
 * L3 — `transactions_fx_rate_positive` (`0014_transactions_amount_strictly_
 * positive.sql`, `schema.ts`). The CHECK beside it (`transactions_amount_
 * positive`) justifies itself by naming `fx_rate` in `amount_pivot =
 * amount_original × fx_rate`, but nothing on `transactions` itself ever
 * refused a zero one — only `fx_rates.rate` (`fx_rates_rate_positive`) did.
 *
 * A fresh install has no prior, looser constraint to migrate away from (the
 * column has always been `NOT NULL`, never previously checked `> 0`), so
 * this reads as an ordinary refusal test against `scratchDatabase`'s
 * fully-migrated template, not the two-step grandfathering
 * `amount-positive-not-valid.test.ts` exercises for the amount CHECK.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Scratch, scratchDatabase } from "./scratch.ts";

describe("L3 — transactions_fx_rate_positive", () => {
  let scratch: Scratch;

  beforeAll(async () => {
    scratch = await scratchDatabase("fx_rate_positive");
    await scratch.sql.unsafe(`
      INSERT INTO currencies (code, name, decimals, is_pivot) VALUES
        ('USD', 'US Dollar', 2, true),
        ('PLN', 'Polish Zloty', 2, false);
      INSERT INTO accounts (id, name, currency, opening_balance) VALUES
        ('11111111-1111-1111-1111-111111111111', 'Household · USD', 'USD', 0);
    `);
  }, 60_000);

  afterAll(async () => {
    await scratch.drop();
  });

  it("refuses a zero fx_rate", async () => {
    await expect(
      scratch.sql.unsafe(`
        INSERT INTO transactions
          (id, date, type, account_id, amount_original, currency, fx_rate)
        VALUES
          ('22222222-2222-2222-2222-222222222222', '2026-01-01', 'expense',
           '11111111-1111-1111-1111-111111111111', 18.00, 'USD', 0)
      `),
    ).rejects.toThrow(/transactions_fx_rate_positive/);
  });

  it("accepts a positive fx_rate — the ordinary case", async () => {
    await scratch.sql.unsafe(`
      INSERT INTO transactions
        (id, date, type, account_id, amount_original, currency, fx_rate)
      VALUES
        ('33333333-3333-3333-3333-333333333333', '2026-01-01', 'expense',
         '11111111-1111-1111-1111-111111111111', 18.00, 'USD', 1)
    `);

    const rows = await scratch.sql<{ fx_rate: string }[]>`
      SELECT fx_rate::text FROM transactions
      WHERE id = '33333333-3333-3333-3333-333333333333'`;
    expect(rows[0]?.fx_rate).toBe("1.000000000000");
  });
});
