import { accountingDate, currencyCode, id, money } from "@waltning/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { accounts, categories, currencies, transactions } from "../schema.ts";
import { type ScratchStores, scratchStores } from "../test/stores.ts";
import { readRecent } from "./read-recent.ts";

const USD = currencyCode("USD");
const ACCOUNT = id<"accounts">("11111111-1111-4111-8111-111111111111");
const CATEGORY = id<"categories">("22222222-2222-4222-8222-222222222222");

let stores: ScratchStores;

beforeEach(() => {
  stores = scratchStores();
  const db = stores.ledger.replica.db;
  db.insert(currencies)
    .values({ code: USD, name: "US dollar", symbol: "$", decimals: 2, isPivot: true })
    .run();
  db.insert(accounts).values({ id: ACCOUNT, name: "Wallet · USD", currency: USD }).run();
  db.insert(categories).values({ id: CATEGORY, name: "Food", kind: "expense", isLeaf: true }).run();

  db.insert(transactions)
    .values(
      Array.from({ length: 7 }, (_, index) => ({
        id: id<"transactions">(`00000000-0000-4000-8000-00000000000${index}`),
        date: accountingDate(index < 2 ? "2026-08-22" : "2026-08-23"),
        type: "expense" as const,
        accountId: ACCOUNT,
        categoryId: index === 6 ? undefined : CATEGORY,
        amountOriginal: money.toMoney(String(index + 1)),
        currency: USD,
        fxRate: money.pivotPerUnit("1"),
        payee: `Placeholder ${index}`,
        isBusiness: index === 5,
        createdAt: new Date(
          index === 2 || index === 3 ? "2026-08-23T10:00:03Z" : `2026-08-23T10:00:0${index}Z`,
        ),
        ...(index === 4 ? { deletedAt: new Date("2026-08-23T11:00:00Z") } : {}),
      })),
    )
    .run();
});

afterEach(() => stores.close());

describe("readRecent", () => {
  it("returns five newest active rows with joined labels and signed amounts", () => {
    const result = readRecent(stores.ledger.replica.db, 5);

    expect(result).toHaveLength(5);
    expect(result.map((row) => row.payee)).toEqual([
      "Placeholder 6",
      "Placeholder 5",
      "Placeholder 3",
      "Placeholder 2",
      "Placeholder 1",
    ]);
    expect(result[0]).toMatchObject({
      categoryName: null,
      accountName: "Wallet · USD",
      amount: "-7.00000000",
      currency: USD,
      decimals: 2,
    });
    expect(result[1]?.isBusiness).toBe(true);
  });

  it("keeps date, creation time, and id ordering after reopen", () => {
    const before = readRecent(stores.ledger.replica.db, 5).map((row) => row.id);
    stores.reopen();
    const after = readRecent(stores.ledger.replica.db, 5).map((row) => row.id);

    expect(after).toEqual(before);
  });
});
