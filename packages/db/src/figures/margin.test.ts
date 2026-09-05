/**
 * §4a / §7.5 — the differential test: SQL against real Postgres, `money.ts`
 * against the same row, asserted equal as eight-decimal strings. Same
 * discipline as `differential.test.ts`, in its own scratch database rather
 * than perturbing the shared fixture those tests already exercise.
 */

import * as money from "@waltning/core/money";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Scratch, scratchDatabase } from "../test/scratch.ts";
import { transactionMargins } from "./margin.ts";

describe("§4a margin — SQL against money.ts, real Postgres", () => {
  let scratch: Scratch;

  beforeAll(async () => {
    scratch = await scratchDatabase("margin");
    await scratch.sql.unsafe(`
      INSERT INTO currencies (code, name, decimals, is_pivot) VALUES
        ('USD', 'US Dollar', 2, true),
        ('PLN', 'Polish Zloty', 2, false);
      INSERT INTO accounts (id, name, currency, opening_balance) VALUES
        ('11111111-1111-1111-1111-111111111111', 'Household · USD', 'USD', 0),
        ('22222222-2222-2222-2222-222222222222', 'Cash · PLN', 'PLN', 0),
        ('77777777-7777-7777-7777-777777777777', 'Savings · USD', 'USD', 0);
    `);
  }, 60_000);

  afterAll(async () => {
    await scratch.drop();
  });

  /** §7.5's own worked example: 150.00 USD → 565.20 PLN, reference 3.8100. */
  it("150.00 USD → 565.20 PLN at a 3.8100 reference rate — SQL matches money.ts", async () => {
    const toFxRate = money.reciprocal(money.unitsPerPivot("3.8100"));
    await scratch.sql`
      INSERT INTO transactions
        (id, date, type, account_id, to_account_id, amount_original, to_amount,
         currency, to_currency, fx_rate, to_fx_rate)
      VALUES
        ('33333333-3333-3333-3333-333333333333', '2026-09-01', 'transfer',
         '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
         150.00, 565.20, 'USD', 'PLN', ${money.pivotPerUnit("1")}, ${toFxRate})
    `;

    const [row] = await transactionMargins(scratch.db);
    const expected = money.margin({
      amountOriginal: money.toMoney("150.00"),
      fxRate: money.pivotPerUnit("1"),
      toAmount: money.toMoney("565.20"),
      toFxRate,
    });

    expect(row?.marginPivot).toBe(expected.marginPivot);
    expect(row?.marginPct).toBe(expected.marginPct);
    expect(row?.realizedRate).toBe(expected.realizedRate);

    // The worked figure, at display scale — §7.5's own numbers.
    expect(money.round(row?.marginPivot ?? money.ZERO, 2)).toBe("1.65");
    expect(money.round(money.mul(row?.marginPct ?? money.ZERO, 100), 2)).toBe("1.10");
  });

  it("is negative, and unclamped, when the transfer beat the reference rate", async () => {
    await scratch.sql.unsafe(`DELETE FROM transactions`);
    await scratch.sql`
      INSERT INTO transactions
        (id, date, type, account_id, to_account_id, amount_original, to_amount,
         currency, to_currency, fx_rate, to_fx_rate)
      VALUES
        ('44444444-4444-4444-4444-444444444444', '2026-09-02', 'transfer',
         '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
         100.00, 420.00, 'USD', 'PLN', ${money.pivotPerUnit("1")}, ${money.pivotPerUnit("0.25")})
    `;

    const [row] = await transactionMargins(scratch.db);
    expect(row?.marginPivot).toBe("-5.00000000");
    expect(money.dec(row?.marginPivot ?? "0").isNegative()).toBe(true);
  });

  it("excludes soft-deleted rows and same-currency transfers still price at zero", async () => {
    await scratch.sql.unsafe(`DELETE FROM transactions`);
    await scratch.sql`
      INSERT INTO transactions
        (id, date, type, account_id, to_account_id, amount_original, to_amount,
         currency, to_currency, fx_rate, to_fx_rate, deleted_at)
      VALUES
        ('55555555-5555-5555-5555-555555555555', '2026-09-03', 'transfer',
         '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
         999999.00, 1.00, 'USD', 'PLN', ${money.pivotPerUnit("1")}, ${money.pivotPerUnit("1")}, now()),
        ('66666666-6666-6666-6666-666666666666', '2026-09-03', 'transfer',
         '11111111-1111-1111-1111-111111111111', '77777777-7777-7777-7777-777777777777',
         50.00, 50.00, 'USD', 'USD', ${money.pivotPerUnit("1")}, ${money.pivotPerUnit("1")}, NULL)
    `;

    const rows = await transactionMargins(scratch.db);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.marginPivot).toBe("0.00000000");
    expect(rows[0]?.realizedRate).toBe("1.00000000");
  });

  /**
   * H4 — `money.margin` divides by `amountPivot` and refuses it at zero; the
   * guarantee this pins is the one nothing in application code can bypass:
   * `transactions_amount_positive` refuses the row before it ever reaches
   * `transactionMargins`. Broken once, here, to prove the CHECK actually
   * fires rather than merely reading as though it does.
   */
  it("refuses a zero amount_original for a transfer at the constraint", async () => {
    await scratch.sql.unsafe(`DELETE FROM transactions`);
    await expect(
      scratch.sql`
        INSERT INTO transactions
          (id, date, type, account_id, to_account_id, amount_original, to_amount,
           currency, to_currency, fx_rate, to_fx_rate)
        VALUES
          ('88888888-8888-8888-8888-888888888888', '2026-09-04', 'transfer',
           '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
           0.00, 0.00, 'USD', 'PLN', ${money.pivotPerUnit("1")}, ${money.pivotPerUnit("1")})
      `,
    ).rejects.toThrow(/transactions_amount_positive/);
  });
});
