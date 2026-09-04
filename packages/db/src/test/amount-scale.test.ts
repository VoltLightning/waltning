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

/**
 * M2 — `fee` (S31 §9.1, `computations.md` §12.2) has no sign of its own to
 * carry; a negative value is a rebate wearing the wrong sign, never a fee.
 * `transactions_fee_positive` (`schema.ts`, hand-added to this migration
 * ahead of `0000_schema.sql`'s own regeneration) is a plain CHECK, so
 * Postgres refuses it with its own `23514` rather than one of ours.
 */
describe("fee carries no sign of its own (M2)", () => {
  it("refuses a negative fee", async () => {
    const id = nextId();
    const code = await refusal(() =>
      s.sql.unsafe(`
        INSERT INTO transactions (id, account_id, date, type, amount_original, currency, fx_rate, fee)
        VALUES ('${id}', '${ACCOUNT}', '2026-01-01', 'expense', 10, 'PLN', 1, -5.00)`),
    );
    expect(code).toBe("23514");
  });

  it("admits a zero fee and a positive one", async () => {
    const zeroId = nextId();
    const zero = await refusal(() =>
      s.sql.unsafe(`
        INSERT INTO transactions (id, account_id, date, type, amount_original, currency, fx_rate, fee)
        VALUES ('${zeroId}', '${ACCOUNT}', '2026-01-01', 'expense', 10, 'PLN', 1, 0)`),
    );
    expect(zero).toBeNull();

    const positiveId = nextId();
    const positive = await refusal(() =>
      s.sql.unsafe(`
        INSERT INTO transactions (id, account_id, date, type, amount_original, currency, fx_rate, fee)
        VALUES ('${positiveId}', '${ACCOUNT}', '2026-01-01', 'expense', 10, 'PLN', 1, 5.00)`),
    );
    expect(positive).toBeNull();
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

/**
 * L3 — the trigger fires `BEFORE INSERT OR UPDATE OF …`; every test above
 * this point only ever drives the INSERT half. An UPDATE that pushes an
 * already-admitted row past its own currency's scale is the same guarantee,
 * reached the other way in.
 */
describe("the same guarantee, reached by UPDATE (L3)", () => {
  it("refuses UPDATE … SET fee = 0.125 on a PLN row (WA016)", async () => {
    const id = nextId();
    await s.sql.unsafe(`
      INSERT INTO transactions (id, account_id, date, type, amount_original, currency, fx_rate)
      VALUES ('${id}', '${ACCOUNT}', '2026-01-01', 'expense', 10, 'PLN', 1)`);
    const code = await refusal(() =>
      s.sql.unsafe(`UPDATE transactions SET fee = 0.125 WHERE id = '${id}'`),
    );
    expect(code, "0.125 against PLN's two decimal places must be refused").toBe("WA016");
  });

  it("refuses UPDATE … SET currency = 'JPY' over a two-decimal amount (WA016)", async () => {
    const id = nextId();
    await s.sql.unsafe(`
      INSERT INTO transactions (id, account_id, date, type, amount_original, currency, fx_rate)
      VALUES ('${id}', '${JPY_ACCOUNT}', '2026-01-01', 'expense', 10, 'JPY', 1)`);
    // Written directly, not through `accounts_currency_matches_account` —
    // this row's own currency is what the scale trigger reads, and it fires
    // before that guard would even be reached for a mismatched account.
    const code = await refusal(() =>
      s.sql.unsafe(`UPDATE transactions SET currency = 'JPY' WHERE id = '${id}'`),
    );
    // A whole-yen amount already fits JPY's own zero decimal places —
    // re-asserts nothing changed for the row admitted above, then the
    // mismatched-scale row right after it is the one that must refuse.
    expect(code).toBeNull();

    const plnId = nextId();
    await s.sql.unsafe(`
      INSERT INTO transactions (id, account_id, date, type, amount_original, currency, fx_rate)
      VALUES ('${plnId}', '${ACCOUNT}', '2026-01-01', 'expense', 10.50, 'PLN', 1)`);
    const refused = await refusal(() =>
      s.sql.unsafe(`UPDATE transactions SET currency = 'JPY' WHERE id = '${plnId}'`),
    );
    expect(refused, "10.50 does not fit JPY's zero decimal places").toBe("WA016");
  });

  it("refuses UPDATE debt_reassignments … SET currency = 'JPY' over a two-decimal amount (WA016)", async () => {
    const id = nextId();
    await s.sql.unsafe(`
      INSERT INTO debt_reassignments (id, date, from_counterparty_id, to_counterparty_id, currency, amount)
      VALUES ('${id}', '2026-01-01', '${NINA}', '${MAREK}', 'PLN', 10.50)`);
    const code = await refusal(() =>
      s.sql.unsafe(`UPDATE debt_reassignments SET currency = 'JPY' WHERE id = '${id}'`),
    );
    expect(code, "10.50 does not fit JPY's zero decimal places").toBe("WA016");
  });
});

/** H3 — `transaction_lines.amount` carries no currency of its own; checked against its parent's. */
describe("a split line's own amount fits its parent transaction's currency scale", () => {
  it("refuses three decimal places on a line, checked against the parent's currency (WA016)", async () => {
    const txnId = nextId();
    await s.sql.unsafe(`
      INSERT INTO transactions (id, account_id, date, type, amount_original, currency, fx_rate)
      VALUES ('${txnId}', '${ACCOUNT}', '2026-01-01', 'expense', 10, 'PLN', 1)`);
    const lineId = nextId();
    const code = await refusal(() =>
      s.sql.unsafe(`
        INSERT INTO transaction_lines (id, transaction_id, description, amount)
        VALUES ('${lineId}', '${txnId}', 'Placeholder line', 4.905)`),
    );
    expect(code, "4.905 against PLN's two decimal places must be refused").toBe("WA016");
  });

  it("admits a line at exactly the parent's own currency scale", async () => {
    const txnId = nextId();
    // The line's own amount matches the parent's total exactly — `transaction_lines_sum_matches`
    // (WA015, deferred to COMMIT) is a separate guarantee this test does not
    // exist to exercise, so it is kept satisfied rather than incidentally tripped.
    await s.sql.unsafe(`
      INSERT INTO transactions (id, account_id, date, type, amount_original, currency, fx_rate)
      VALUES ('${txnId}', '${ACCOUNT}', '2026-01-01', 'expense', 4.90, 'PLN', 1)`);
    const lineId = nextId();
    const code = await refusal(() =>
      s.sql.unsafe(`
        INSERT INTO transaction_lines (id, transaction_id, description, amount)
        VALUES ('${lineId}', '${txnId}', 'Placeholder line', 4.90)`),
    );
    expect(code).toBeNull();
  });

  it("refuses an UPDATE that pushes a line's amount past its parent's scale (WA016, L3)", async () => {
    const txnId = nextId();
    await s.sql.unsafe(`
      INSERT INTO transactions (id, account_id, date, type, amount_original, currency, fx_rate)
      VALUES ('${txnId}', '${ACCOUNT}', '2026-01-01', 'expense', 4.90, 'PLN', 1)`);
    const lineId = nextId();
    await s.sql.unsafe(`
      INSERT INTO transaction_lines (id, transaction_id, description, amount)
      VALUES ('${lineId}', '${txnId}', 'Placeholder line', 4.90)`);
    // Still refused by the scale trigger (immediate) before the sum trigger
    // (deferred to COMMIT, and now mismatched too) is ever reached.
    const code = await refusal(() =>
      s.sql.unsafe(`UPDATE transaction_lines SET amount = 4.905 WHERE id = '${lineId}'`),
    );
    expect(code).toBe("WA016");
  });
});

/**
 * M1 — four more money columns with a sibling currency, unguarded until now:
 * `accounts.opening_balance`/`expected_balance` (against the same row's own
 * `currency`), `recurring_transactions.amount_original`, `targets.amount`
 * and `receipts.total` (each against its own `currency`).
 */
describe("an account's own balances fit its own currency's scale (M1)", () => {
  it("refuses an opening_balance past the account's own currency scale (WA016)", async () => {
    const id = nextId();
    const code = await refusal(() =>
      s.sql.unsafe(`
        INSERT INTO accounts (id, name, kind, currency, ownership, opening_balance)
        VALUES ('${id}', 'Placeholder ${id}', 'bank', 'PLN', 'own', 48.905)`),
    );
    expect(code, "48.905 against PLN's two decimal places must be refused").toBe("WA016");
  });

  it("refuses an expected_balance past the account's own currency scale (WA016)", async () => {
    const id = nextId();
    const code = await refusal(() =>
      s.sql.unsafe(`
        INSERT INTO accounts (id, name, kind, currency, ownership, expected_balance)
        VALUES ('${id}', 'Placeholder ${id}', 'bank', 'PLN', 'own', 48.905)`),
    );
    expect(code, "48.905 against PLN's two decimal places must be refused").toBe("WA016");
  });

  it("admits balances at exactly the account's own currency scale", async () => {
    const id = nextId();
    const code = await refusal(() =>
      s.sql.unsafe(`
        INSERT INTO accounts (id, name, kind, currency, ownership, opening_balance, expected_balance)
        VALUES ('${id}', 'Placeholder ${id}', 'bank', 'PLN', 'own', 48.90, 48.90)`),
    );
    expect(code).toBeNull();
  });

  it("refuses an UPDATE that pushes opening_balance past the account's own scale (WA016, L3)", async () => {
    const id = nextId();
    await s.sql.unsafe(`
      INSERT INTO accounts (id, name, kind, currency, ownership, opening_balance)
      VALUES ('${id}', 'Placeholder ${id}', 'bank', 'PLN', 'own', 48.90)`);
    const code = await refusal(() =>
      s.sql.unsafe(`UPDATE accounts SET opening_balance = 48.905 WHERE id = '${id}'`),
    );
    expect(code).toBe("WA016");
  });
});

describe("a recurring transaction's own amount fits its own currency's scale (M1)", () => {
  it("refuses three decimal places on amount_original (WA016)", async () => {
    const id = nextId();
    const code = await refusal(() =>
      s.sql.unsafe(`
        INSERT INTO recurring_transactions (id, type, account_id, amount_original, currency, rrule)
        VALUES ('${id}', 'expense', '${ACCOUNT}', 48.905, 'PLN', 'FREQ=MONTHLY')`),
    );
    expect(code, "48.905 against PLN's two decimal places must be refused").toBe("WA016");
  });

  it("admits an amount at exactly its own currency's scale", async () => {
    const id = nextId();
    const code = await refusal(() =>
      s.sql.unsafe(`
        INSERT INTO recurring_transactions (id, type, account_id, amount_original, currency, rrule)
        VALUES ('${id}', 'expense', '${ACCOUNT}', 48.90, 'PLN', 'FREQ=MONTHLY')`),
    );
    expect(code).toBeNull();
  });
});

describe("a target's own amount fits its own currency's scale (M1)", () => {
  it("refuses three decimal places on amount (WA016)", async () => {
    const id = nextId();
    const code = await refusal(() =>
      s.sql.unsafe(`
        INSERT INTO targets (id, amount, currency, active_from)
        VALUES ('${id}', 48.905, 'PLN', '2026-01-01')`),
    );
    expect(code, "48.905 against PLN's two decimal places must be refused").toBe("WA016");
  });

  it("admits an amount at exactly its own currency's scale", async () => {
    const id = nextId();
    const code = await refusal(() =>
      s.sql.unsafe(`
        INSERT INTO targets (id, amount, currency, active_from)
        VALUES ('${id}', 48.90, 'PLN', '2026-01-01')`),
    );
    expect(code).toBeNull();
  });
});

describe("a receipt's own total fits its own currency's scale (M1)", () => {
  it("refuses three decimal places on total (WA016)", async () => {
    const id = nextId();
    const code = await refusal(() =>
      s.sql.unsafe(`
        INSERT INTO receipts (id, image_key, total, currency)
        VALUES ('${id}', 'placeholder-key', 48.905, 'PLN')`),
    );
    expect(code, "48.905 against PLN's two decimal places must be refused").toBe("WA016");
  });

  it("admits a receipt with neither total nor currency set yet", async () => {
    const id = nextId();
    const code = await refusal(() =>
      s.sql.unsafe(`INSERT INTO receipts (id, image_key) VALUES ('${id}', 'placeholder-key')`),
    );
    expect(code).toBeNull();
  });

  it("admits a total at exactly its own currency's scale", async () => {
    const id = nextId();
    const code = await refusal(() =>
      s.sql.unsafe(`
        INSERT INTO receipts (id, image_key, total, currency)
        VALUES ('${id}', 'placeholder-key', 48.90, 'PLN')`),
    );
    expect(code).toBeNull();
  });
});

/**
 * C1 — `currencies.decimals` cannot be lowered while a row it governs would
 * come out past the new, smaller scale. Widening (or leaving it unchanged)
 * always passes; a lowering is checked against every table H2/H3/M1 cover.
 */
describe("a currency's own decimals cannot be lowered under an existing row (C1, WA018)", () => {
  it("refuses lowering decimals under a transaction's own amount_original", async () => {
    await s.sql.unsafe(
      `INSERT INTO currencies (code, name, decimals) VALUES ('XAA', 'Placeholder', 8)`,
    );
    const id = nextId();
    await s.sql.unsafe(`
      INSERT INTO accounts (id, name, kind, currency, ownership) VALUES ('${id}', 'Placeholder ${id}', 'bank', 'XAA', 'own')`);
    const txnId = nextId();
    await s.sql.unsafe(`
      INSERT INTO transactions (id, account_id, date, type, amount_original, currency, fx_rate)
      VALUES ('${txnId}', '${id}', '2026-01-01', 'expense', 48.90512340, 'XAA', 1)`);

    const code = await refusal(() =>
      s.sql.unsafe(`UPDATE currencies SET decimals = 2 WHERE code = 'XAA'`),
    );
    expect(code, "a row still holds 8 decimal places — lowering to 2 must be refused").toBe(
      "WA018",
    );
  });

  it("admits raising decimals while the same row still holds it", async () => {
    await s.sql.unsafe(
      `INSERT INTO currencies (code, name, decimals) VALUES ('XAB', 'Placeholder', 2)`,
    );
    const code = await refusal(() =>
      s.sql.unsafe(`UPDATE currencies SET decimals = 8 WHERE code = 'XAB'`),
    );
    expect(code).toBeNull();
  });

  it("admits lowering decimals once nothing holds a figure past the new scale", async () => {
    await s.sql.unsafe(
      `INSERT INTO currencies (code, name, decimals) VALUES ('XAC', 'Placeholder', 8)`,
    );
    const id = nextId();
    await s.sql.unsafe(`
      INSERT INTO accounts (id, name, kind, currency, ownership) VALUES ('${id}', 'Placeholder ${id}', 'bank', 'XAC', 'own')`);
    const txnId = nextId();
    await s.sql.unsafe(`
      INSERT INTO transactions (id, account_id, date, type, amount_original, currency, fx_rate)
      VALUES ('${txnId}', '${id}', '2026-01-01', 'expense', 48.90, 'XAC', 1)`);

    const code = await refusal(() =>
      s.sql.unsafe(`UPDATE currencies SET decimals = 2 WHERE code = 'XAC'`),
    );
    expect(code).toBeNull();
  });
});
