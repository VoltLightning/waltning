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
});
