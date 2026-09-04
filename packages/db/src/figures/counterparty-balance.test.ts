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

  it("coalesces debt_amount — a settlement discharges its own currency and amount, never the leg's own", async () => {
    await scratch.sql.unsafe(`
      INSERT INTO currencies (code, name, decimals, is_pivot) VALUES
        ('EUR','Euro',2,false);
      INSERT INTO accounts (id, name, currency, ownership, opening_balance) VALUES
        ('11111111-1111-1111-1111-111111111112','Bank B · PLN','PLN','own',0),
        ('11111111-1111-1111-1111-111111111113','Cash B · EUR','EUR','own',0);
      INSERT INTO counterparties (id, name) VALUES
        ('44444444-4444-4444-4444-444444444445','Counterparty C');
      INSERT INTO transactions
        (id, date, type, account_id, amount_original, currency, fx_rate,
         counterparty_id, counterparty_role)
        VALUES
          -- lent 200 PLN
          ('66666666-6666-6666-6666-666666666667','2026-09-01','expense',
           '11111111-1111-1111-1111-111111111112',200,'PLN',1,
           '44444444-4444-4444-4444-444444444445','debt');
      -- repaid 50 EUR, discharging 214.05 PLN of the debt — debt_currency/debt_amount
      -- name what the settlement actually clears, never what changed hands.
      INSERT INTO transactions
        (id, date, type, account_id, amount_original, currency, fx_rate,
         counterparty_id, counterparty_role, debt_currency, debt_amount)
        VALUES
          ('77777777-7777-7777-7777-777777777778','2026-09-02','income',
           '11111111-1111-1111-1111-111111111113',50,'EUR',1,
           '44444444-4444-4444-4444-444444444445','debt','PLN',214.05);
    `);

    const rows = await counterpartyBalances(scratch.db);
    const forC = rows.filter((r) => r.counterpartyId === "44444444-4444-4444-4444-444444444445");

    // 200 lent, 214.05 discharged — a PLN balance of −14.05, never the
    // 200 − 50 = 150 the un-coalesced leg amount (in the wrong currency) gives.
    expect(forC).toEqual([
      {
        counterpartyId: "44444444-4444-4444-4444-444444444445",
        currency: "PLN",
        balance: "-14.05000000",
      },
    ]);
  });

  it("an archived counterparty AT ZERO is excluded; one with a non-zero balance is not", async () => {
    await scratch.sql.unsafe(`
      INSERT INTO accounts (id, name, currency, ownership, opening_balance) VALUES
        ('11111111-1111-1111-1111-111111111114','Bank C · PLN','PLN','own',0);
      INSERT INTO counterparties (id, name, archived) VALUES
        ('44444444-4444-4444-4444-444444444446','Settled & archived', true),
        ('44444444-4444-4444-4444-444444444447','Open & archived', true);
      INSERT INTO transactions
        (id, date, type, account_id, amount_original, currency, fx_rate,
         counterparty_id, counterparty_role)
        VALUES
          -- Settled & archived: lent 100, repaid 100 — nets to zero.
          ('66666666-6666-6666-6666-666666666668','2026-09-01','expense',
           '11111111-1111-1111-1111-111111111114',100,'PLN',1,
           '44444444-4444-4444-4444-444444444446','debt'),
          ('66666666-6666-6666-6666-666666666669','2026-09-02','income',
           '11111111-1111-1111-1111-111111111114',100,'PLN',1,
           '44444444-4444-4444-4444-444444444446','debt'),
          -- Open & archived: lent 75, never repaid — a non-zero balance
          -- history must still show even though the counterparty is archived.
          ('66666666-6666-6666-6666-666666666670','2026-09-03','expense',
           '11111111-1111-1111-1111-111111111114',75,'PLN',1,
           '44444444-4444-4444-4444-444444444447','debt');
    `);

    const rows = await counterpartyBalances(scratch.db);
    expect(rows.some((r) => r.counterpartyId === "44444444-4444-4444-4444-444444444446")).toBe(
      false,
    );
    expect(rows.filter((r) => r.counterpartyId === "44444444-4444-4444-4444-444444444447")).toEqual(
      [
        {
          counterpartyId: "44444444-4444-4444-4444-444444444447",
          currency: "PLN",
          balance: "75.00000000",
        },
      ],
    );
  });
});
