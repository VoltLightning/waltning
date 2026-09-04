import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ledgerSchema } from "../schema-map.ts";
import { type ScratchStores, scratchStores } from "../test/stores.ts";
import { readTransaction } from "./read-transaction.ts";

const { accounts, categories, currencies, transactionLines, transactions } = ledgerSchema;

const USD = currencyCode("USD");
const ACCOUNT = id<"accounts">("11111111-1111-4111-8111-111111111111");
const CATEGORY = id<"categories">("22222222-2222-4222-8222-222222222222");
const LINE_CATEGORY = id<"categories">("33333333-3333-4333-8333-333333333333");
const TXN = id<"transactions">("44444444-4444-4444-8444-444444444444");
const OTHER_TXN = id<"transactions">("55555555-5555-4555-8555-555555555555");
const DELETED_TXN = id<"transactions">("66666666-6666-4666-8666-666666666666");
const NO_CATEGORY_TXN = id<"transactions">("77777777-7777-4777-8777-777777777777");

let stores: ScratchStores;

beforeEach(() => {
  stores = scratchStores();
  const db = stores.ledger.replica.db;
  db.insert(currencies)
    .values({ code: USD, name: "US dollar", symbol: "$", decimals: 2, isPivot: true })
    .run();
  db.insert(accounts).values({ id: ACCOUNT, name: "Wallet · USD", currency: USD }).run();
  db.insert(categories)
    .values([
      { id: CATEGORY, name: "Food", kind: "expense", isLeaf: true },
      { id: LINE_CATEGORY, name: "Groceries", kind: "expense", isLeaf: true },
    ])
    .run();

  db.insert(transactions)
    .values([
      {
        id: TXN,
        date: accountingDate("2026-08-23"),
        type: "expense" as const,
        accountId: ACCOUNT,
        categoryId: CATEGORY,
        amountOriginal: money.toMoney("48.90"),
        currency: USD,
        fxRate: money.pivotPerUnit("1"),
        payee: "Café A",
        note: "Meeting",
        isBusiness: true,
        version: 3,
      },
      {
        id: NO_CATEGORY_TXN,
        date: accountingDate("2026-08-23"),
        type: "income" as const,
        accountId: ACCOUNT,
        amountOriginal: money.toMoney("10"),
        currency: USD,
        fxRate: money.pivotPerUnit("1"),
        payee: "",
      },
      {
        id: DELETED_TXN,
        date: accountingDate("2026-08-23"),
        type: "expense" as const,
        accountId: ACCOUNT,
        amountOriginal: money.toMoney("5"),
        currency: USD,
        fxRate: money.pivotPerUnit("1"),
        payee: "Gone",
        deletedAt: new Date("2026-08-23T11:00:00Z"),
      },
    ])
    .run();

  db.insert(transactionLines)
    .values([
      {
        id: id<"transactionLines">("88888888-8888-4888-8888-888888888888"),
        transactionId: TXN,
        description: "Household supplies",
        amount: money.toMoney("6.80"),
        categoryId: LINE_CATEGORY,
        sort: 1,
      },
      {
        id: id<"transactionLines">("99999999-9999-4999-8999-999999999999"),
        transactionId: TXN,
        description: "Groceries",
        amount: money.toMoney("42.10"),
        sort: 0,
      },
    ])
    .run();
});

afterEach(() => stores.close());

describe("readTransaction", () => {
  it("joins account and category names, signs the amount, and orders lines", () => {
    const result = readTransaction(stores.ledger.replica.db, TXN);

    expect(result).toMatchObject({
      id: TXN,
      date: accountingDate("2026-08-23"),
      type: "expense",
      payee: "Café A",
      note: "Meeting",
      isBusiness: true,
      accountId: ACCOUNT,
      accountName: "Wallet · USD",
      categoryId: CATEGORY,
      categoryName: "Food",
      amount: "-48.90000000",
      currency: USD,
      decimals: 2,
      version: 3,
    });
    expect(result?.lines.map((line) => line.description)).toEqual([
      "Groceries",
      "Household supplies",
    ]);
    expect(result?.lines[1]).toMatchObject({
      description: "Household supplies",
      amount: "6.80000000",
      categoryId: LINE_CATEGORY,
      categoryName: "Groceries",
    });
    expect(result?.lines[0]).toMatchObject({ categoryId: null, categoryName: null });
  });

  it("carries a null category through rather than a name for the uncategorised row", () => {
    const result = readTransaction(stores.ledger.replica.db, NO_CATEGORY_TXN);
    expect(result).toMatchObject({ categoryId: null, categoryName: null, amount: "10.00000000" });
    expect(result?.lines).toEqual([]);
  });

  it("returns null for a row that does not exist", () => {
    expect(readTransaction(stores.ledger.replica.db, OTHER_TXN)).toBeNull();
  });

  it("returns null for a soft-deleted row — §6.9", () => {
    expect(readTransaction(stores.ledger.replica.db, DELETED_TXN)).toBeNull();
  });
});
