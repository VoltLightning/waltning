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
    await scratch.sql.unsafe(`
      INSERT INTO currencies (code, name, decimals, is_pivot) VALUES ('PLN','Polish Zloty',2,true);
      INSERT INTO accounts (id, name, currency, ownership, is_business, opening_balance)
        VALUES
          ('11111111-1111-1111-1111-111111111111','Bank A · PLN','PLN','own',false,100),
          ('22222222-2222-2222-2222-222222222222','Biz · PLN','PLN','own',true,-20),
          ('33333333-3333-3333-3333-333333333333','Household · PLN','PLN','shared',false,50);
    `);
    const rows = await netWorth(scratch.db);
    expect(rows).toEqual([{ currency: "PLN", mine: "80.00000000", ours: "130.00000000" }]);
  });
});
