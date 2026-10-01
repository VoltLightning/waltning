/**
 * §7.8 — an entry made in another currency than its account's: `350 CZK` paid
 * with a EUR card is stored as the account-side figure (`amount_original` in
 * `currency`, what the account was charged) beside `paid_amount` /
 * `paid_currency` (what was handed over).
 *
 * What is proven here is the half only Postgres can: the account-side figure
 * is untouched (WA003 still binds `currency` to the account's), the paid
 * figure fits *its own* currency's decimals (WA016, with its own trigger) and
 * a currency's decimals cannot be lowered under one (WA018). The shape CHECKs
 * (`transactions_paid_*`) are broken once in `check-validated.test.ts`.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Scratch, scratchDatabase } from "./scratch.ts";

let s: Scratch;

const EUR_ACCOUNT = "11111111-1111-1111-1111-111111111111";

beforeAll(async () => {
  s = await scratchDatabase("foreignspend");
  // Placeholder data only. EUR is the pivot and holds two decimals; CZK holds
  // two; JPY none — so a paid figure in JPY exercises the paid currency's own
  // scale rather than the account's.
  await s.sql.unsafe(`
    INSERT INTO currencies (code, name, is_pivot, decimals) VALUES ('EUR', 'Euro', true, 2);
    INSERT INTO currencies (code, name, decimals) VALUES ('CZK', 'Koruna', 2);
    INSERT INTO currencies (code, name, decimals) VALUES ('JPY', 'Yen', 0);
    INSERT INTO accounts (id, name, kind, currency, ownership)
      VALUES ('${EUR_ACCOUNT}', 'Bank A · EUR', 'bank', 'EUR', 'own');`);
}, 60_000);

afterAll(async () => {
  await s?.drop();
});

async function refusal(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error: unknown) {
    // The driver's error carries the code; `catch` gives no choice about the
    // binding's type, which is one of the few legitimate uses of `unknown`.
    return (error as { code?: string }).code ?? "unknown";
  }
}

let n = 0;
function nextId(): string {
  return `22222222-2222-2222-2222-${String(++n).padStart(12, "0")}`;
}

function insertEntry(extra: string, values: string): Promise<unknown> {
  return s.sql.unsafe(`
    INSERT INTO transactions
      (id, account_id, date, type, amount_original, currency, fx_rate${extra})
    VALUES ('${nextId()}', '${EUR_ACCOUNT}', '2026-01-01', 'expense', 14.02, 'EUR', 1${values})`);
}

describe("an entry paid in another currency than its account's", () => {
  it("stores the charged figure and the paid figure side by side", async () => {
    const id = nextId();
    await s.sql.unsafe(`
      INSERT INTO transactions
        (id, account_id, date, type, amount_original, currency, fx_rate, paid_amount, paid_currency)
      VALUES ('${id}', '${EUR_ACCOUNT}', '2026-01-01', 'expense', 14.02, 'EUR', 1, 350, 'CZK')`);
    const [row] = await s.sql.unsafe(
      `SELECT amount_original::text AS charged, currency, paid_amount::text AS paid, paid_currency
         FROM transactions WHERE id = '${id}'`,
    );
    expect(row).toEqual({
      charged: "14.02000000",
      currency: "EUR",
      paid: "350.00000000",
      paid_currency: "CZK",
    });
  });

  it("still refuses an account-side currency that is not the account's (WA003)", async () => {
    const code = await refusal(() =>
      s.sql.unsafe(`
        INSERT INTO transactions
          (id, account_id, date, type, amount_original, currency, fx_rate, paid_amount, paid_currency)
        VALUES ('${nextId()}', '${EUR_ACCOUNT}', '2026-01-01', 'expense', 350, 'CZK', 1, 14.02, 'EUR')`),
    );
    expect(code, "the charged figure is in the account's currency, whatever was paid").toBe(
      "WA003",
    );
  });
});

describe("a paid figure fits its own currency's scale (WA016)", () => {
  it("refuses a figure past the paid currency's decimals", async () => {
    const code = await refusal(() =>
      insertEntry(", paid_amount, paid_currency", ", 350.005, 'CZK'"),
    );
    expect(code, "350.005 against CZK's two decimal places must be refused").toBe("WA016");
  });

  it("scales the paid figure by the paid currency, not the account's", async () => {
    // JPY holds none, so 350.50 is past its scale even though the account's
    // own currency (EUR) would have taken it.
    const code = await refusal(() =>
      insertEntry(", paid_amount, paid_currency", ", 350.50, 'JPY'"),
    );
    expect(code).toBe("WA016");
    const ok = await refusal(() => insertEntry(", paid_amount, paid_currency", ", 350, 'JPY'"));
    expect(ok).toBeNull();
  });

  it("re-checks the scale when the paid figure is edited", async () => {
    const id = nextId();
    await s.sql.unsafe(`
      INSERT INTO transactions
        (id, account_id, date, type, amount_original, currency, fx_rate, paid_amount, paid_currency)
      VALUES ('${id}', '${EUR_ACCOUNT}', '2026-01-01', 'expense', 14.02, 'EUR', 1, 350, 'CZK')`);
    const code = await refusal(() =>
      s.sql.unsafe(`UPDATE transactions SET paid_amount = 350.125 WHERE id = '${id}'`),
    );
    expect(code).toBe("WA016");
  });
});

describe("a currency's decimals cannot be lowered under a paid figure (WA018)", () => {
  it("refuses the shrink", async () => {
    await s.sql.unsafe(
      `INSERT INTO currencies (code, name, decimals) VALUES ('XPD', 'Placeholder', 8)`,
    );
    await s.sql.unsafe(`
      INSERT INTO transactions
        (id, account_id, date, type, amount_original, currency, fx_rate, paid_amount, paid_currency)
      VALUES ('${nextId()}', '${EUR_ACCOUNT}', '2026-01-01', 'expense', 14.02, 'EUR', 1,
              48.90512340, 'XPD')`);
    const code = await refusal(() =>
      s.sql.unsafe(`UPDATE currencies SET decimals = 2 WHERE code = 'XPD'`),
    );
    expect(code, "an entry still holds 8 decimal places of XPD — lowering must be refused").toBe(
      "WA018",
    );
  });
});
