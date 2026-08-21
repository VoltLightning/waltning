/**
 * `computations.md` §2, against real Postgres.
 *
 * The specification's own formula for this was wrong (C30): it negated every
 * source-leg row, income included, contradicting §1 one paragraph above it. So
 * these tests are not a restatement of the spec — the spec is what failed. They
 * assert the arithmetic directly, on figures small enough to check by hand.
 *
 * Account balance is class **F**, meaning the phone folds the same definition
 * from a checkpoint. A wrong sign here would be a wrong sign there too, both
 * sides would agree, and reconciliation would find nothing.
 */

import { accountingDate, currencyCode, type Id, id, money } from "@waltning/core";
import { accounts, transactions } from "@waltning/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Scratch, scratchDatabase } from "../../../../../packages/db/src/test/scratch.ts";
import { listAccounts } from "./accounts.service.ts";

let s: Scratch;

const ACC = id<"accounts">("aaaaaaaa-0000-0000-0000-000000000001");
const DEST = id<"accounts">("aaaaaaaa-0000-0000-0000-000000000002");

beforeAll(async () => {
  s = await scratchDatabase("balance");
  await s.sql`INSERT INTO currencies (code, name, is_pivot) VALUES ('USD', 'US Dollar', true)`;
}, 60_000);

afterAll(async () => {
  await s?.drop();
});

/** A fresh pair of accounts per test, so no case can lean on another's rows. */
async function reset(opening: money.Money = money.toMoney("0.00")): Promise<void> {
  await s.sql`DELETE FROM transactions`;
  await s.sql`DELETE FROM accounts`;
  await s.db.insert(accounts).values([
    { id: ACC, name: "Bank A", currency: currencyCode("USD"), openingBalance: opening },
    {
      id: DEST,
      name: "Bank B",
      currency: currencyCode("USD"),
      openingBalance: money.toMoney("0.00"),
    },
  ]);
}

type Row = {
  type: "income" | "expense" | "transfer" | "adjustment";
  amount: money.Money;
  to?: { account: Id<"accounts">; amount: money.Money };
  deleted?: boolean;
};

async function add(rows: Row[]): Promise<void> {
  for (const r of rows) {
    await s.db.insert(transactions).values({
      date: accountingDate("2026-06-01"),
      type: r.type,
      accountId: ACC,
      amountOriginal: r.amount,
      currency: currencyCode("USD"),
      fxRate: money.pivotPerUnit("1.000000000000"),
      ...(r.to
        ? {
            toAccountId: r.to.account,
            toAmount: r.to.amount,
            toCurrency: currencyCode("USD"),
            toFxRate: money.pivotPerUnit("1.000000000000"),
          }
        : {}),
      ...(r.deleted ? { deletedAt: new Date() } : {}),
    });
  }
}

async function balanceOf(id: string): Promise<string> {
  const all = await listAccounts(s.db, false);
  const row = all.find((a) => a.id === id);
  if (!row) throw new Error(`account ${id} not returned`);
  return row.balance;
}

describe("the defect C30 closed", () => {
  it("adds income and subtracts expense — the case the spec got backwards", async () => {
    // §1 gives 800,00. The specification's §2 gave −1 200,00: it negated the
    // income too. Not a rounding difference — the wrong sign on every salary.
    await reset(money.toMoney("0.00"));
    await add([
      { type: "income", amount: money.toMoney("1000.00") },
      { type: "expense", amount: money.toMoney("200.00") },
    ]);
    expect(await balanceOf(ACC)).toBe("800.00000000");
  });

  it("keeps an adjustment's own sign", async () => {
    // §1: an adjustment carries its sign, and only that type may be negative.
    // Negating it inverts the correction it exists to make — a −50 correction
    // would *add* 50.
    await reset(money.toMoney("100.00"));
    await add([{ type: "adjustment", amount: money.toMoney("-50.00") }]);
    expect(await balanceOf(ACC)).toBe("50.00000000");
  });
});

describe("the two legs", () => {
  it("takes the source amount from one account and gives to_amount to the other", async () => {
    // §7.2: a transfer contributes two different figures to two accounts.
    // Summing `amount_original` on the destination is the mistake §1 names.
    await reset(money.toMoney("500.00"));
    await add([
      {
        type: "transfer",
        amount: money.toMoney("120.00"),
        to: { account: DEST, amount: money.toMoney("118.00") },
      },
    ]);

    expect(await balanceOf(ACC)).toBe("380.00000000");
    // 118, not 120 — the two differ by the fee, which is the whole point of
    // storing both sides (§7.2) and where the FX margin comes from.
    expect(await balanceOf(DEST)).toBe("118.00000000");
  });
});

describe("what counts", () => {
  it("starts from the opening balance", async () => {
    await reset(money.toMoney("250.00"));
    expect(await balanceOf(ACC)).toBe("250.00000000");
  });

  it("ignores soft-deleted rows", async () => {
    // `T` is live transactions. The specification used `T` in two formulas and
    // defined it nowhere, leaving a reader to guess whether a deleted row still
    // counts — and the two answers differ by however much was deleted.
    await reset(money.toMoney("100.00"));
    await add([
      { type: "expense", amount: money.toMoney("30.00") },
      { type: "expense", amount: money.toMoney("999.00"), deleted: true },
    ]);
    expect(await balanceOf(ACC)).toBe("70.00000000");
  });

  it("returns a decimal string, not a number", async () => {
    // A JS number holding an amount is a bug in this system. `numeric(20,8)`
    // through a driver configured to parse it would arrive as `number`, and the
    // error appears at the eighth decimal place — where nobody looks.
    await reset(money.toMoney("0.10"));
    await add([{ type: "income", amount: money.toMoney("0.20") }]);
    const balance = await balanceOf(ACC);
    expect(typeof balance).toBe("string");
    expect(balance).toBe("0.30000000");
  });
});
