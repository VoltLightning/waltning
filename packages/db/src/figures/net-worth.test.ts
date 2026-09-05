import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Scratch, scratchDatabase } from "../test/scratch.ts";
import { netWorth } from "./net-worth.ts";

describe("net worth — §3, in SQL", () => {
  let scratch: Scratch;
  beforeAll(async () => {
    scratch = await scratchDatabase("networth");
  });
  afterAll(async () => {
    await scratch.drop();
  });

  it("mine over own accounts, ours over all, per currency, business in mine", async () => {
    // Transactions on every account, deliberately: an opening-balance-only
    // fixture cannot tell "folds the ledger" from "returns the opening
    // balance and ignores every row" — which is exactly the bug this test
    // once passed while carrying (see the comment on `accountId` in
    // net-worth.ts). Bank A -30 (expense) -5 (transfer out), Biz +10
    // (income), Household +5 (transfer in).
    await scratch.sql.unsafe(`
      INSERT INTO currencies (code, name, decimals, is_pivot) VALUES ('PLN','Polish Zloty',2,true);
      INSERT INTO accounts (id, name, currency, ownership, is_business, opening_balance)
        VALUES
          ('11111111-1111-1111-1111-111111111111','Bank A · PLN','PLN','own',false,100),
          ('22222222-2222-2222-2222-222222222222','Biz · PLN','PLN','own',true,-20),
          ('33333333-3333-3333-3333-333333333333','Household · PLN','PLN','shared',false,50);
      INSERT INTO transactions
        (id, date, type, account_id, to_account_id, amount_original, to_amount, currency, to_currency, fx_rate, to_fx_rate)
        VALUES
          ('44444444-4444-4444-4444-444444444444','2026-09-01','expense','11111111-1111-1111-1111-111111111111',NULL,30,NULL,'PLN',NULL,1,NULL),
          ('55555555-5555-5555-5555-555555555555','2026-09-01','income','22222222-2222-2222-2222-222222222222',NULL,10,NULL,'PLN',NULL,1,NULL),
          ('66666666-6666-6666-6666-666666666666','2026-09-02','transfer','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',5,5,'PLN','PLN',1,1);
    `);
    const rows = await netWorth(scratch.db);
    // Bank A: 100 − 30 − 5 = 65. Biz: −20 + 10 = −10. Household: 50 + 5 = 55.
    // mine = 65 + (−10) = 55. ours = 65 + (−10) + 55 = 110.
    expect(rows).toEqual([{ currency: "PLN", mine: "55.00000000", ours: "110.00000000" }]);
  });

  /**
   * Proves: computations.md §3 ("Receivables are excluded — lending is an
   * expense and repayment an unearned inflow (§6.6). Net worth is money you
   * hold."). H1 — break it once by dropping `ne(accounts.kind,
   * "loan_receivable")` from the `where` clause: this goes from `100` to
   * `160`, the receivable's opening balance counted as held money on top of
   * the cash that actually left `Wallet` to lend it.
   */
  it("excludes a loan_receivable account from both mine and ours (§3)", async () => {
    // `is_pivot` is false — the first test already claimed the one pivot
    // slot (`currencies_one_pivot`) in this shared scratch database.
    await scratch.sql.unsafe(`
      INSERT INTO currencies (code, name, decimals, is_pivot) VALUES ('USD','US Dollar',2,false);
      INSERT INTO accounts (id, name, currency, kind, ownership, opening_balance)
        VALUES
          ('77777777-7777-7777-7777-777777777777','Wallet · USD','USD','cash','own',100),
          ('88888888-8888-8888-8888-888888888888','Loan to Nina','USD','loan_receivable','own',60);
    `);
    const rows = await netWorth(scratch.db);
    expect(rows).toEqual(
      expect.arrayContaining([{ currency: "USD", mine: "100.00000000", ours: "100.00000000" }]),
    );
  });

  /** A `loan_payable` is a real liability, so it stays in — unlike a receivable, it is not excluded. */
  it("keeps a loan_payable account — a debt owed is a real liability", async () => {
    await scratch.sql.unsafe(`
      INSERT INTO currencies (code, name, decimals, is_pivot) VALUES ('GBP','Pound Sterling',2,false);
      INSERT INTO accounts (id, name, currency, kind, ownership, opening_balance)
        VALUES
          ('99999999-9999-9999-9999-999999999999','Wallet · GBP','GBP','cash','own',100),
          ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Loan from Marek (my)','GBP','loan_payable','own',-40);
    `);
    const rows = await netWorth(scratch.db);
    expect(rows).toEqual(
      expect.arrayContaining([{ currency: "GBP", mine: "60.00000000", ours: "60.00000000" }]),
    );
  });
});
