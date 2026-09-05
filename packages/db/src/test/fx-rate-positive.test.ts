/**
 * L3 — `transactions_fx_rate_positive` (the `transactions_amount_positive`
 * migration, `schema.ts`). The CHECK beside it (`transactions_amount_
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

/**
 * M3 — `fx_rates_rate_bounds` (`0012_fx_rates_derived_and_amount_guards.sql`,
 * `schema.ts`), break it once: a rate at either open bound is refused, one
 * step inside either bound is accepted. `money.ts`'s `RATE_MIN_EXCLUSIVE` /
 * `RATE_MAX_EXCLUSIVE` carry the argument for exactly `1e-12`/`999999999999`
 * — the ceiling sits one step inside `numeric(24,12)`'s own range, not at
 * `1e12` itself, so this CHECK is what actually fires rather than a generic
 * overflow standing in for it.
 */
describe("M3 — fx_rates_rate_bounds", () => {
  let scratch: Scratch;

  beforeAll(async () => {
    scratch = await scratchDatabase("fx_rate_bounds");
    await scratch.sql.unsafe(`
      INSERT INTO currencies (code, name, decimals, is_pivot) VALUES
        ('USD', 'US Dollar', 2, true),
        ('PLN', 'Polish Zloty', 2, false);
    `);
  }, 60_000);

  afterAll(async () => {
    await scratch.drop();
  });

  it("refuses a rate at the floor, 0.000000000001", async () => {
    await expect(
      scratch.sql.unsafe(`
        INSERT INTO fx_rates (base, quote, date, rate, source)
        VALUES ('USD', 'PLN', '2026-01-01', 0.000000000001, 'nbp')
      `),
    ).rejects.toThrow(/fx_rates_rate_bounds/);
  });

  // `999999999999` is `numeric(24,12)`'s own largest storable integer part —
  // the column can hold it, so this is `fx_rates_rate_bounds` itself firing,
  // not the generic overflow `1000000000000` (one digit past the column's
  // range entirely) would trip instead.
  it("refuses a rate at the ceiling, 999999999999", async () => {
    await expect(
      scratch.sql.unsafe(`
        INSERT INTO fx_rates (base, quote, date, rate, source)
        VALUES ('USD', 'PLN', '2026-01-02', 999999999999, 'nbp')
      `),
    ).rejects.toThrow(/fx_rates_rate_bounds/);
  });

  it("accepts a rate one step inside the floor, 0.000000000002", async () => {
    await scratch.sql.unsafe(`
      INSERT INTO fx_rates (base, quote, date, rate, source)
      VALUES ('USD', 'PLN', '2026-01-03', 0.000000000002, 'nbp')
    `);
    const rows = await scratch.sql<{ rate: string }[]>`
      SELECT rate::text FROM fx_rates
      WHERE base = 'USD' AND quote = 'PLN' AND date = '2026-01-03'`;
    expect(rows[0]?.rate).toBe("0.000000000002");
  });

  it("accepts a rate one step inside the ceiling, 999999999998", async () => {
    await scratch.sql.unsafe(`
      INSERT INTO fx_rates (base, quote, date, rate, source)
      VALUES ('USD', 'PLN', '2026-01-04', 999999999998, 'nbp')
    `);
    const rows = await scratch.sql<{ rate: string }[]>`
      SELECT rate::text FROM fx_rates
      WHERE base = 'USD' AND quote = 'PLN' AND date = '2026-01-04'`;
    expect(rows[0]?.rate).toBe("999999999998.000000000000");
  });
});
