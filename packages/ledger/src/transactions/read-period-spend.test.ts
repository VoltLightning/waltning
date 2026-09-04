import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ledgerSchema } from "../schema-map.ts";
import { type ScratchStores, scratchStores } from "../test/stores.ts";
import { readPeriodSpend } from "./read-period-spend.ts";

const { accounts, currencies, transactions } = ledgerSchema;

const PLN = currencyCode("PLN");
const OWN_ACCOUNT = id<"accounts">("11111111-1111-4111-8111-111111111111");
const SHARED_ACCOUNT = id<"accounts">("22222222-2222-4222-8222-222222222222");

let stores: ScratchStores;

beforeEach(() => {
  stores = scratchStores();
  const db = stores.ledger.replica.db;
  db.insert(currencies)
    .values({ code: PLN, name: "Polish Złoty", symbol: "zł", decimals: 2, isPivot: true })
    .run();
  db.insert(accounts)
    .values([
      { id: OWN_ACCOUNT, name: "Bank A · PLN", currency: PLN, ownership: "own" },
      { id: SHARED_ACCOUNT, name: "Household · PLN", currency: PLN, ownership: "shared" },
    ])
    .run();
  db.insert(transactions)
    .values([
      // in period, own, expense
      {
        id: id<"transactions">("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
        date: accountingDate("2026-08-05"),
        type: "expense",
        accountId: OWN_ACCOUNT,
        amountOriginal: money.toMoney("100"),
        currency: PLN,
        fxRate: money.pivotPerUnit("1"),
      },
      // in period, own, income
      {
        id: id<"transactions">("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
        date: accountingDate("2026-08-10"),
        type: "income",
        accountId: OWN_ACCOUNT,
        amountOriginal: money.toMoney("30"),
        currency: PLN,
        fxRate: money.pivotPerUnit("1"),
      },
      // out of period
      {
        id: id<"transactions">("cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
        date: accountingDate("2026-07-31"),
        type: "expense",
        accountId: OWN_ACCOUNT,
        amountOriginal: money.toMoney("999"),
        currency: PLN,
        fxRate: money.pivotPerUnit("1"),
      },
      // shared account — excluded
      {
        id: id<"transactions">("dddddddd-dddd-4ddd-8ddd-dddddddddddd"),
        date: accountingDate("2026-08-06"),
        type: "expense",
        accountId: SHARED_ACCOUNT,
        amountOriginal: money.toMoney("50"),
        currency: PLN,
        fxRate: money.pivotPerUnit("1"),
      },
      // deleted — excluded
      {
        id: id<"transactions">("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"),
        date: accountingDate("2026-08-06"),
        type: "expense",
        accountId: OWN_ACCOUNT,
        amountOriginal: money.toMoney("999"),
        currency: PLN,
        fxRate: money.pivotPerUnit("1"),
        deletedAt: new Date("2026-08-07T00:00:00Z"),
      },
      // a transfer — neither income nor expense
      {
        id: id<"transactions">("ffffffff-ffff-4fff-8fff-ffffffffffff"),
        date: accountingDate("2026-08-06"),
        type: "transfer",
        accountId: OWN_ACCOUNT,
        toAccountId: SHARED_ACCOUNT,
        amountOriginal: money.toMoney("20"),
        toAmount: money.toMoney("20"),
        currency: PLN,
        toCurrency: PLN,
        fxRate: money.pivotPerUnit("1"),
      },
    ])
    .run();
});

afterEach(() => stores.close());

describe("readPeriodSpend", () => {
  it("folds August's own income/expense rows through money.periodSpend", () => {
    const period = { start: accountingDate("2026-08-01"), end: accountingDate("2026-09-01") };
    expect(readPeriodSpend(stores.ledger.replica.db, period)).toEqual([
      { currency: PLN, decimals: 2, spend: "100.00000000", net: "-70.00000000" },
    ]);
  });

  it("is empty over a period with nothing in it", () => {
    const period = { start: accountingDate("2026-01-01"), end: accountingDate("2026-02-01") };
    expect(readPeriodSpend(stores.ledger.replica.db, period)).toEqual([]);
  });
});
