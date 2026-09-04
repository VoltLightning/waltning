/**
 * H2 — a transaction cannot hold more decimal places than its own currency.
 *
 * `create-phone-ledger.ts`'s controller already refuses this before a write
 * ever leaves the phone (`transactions.tooManyDecimals`), but a client-side
 * refusal is not a guarantee (`CLAUDE.md`: "New guarantee → new
 * constraint"). `0011_transaction_amount_scale.sql` is that constraint; this
 * is what breaks it once to prove it fires.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Scratch, scratchDatabase } from "./scratch.ts";

let s: Scratch;

const ACCOUNT = "11111111-1111-1111-1111-111111111111";

const JPY_ACCOUNT = "33333333-3333-3333-3333-333333333333";

beforeAll(async () => {
  s = await scratchDatabase("amountscale");
  // Placeholder data only — an invented bank in an invented currency.
  // PLN holds two decimal places; JPY, zero — SPEC.md's own reference set.
  await s.sql.unsafe(`
    INSERT INTO currencies (code, name, is_pivot, decimals) VALUES ('PLN', 'Zloty', true, 2);
    INSERT INTO currencies (code, name, decimals) VALUES ('JPY', 'Yen', 0);
    INSERT INTO accounts (id, name, kind, currency, ownership)
      VALUES ('${ACCOUNT}', 'Bank A · PLN', 'bank', 'PLN', 'own');
    INSERT INTO accounts (id, name, kind, currency, ownership)
      VALUES ('${JPY_ACCOUNT}', 'Bank A · JPY', 'bank', 'JPY', 'own');`);
}, 60_000);

afterAll(async () => {
  await s?.drop();
});

/** The SQLSTATE, if the statement was refused by one of ours. */
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

describe("a transaction's amount fits its currency's own scale", () => {
  it("refuses three decimal places on a currency that holds two (WA016)", async () => {
    const id = nextId();
    const code = await refusal(() =>
      s.sql.unsafe(`
        INSERT INTO transactions (id, account_id, date, type, amount_original, currency, fx_rate)
        VALUES ('${id}', '${ACCOUNT}', '2026-01-01', 'expense', 48.905, 'PLN', 0.25)`),
    );
    expect(code, "48.905 against PLN's two decimal places must be refused").toBe("WA016");
  });

  it("admits an amount at exactly the currency's own scale", async () => {
    const id = nextId();
    const code = await refusal(() =>
      s.sql.unsafe(`
        INSERT INTO transactions (id, account_id, date, type, amount_original, currency, fx_rate)
        VALUES ('${id}', '${ACCOUNT}', '2026-01-01', 'expense', 48.90, 'PLN', 0.25)`),
    );
    expect(code).toBeNull();
  });

  it("admits fewer decimal places than the currency allows", async () => {
    const id = nextId();
    const code = await refusal(() =>
      s.sql.unsafe(`
        INSERT INTO transactions (id, account_id, date, type, amount_original, currency, fx_rate)
        VALUES ('${id}', '${ACCOUNT}', '2026-01-01', 'expense', 48, 'PLN', 0.25)`),
    );
    expect(code).toBeNull();
  });

  /**
   * The stored column is `numeric(20,8)` regardless of currency — a bare
   * `scale(amount_original)` would read 8 on every row and this guarantee
   * would refuse nothing. `trim_scale` is what makes the check answer the
   * right question; this pins that a whole-yen amount, padded to eight
   * places by the column type, is not mistaken for one that carries eight
   * genuine decimals.
   */
  it("does not mistake the column's own padding for real decimal places", async () => {
    const id = nextId();
    const code = await refusal(() =>
      s.sql.unsafe(`
        INSERT INTO transactions (id, account_id, date, type, amount_original, currency, fx_rate)
        VALUES ('${id}', '${JPY_ACCOUNT}', '2026-01-01', 'expense', 500, 'JPY', 0.02)`),
    );
    // JPY holds zero decimal places; 500 (padded to 500.00000000 by the
    // column) has none either. This is the row `scale()` alone would flag by
    // mistake, and `trim_scale` is what keeps it admitted.
    expect(code).toBeNull();
  });
});
