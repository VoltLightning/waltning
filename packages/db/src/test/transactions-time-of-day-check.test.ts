/**
 * `transactions_time_of_day_whole_minute` (`0016_time_of_day.sql`), broken
 * once to prove the CHECK fires rather than only existing in a migration file.
 *
 * §7.0a says this column records when in a day something happened and that
 * nothing in this ledger knows a second. `TimeOfDay` narrows to `HH:MM` on the
 * way in and out, and Postgres `time` would accept `14:20:30` happily — so a
 * row written by anything that bypassed the type would carry a second
 * spelling of the same minute, which sorts and compares differently from every
 * other row. This is the floor under the type: it holds when the code is
 * wrong, which is the only time a CHECK earns its place.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Scratch, scratchDatabase } from "./scratch.ts";

const CURRENCY = { code: "PLN", name: "Polish Zloty", decimals: 2 };
const ACCOUNT = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Bank A · PLN",
  currency: "PLN",
};

let scratch: Scratch;

beforeAll(async () => {
  scratch = await scratchDatabase("transactions_time_of_day_check");
  await scratch.sql`insert into currencies (code, name, decimals, is_pivot)
    values (${CURRENCY.code}, ${CURRENCY.name}, ${CURRENCY.decimals}, true)`;
  await scratch.sql`insert into accounts (id, name, currency, ownership, is_business, opening_balance, kind)
    values (${ACCOUNT.id}, ${ACCOUNT.name}, ${ACCOUNT.currency}, 'own', false, '0', 'other')`;
}, 60_000);

afterAll(async () => {
  await scratch?.drop();
});

/** A minimal, otherwise-valid expense row — every test overrides only the time. */
async function insertAt(timeOfDay: string | null) {
  return scratch.sql`insert into transactions
    (id, date, type, account_id, amount_original, currency, fx_rate, time_of_day)
    values (gen_random_uuid(), '2026-08-12', 'expense', ${ACCOUNT.id}, '10.00', ${CURRENCY.code}, '1', ${timeOfDay})`;
}

describe("transactions_time_of_day_whole_minute", () => {
  it("refuses a stored second", async () => {
    await expect(insertAt("14:20:30")).rejects.toThrow(/transactions_time_of_day_whole_minute/);
  });

  it("refuses a fraction of a second, which is the same mistake smaller", async () => {
    await expect(insertAt("14:20:00.5")).rejects.toThrow(/transactions_time_of_day_whole_minute/);
  });

  it("allows a whole minute", async () => {
    await expect(insertAt("14:20:00")).resolves.toBeDefined();
    await expect(insertAt("00:00:00")).resolves.toBeDefined();
    await expect(insertAt("23:59:00")).resolves.toBeDefined();
  });

  /**
   * The normal row. §7.0a: most rows never claim to know a minute, and the
   * absence has to be a null rather than a midnight somebody could have meant.
   */
  it("allows a null", async () => {
    await expect(insertAt(null)).resolves.toBeDefined();
  });
});
