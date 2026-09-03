import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Scratch, scratchDatabase } from "../test/scratch.ts";
import { counterpartyBalances } from "./counterparty-balance.ts";

describe("counterparty balance — §7, in SQL", () => {
  let scratch: Scratch;
  beforeAll(async () => {
    scratch = await scratchDatabase("counterpartybalance");
  });
  afterAll(async () => {
    await scratch.drop();
  });

  it("negates the cash flow on the leg that carries the counterparty, split by currency", async () => {
    await scratch.sql.unsafe(`
      INSERT INTO currencies (code, name, decimals, is_pivot) VALUES
        ('PLN','Polish Zloty',2,true), ('USD','US Dollar',2,false);
      INSERT INTO accounts (id, name, currency, ownership, opening_balance) VALUES
        ('11111111-1111-1111-1111-111111111111','Bank A · PLN','PLN','own',0),
        ('22222222-2222-2222-2222-222222222222','Household · PLN','PLN','shared',0),
        ('33333333-3333-3333-3333-333333333333','Cash · USD','USD','own',0);
      INSERT INTO counterparties (id, name) VALUES
        ('44444444-4444-4444-4444-444444444444','Counterparty A'),
        ('55555555-5555-5555-5555-555555555555','Counterparty B');
      INSERT INTO transactions
        (id, date, type, account_id, to_account_id, amount_original, to_amount,
         currency, to_currency, fx_rate, to_fx_rate, counterparty_id, counterparty_role)
        VALUES
          -- Counterparty A, lent 200 PLN (expense, single leg)
          ('66666666-6666-6666-6666-666666666666','2026-09-01','expense',
           '11111111-1111-1111-1111-111111111111',NULL,200,NULL,'PLN',NULL,1,NULL,
           '44444444-4444-4444-4444-444444444444','debt'),
          -- Counterparty A, repaid 50 PLN as a transfer into Bank A
          ('77777777-7777-7777-7777-777777777777','2026-09-02','transfer',
           '22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',
           50,50,'PLN','PLN',1,1,
           '44444444-4444-4444-4444-444444444444','debt'),
          -- Counterparty A, ALSO lent 30 USD — a different currency, must not
          -- net against the PLN rows above into one combined figure.
          ('88888888-8888-8888-8888-888888888888','2026-09-03','expense',
           '33333333-3333-3333-3333-333333333333',NULL,30,NULL,'USD',NULL,1,NULL,
           '44444444-4444-4444-4444-444444444444','debt'),
          -- Counterparty B, a contribution — excluded structurally, never a debt.
          ('99999999-9999-9999-9999-999999999999','2026-09-04','expense',
           '11111111-1111-1111-1111-111111111111',NULL,999,NULL,'PLN',NULL,1,NULL,
           '55555555-5555-5555-5555-555555555555','contribution');
    `);

    const rows = await counterpartyBalances(scratch.db);

    expect(rows).toEqual([
      {
        counterpartyId: "44444444-4444-4444-4444-444444444444",
        currency: "PLN",
        balance: "150.00000000",
      },
      {
        counterpartyId: "44444444-4444-4444-4444-444444444444",
        currency: "USD",
        balance: "30.00000000",
      },
    ]);
  });
});
