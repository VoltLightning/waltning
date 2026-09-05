/**
 * `architecture/14` §14.6 — *"reference data is bootstrapped, never
 * restored"*. The rule the phone's replica already follows
 * (`packages/ledger/src/session.ts`'s `onConflictDoNothing` bootstrap) holds
 * for the server's own seed too, and this is where it is proved: against real
 * Postgres, by editing a currency the way a person would and re-running the
 * seed over the edit.
 */
import { currencyCode } from "@waltning/core/money";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { currencies } from "../schema.ts";
import { type Scratch, scratchDatabase } from "../test/scratch.ts";
import { seedCurrencies } from "./currencies.ts";

let s: Scratch;

beforeAll(async () => {
  s = await scratchDatabase("seed_currencies");
}, 60_000);

afterAll(async () => {
  await s?.drop();
});

const PLN = currencyCode("PLN");

const read = async (code: typeof PLN) =>
  await s.db
    .select()
    .from(currencies)
    .where(eq(currencies.code, code))
    .then((rows) => rows[0]);

describe("seedCurrencies", () => {
  it("bootstraps the reference list", async () => {
    const count = await seedCurrencies(s.db);
    expect(count).toBeGreaterThan(0);
    expect((await read(PLN))?.decimals).toBe(2);
  });

  it("never restores a currency someone edited — onConflictDoNothing, not DoUpdate", async () => {
    await seedCurrencies(s.db);

    // The three fields an upsert's `set` would have overwritten: a person
    // renames the symbol, unpins the row, and points it at no rate source.
    await s.db
      .update(currencies)
      .set({ symbol: "zł.", pinned: false, rateSource: null })
      .where(eq(currencies.code, PLN));

    const count = await seedCurrencies(s.db);
    expect(count).toBeGreaterThan(0);

    const row = await read(PLN);
    expect(row?.symbol, "the edited symbol survives a re-seed").toBe("zł.");
    expect(row?.pinned, "and the edited pin").toBe(false);
    expect(row?.rateSource, "and the cleared rate source").toBeNull();
  });
});
