/**
 * H2 — a transaction cannot hold more decimal places than its own currency,
 * in any of the four amount/currency pairs it can carry: `amount_original`
 * (every row), `to_amount` (a transfer's destination leg, §7.5), `debt_amount`
 * (S14's settlement coalesce), and `fee` (S31 §9.1, checked against the row's
 * own `currency` rather than a sibling column). `debt_reassignments.amount`
 * (§6.6a) carries the same guarantee outside `transactions` entirely.
 *
 * `create-phone-ledger.ts`'s controller already refuses this before a write
 * ever leaves the phone (`transactions.tooManyDecimals`), but a client-side
 * refusal is not a guarantee (`CLAUDE.md`: "New guarantee → new
 * constraint"). `0012_transaction_scale_and_category_kind.sql` is that
 * constraint; this is what breaks it once to prove it fires.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Scratch, scratchDatabase } from "./scratch.ts";

let s: Scratch;

const ACCOUNT = "11111111-1111-1111-1111-111111111111";

const JPY_ACCOUNT = "33333333-3333-3333-3333-333333333333";

/** The transfer destination leg's own account — a second currency, USD. */
const USD_ACCOUNT = "44444444-4444-4444-4444-444444444444";

/** `debt_reassignments`' own pair — placeholder names only. */
const NINA = "55555555-5555-5555-5555-555555555555";
const MAREK = "66666666-6666-6666-6666-666666666666";

beforeAll(async () => {
  s = await scratchDatabase("amountscale");
  // Placeholder data only — an invented bank in an invented currency.
  // PLN holds two decimal places; JPY, zero — SPEC.md's own reference set.
  await s.sql.unsafe(`
    INSERT INTO currencies (code, name, is_pivot, decimals) VALUES ('PLN', 'Zloty', true, 2);
    INSERT INTO currencies (code, name, decimals) VALUES ('JPY', 'Yen', 0);
    INSERT INTO currencies (code, name, decimals) VALUES ('USD', 'Dollar', 2);
    INSERT INTO accounts (id, name, kind, currency, ownership)
      VALUES ('${ACCOUNT}', 'Bank A · PLN', 'bank', 'PLN', 'own');
    INSERT INTO accounts (id, name, kind, currency, ownership)
      VALUES ('${JPY_ACCOUNT}', 'Bank A · JPY', 'bank', 'JPY', 'own');
    INSERT INTO accounts (id, name, kind, currency, ownership)
      VALUES ('${USD_ACCOUNT}', 'Bank B · USD', 'bank', 'USD', 'own');
    INSERT INTO counterparties (id, name) VALUES ('${NINA}', 'Nina');
    INSERT INTO counterparties (id, name) VALUES ('${MAREK}', 'Marek');`);
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

  /** M — the trigger used to check `amount_original` only; extended to `to_amount`. */
  it("refuses three decimal places on to_amount, the transfer's destination leg (WA016)", async () => {
    const id = nextId();
    const code = await refusal(() =>
      s.sql.unsafe(`
        INSERT INTO transactions
          (id, account_id, to_account_id, date, type,
           amount_original, currency, to_amount, to_currency, fx_rate, to_fx_rate)
        VALUES
          ('${id}', '${ACCOUNT}', '${USD_ACCOUNT}', '2026-01-01', 'transfer',
           48.90, 'PLN', 10.125, 'USD', 0.25, 1)`),
    );
    expect(code, "10.125 against USD's two decimal places must be refused").toBe("WA016");
  });

  it("admits to_amount at exactly the destination currency's own scale", async () => {
    const id = nextId();
    const code = await refusal(() =>
      s.sql.unsafe(`
        INSERT INTO transactions
          (id, account_id, to_account_id, date, type,
           amount_original, currency, to_amount, to_currency, fx_rate, to_fx_rate)
        VALUES
          ('${id}', '${ACCOUNT}', '${USD_ACCOUNT}', '2026-01-01', 'transfer',
           48.90, 'PLN', 10.12, 'USD', 0.25, 1)`),
    );
    expect(code).toBeNull();
  });

  /** M — extended to `debt_amount`, S14's settlement coalesce. */
  it("refuses three decimal places on debt_amount (WA016)", async () => {
    const id = nextId();
    const code = await refusal(() =>
      s.sql.unsafe(`
        INSERT INTO transactions
          (id, account_id, date, type, amount_original, currency, fx_rate,
           debt_currency, debt_amount)
        VALUES
          ('${id}', '${ACCOUNT}', '2026-01-01', 'expense', 10, 'PLN', 1,
           'PLN', 10.125)`),
    );
    expect(code, "10.125 against PLN's two decimal places must be refused").toBe("WA016");
  });

  it("admits debt_amount at exactly its own currency's scale", async () => {
    const id = nextId();
    const code = await refusal(() =>
      s.sql.unsafe(`
        INSERT INTO transactions
          (id, account_id, date, type, amount_original, currency, fx_rate,
           debt_currency, debt_amount)
        VALUES
          ('${id}', '${ACCOUNT}', '2026-01-01', 'expense', 10, 'PLN', 1,
           'PLN', 10.12)`),
    );
    expect(code).toBeNull();
  });

  /**
   * M — `fee` (S31 §9.1) carries no currency column of its own; it is
   * always the row's own `currency`, so the trigger checks it against that
   * rather than a sibling.
   */
  it("refuses three decimal places on fee, checked against the row's own currency (WA016)", async () => {
    const id = nextId();
    const code = await refusal(() =>
      s.sql.unsafe(`
        INSERT INTO transactions (id, account_id, date, type, amount_original, currency, fx_rate, fee)
        VALUES ('${id}', '${ACCOUNT}', '2026-01-01', 'expense', 10, 'PLN', 1, 0.125)`),
    );
    expect(code, "0.125 against PLN's two decimal places must be refused").toBe("WA016");
  });

  it("admits fee at exactly the row's own currency's scale", async () => {
    const id = nextId();
    const code = await refusal(() =>
      s.sql.unsafe(`
        INSERT INTO transactions (id, account_id, date, type, amount_original, currency, fx_rate, fee)
        VALUES ('${id}', '${ACCOUNT}', '2026-01-01', 'expense', 10, 'PLN', 1, 0.12)`),
    );
    expect(code).toBeNull();
  });
});

/** M — `debt_reassignments.amount` (§6.6a) carries the same guarantee, outside `transactions` entirely. */
describe("a debt reassignment's amount fits its own currency's scale", () => {
  it("refuses three decimal places on amount (WA016)", async () => {
    const id = nextId();
    const code = await refusal(() =>
      s.sql.unsafe(`
        INSERT INTO debt_reassignments (id, date, from_counterparty_id, to_counterparty_id, currency, amount)
        VALUES ('${id}', '2026-01-01', '${NINA}', '${MAREK}', 'PLN', 48.905)`),
    );
    expect(code, "48.905 against PLN's two decimal places must be refused").toBe("WA016");
  });

  it("admits an amount at exactly its own currency's scale", async () => {
    const id = nextId();
    const code = await refusal(() =>
      s.sql.unsafe(`
        INSERT INTO debt_reassignments (id, date, from_counterparty_id, to_counterparty_id, currency, amount)
        VALUES ('${id}', '2026-01-01', '${NINA}', '${MAREK}', 'PLN', 48.90)`),
    );
    expect(code).toBeNull();
  });
});
