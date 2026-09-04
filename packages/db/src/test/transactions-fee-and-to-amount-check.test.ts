/**
 * H3 / M5 — `transactions_fee_positive` and `transactions_to_amount_positive`
 * (`0009_transactions_to_amount_and_fee_positive.sql`), broken once each to
 * prove the CHECK actually fires rather than only existing in `schema.ts`.
 * Zod (`packages/core/src/registry/inputs.ts`) refuses the same shapes
 * before a write ever reaches Postgres — this is the guarantee underneath
 * that refusal, exercised the way `CLAUDE.md` asks every constraint to be:
 * "break it once to prove it fires".
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Scratch, scratchDatabase } from "./scratch.ts";

const CURRENCY = { code: "PLN", name: "Polish Zloty", decimals: 2 };
const ACCOUNT = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Bank A · PLN",
  currency: "PLN",
};
const TO_ACCOUNT = {
  id: "00000000-0000-4000-8000-000000000002",
  name: "Cash · PLN",
  currency: "PLN",
};

let scratch: Scratch;

beforeAll(async () => {
  scratch = await scratchDatabase("transactions_fee_to_amount_check");
  await scratch.sql`insert into currencies (code, name, decimals, is_pivot)
    values (${CURRENCY.code}, ${CURRENCY.name}, ${CURRENCY.decimals}, true)`;
  await scratch.sql`insert into accounts (id, name, currency, ownership, is_business, opening_balance, kind)
    values (${ACCOUNT.id}, ${ACCOUNT.name}, ${ACCOUNT.currency}, 'own', false, '0', 'other'),
           (${TO_ACCOUNT.id}, ${TO_ACCOUNT.name}, ${TO_ACCOUNT.currency}, 'own', false, '0', 'other')`;
}, 60_000);

afterAll(async () => {
  await scratch?.drop();
});

/** A minimal, otherwise-valid expense row — every test overrides only `fee`. */
async function insertExpense(fee: string | null) {
  return scratch.sql`insert into transactions
    (id, date, type, account_id, amount_original, currency, fx_rate, fee)
    values (gen_random_uuid(), '2026-08-12', 'expense', ${ACCOUNT.id}, '10.00', ${CURRENCY.code}, '1', ${fee})`;
}

/** A minimal, otherwise-valid transfer row — every test overrides only `to_amount`. */
async function insertTransfer(toAmount: string) {
  return scratch.sql`insert into transactions
    (id, date, type, account_id, to_account_id, amount_original, to_amount, currency, to_currency, fx_rate, to_fx_rate)
    values (gen_random_uuid(), '2026-08-12', 'transfer', ${ACCOUNT.id}, ${TO_ACCOUNT.id}, '10.00', ${toAmount}, ${CURRENCY.code}, ${CURRENCY.code}, '1', '1')`;
}

describe("transactions_fee_positive", () => {
  it("refuses a negative fee", async () => {
    await expect(insertExpense("-1.00")).rejects.toThrow(/transactions_fee_positive/);
  });

  it("refuses a zero fee", async () => {
    await expect(insertExpense("0.00")).rejects.toThrow(/transactions_fee_positive/);
  });

  it("allows a positive fee, and a null one", async () => {
    await expect(insertExpense("2.50")).resolves.toBeDefined();
    await expect(insertExpense(null)).resolves.toBeDefined();
  });
});

describe("transactions_to_amount_positive", () => {
  it("refuses a zero destination amount", async () => {
    await expect(insertTransfer("0.00")).rejects.toThrow(/transactions_to_amount_positive/);
  });

  it("refuses a negative destination amount", async () => {
    await expect(insertTransfer("-4.60")).rejects.toThrow(/transactions_to_amount_positive/);
  });

  it("allows a positive destination amount", async () => {
    await expect(insertTransfer("10.00")).resolves.toBeDefined();
  });
});
