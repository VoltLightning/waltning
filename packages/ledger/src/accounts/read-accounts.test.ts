import { accountingDate, currencyCode, id, money } from "@waltning/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { accounts, currencies, transactions } from "../schema.ts";
import { type ScratchStores, scratchStores } from "../test/stores.ts";
import { readAccounts } from "./read-accounts.ts";

const USD = currencyCode("USD");
const ACCOUNT_A = id<"accounts">("11111111-1111-4111-8111-111111111111");
const ACCOUNT_B = id<"accounts">("22222222-2222-4222-8222-222222222222");
const ARCHIVED = id<"accounts">("33333333-3333-4333-8333-333333333333");
const SAME_A = id<"accounts">("44444444-4444-4444-8444-444444444444");
const SAME_B = id<"accounts">("55555555-5555-4555-8555-555555555555");
const date = accountingDate("2026-08-23");

let stores: ScratchStores;

beforeEach(() => {
  stores = scratchStores();
  stores.ledger.replica.db
    .insert(currencies)
    .values({ code: USD, name: "US dollar", symbol: "$", decimals: 2, isPivot: true })
    .run();
  stores.ledger.replica.db
    .insert(accounts)
    .values([
      {
        id: ACCOUNT_A,
        name: "Wallet · USD",
        currency: USD,
        openingBalance: money.toMoney("100"),
        sort: 2,
      },
      {
        id: ACCOUNT_B,
        name: "Bank A · USD",
        currency: USD,
        openingBalance: money.toMoney("5"),
        sort: 1,
      },
      { id: ARCHIVED, name: "Old · USD", currency: USD, archived: true, sort: 0 },
    ])
    .run();
  stores.ledger.replica.db
    .insert(transactions)
    .values([
      {
        id: id<"transactions">("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
        date,
        type: "expense",
        accountId: ACCOUNT_A,
        amountOriginal: money.toMoney("10"),
        currency: USD,
        fxRate: money.pivotPerUnit("1"),
      },
      {
        id: id<"transactions">("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
        date,
        type: "income",
        accountId: ACCOUNT_A,
        amountOriginal: money.toMoney("20"),
        currency: USD,
        fxRate: money.pivotPerUnit("1"),
      },
      {
        id: id<"transactions">("cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
        date,
        type: "transfer",
        accountId: ACCOUNT_A,
        toAccountId: ACCOUNT_B,
        amountOriginal: money.toMoney("30"),
        toAmount: money.toMoney("25"),
        currency: USD,
        toCurrency: USD,
        fxRate: money.pivotPerUnit("1"),
      },
      {
        id: id<"transactions">("dddddddd-dddd-4ddd-8ddd-dddddddddddd"),
        date,
        type: "expense",
        accountId: ACCOUNT_A,
        amountOriginal: money.toMoney("7"),
        currency: USD,
        fxRate: money.pivotPerUnit("1"),
        deletedAt: new Date("2026-08-23T10:00:00Z"),
      },
    ])
    .run();
});

afterEach(() => stores.close());

describe("readAccounts", () => {
  it("folds every transaction shape over opening balances", () => {
    const result = readAccounts(stores.ledger.replica.db);

    expect(result.map(({ name, balance }) => [name, balance])).toEqual([
      ["Bank A · USD", "30.00000000"],
      ["Wallet · USD", "80.00000000"],
    ]);
    expect(result.every((account) => account.currency === USD)).toBe(true);
    expect(result.every((account) => account.decimals === 2)).toBe(true);
  });

  it("orders by sort, name, then id and omits archived accounts", () => {
    stores.ledger.replica.db.update(accounts).set({ sort: 1 }).run();
    stores.ledger.replica.db
      .insert(accounts)
      .values([
        { id: SAME_B, name: "Same · USD", currency: USD, sort: 1 },
        { id: SAME_A, name: "Same · USD", currency: USD, sort: 1 },
      ])
      .run();

    const result = readAccounts(stores.ledger.replica.db);

    expect(result.map((account) => account.id)).toEqual([ACCOUNT_B, SAME_A, SAME_B, ACCOUNT_A]);
    expect(result.map((account) => account.id)).not.toContain(ARCHIVED);
  });
});
