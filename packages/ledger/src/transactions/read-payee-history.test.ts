import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ledgerSchema } from "../schema-map.ts";
import { type ScratchStores, scratchStores } from "../test/stores.ts";
import { readPayeeHistory } from "./read-payee-history.ts";

const { accounts, categories, currencies, transactions } = ledgerSchema;

const USD = currencyCode("USD");
const ACCOUNT = id<"accounts">("11111111-1111-4111-8111-111111111111");
const GROCERIES = id<"categories">("22222222-2222-4222-8222-222222222222");
const DINING = id<"categories">("33333333-3333-4333-8333-333333333333");

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
      { id: GROCERIES, name: "Groceries", kind: "expense", isLeaf: true },
      { id: DINING, name: "Dining", kind: "expense", isLeaf: true },
    ])
    .run();
});

afterEach(() => stores.close());

const baseRow = (index: number) => ({
  id: id<"transactions">(`00000000-0000-4000-8000-00000000000${index}`),
  type: "expense" as const,
  accountId: ACCOUNT,
  amountOriginal: money.toMoney("10"),
  currency: USD,
  fxRate: money.pivotPerUnit("1"),
  createdAt: new Date(`2026-08-01T10:00:0${index}Z`),
});

describe("readPayeeHistory", () => {
  it("keeps one row per folded payee, its most recent category and date", () => {
    const db = stores.ledger.replica.db;
    db.insert(transactions)
      .values([
        {
          ...baseRow(0),
          date: accountingDate("2026-08-01"),
          payee: "Coffee House",
          categoryId: DINING,
        },
        {
          ...baseRow(1),
          date: accountingDate("2026-08-02"),
          payee: "COFFEE HOUSE",
          categoryId: GROCERIES,
        },
      ])
      .run();

    const history = readPayeeHistory(db);

    expect(history).toEqual([
      { payee: "COFFEE HOUSE", categoryId: GROCERIES, date: accountingDate("2026-08-02") },
    ]);
  });

  it("excludes deleted rows, uncategorised rows, and non income/expense rows", () => {
    const db = stores.ledger.replica.db;
    db.insert(transactions)
      .values([
        {
          ...baseRow(0),
          date: accountingDate("2026-08-01"),
          payee: "Deleted Payee",
          categoryId: GROCERIES,
          deletedAt: new Date("2026-08-01T11:00:00Z"),
        },
        {
          ...baseRow(1),
          date: accountingDate("2026-08-02"),
          payee: "Uncategorised Payee",
          categoryId: undefined,
        },
        {
          ...baseRow(2),
          type: "transfer",
          date: accountingDate("2026-08-03"),
          payee: "Transfer Payee",
          categoryId: GROCERIES,
        },
        {
          ...baseRow(3),
          date: accountingDate("2026-08-04"),
          payee: "Live Payee",
          categoryId: GROCERIES,
        },
      ])
      .run();

    const history = readPayeeHistory(db);

    expect(history.map((row) => row.payee)).toEqual(["Live Payee"]);
  });

  it("orders newest first across distinct payees and respects the limit", () => {
    const db = stores.ledger.replica.db;
    db.insert(transactions)
      .values(
        Array.from({ length: 3 }, (_, index) => ({
          ...baseRow(index),
          date: accountingDate(`2026-08-0${index + 1}`),
          payee: `Payee ${index}`,
          categoryId: GROCERIES,
        })),
      )
      .run();

    const history = readPayeeHistory(db, 2);

    expect(history.map((row) => row.payee)).toEqual(["Payee 2", "Payee 1"]);
  });
});
