import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ledgerSchema } from "../schema-map.ts";
import { type ScratchStores, scratchStores } from "../test/stores.ts";
import { readUnsettledClearing } from "./read-unsettled-clearing.ts";

const { accounts, currencies, transactions } = ledgerSchema;

const PLN = currencyCode("PLN");
const UNSETTLED = id<"accounts">("11111111-1111-4111-8111-111111111111");
const SETTLED = id<"accounts">("22222222-2222-4222-8222-222222222222");
const BANK = id<"accounts">("33333333-3333-4333-8333-333333333333");

let stores: ScratchStores;

beforeEach(() => {
  stores = scratchStores();
  const db = stores.ledger.replica.db;
  db.insert(currencies)
    .values({ code: PLN, name: "Polish Złoty", symbol: "zł", decimals: 2, isPivot: true })
    .run();
  db.insert(accounts)
    .values([
      { id: UNSETTLED, name: "Shared clearing", currency: PLN, kind: "clearing" },
      { id: SETTLED, name: "Settled clearing", currency: PLN, kind: "clearing" },
      { id: BANK, name: "Bank A · PLN", currency: PLN, kind: "bank" },
    ])
    .run();
  db.insert(transactions)
    .values([
      {
        id: id<"transactions">("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
        date: accountingDate("2026-08-05"),
        type: "income",
        accountId: UNSETTLED,
        amountOriginal: money.toMoney("340"),
        currency: PLN,
        fxRate: money.pivotPerUnit("1"),
      },
    ])
    .run();
});

afterEach(() => stores.close());

describe("readUnsettledClearing", () => {
  it("names only the clearing account with a non-zero balance, and its one open inflow", () => {
    expect(readUnsettledClearing(stores.ledger.replica.db)).toEqual([
      {
        accountId: UNSETTLED,
        name: "Shared clearing",
        currency: PLN,
        decimals: 2,
        balance: "340.00000000",
        oldestUnconsumedTransactionId: id<"transactions">("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
        oldestDate: accountingDate("2026-08-05"),
        oldestUnconsumedPayee: "",
      },
    ]);
  });

  it("never a bank account, even one holding a balance", () => {
    const result = readUnsettledClearing(stores.ledger.replica.db);
    expect(result.some((row) => row.accountId === BANK)).toBe(false);
  });

  it("a clearing account netted to zero does not appear", () => {
    expect(
      readUnsettledClearing(stores.ledger.replica.db).some((row) => row.accountId === SETTLED),
    ).toBe(false);
  });

  /**
   * §8's own reading: inflows open, outflows consume, FIFO. Two inflows to
   * the clearing account, one allocation out that exhausts the older —
   * J08's group bill shape (`computations.md` §8).
   */
  it("names the oldest still-open inflow once an older one is fully allocated", () => {
    const db = stores.ledger.replica.db;
    db.insert(accounts)
      .values({
        id: id<"accounts">("44444444-4444-4444-8444-444444444444"),
        name: "Trip clearing",
        currency: PLN,
        kind: "clearing",
      })
      .run();
    const trip = id<"accounts">("44444444-4444-4444-8444-444444444444");
    db.insert(transactions)
      .values([
        {
          id: id<"transactions">("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
          date: accountingDate("2026-08-01"),
          type: "income",
          accountId: trip,
          payee: "Hotel",
          amountOriginal: money.toMoney("120"),
          currency: PLN,
          fxRate: money.pivotPerUnit("1"),
        },
        {
          id: id<"transactions">("cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
          date: accountingDate("2026-08-05"),
          type: "income",
          accountId: trip,
          payee: "Dinner",
          amountOriginal: money.toMoney("80"),
          currency: PLN,
          fxRate: money.pivotPerUnit("1"),
        },
        {
          id: id<"transactions">("dddddddd-dddd-4ddd-8ddd-dddddddddddd"),
          date: accountingDate("2026-08-06"),
          type: "expense",
          accountId: trip,
          payee: "Allocated to Nina",
          amountOriginal: money.toMoney("120"),
          currency: PLN,
          fxRate: money.pivotPerUnit("1"),
        },
      ])
      .run();

    const row = readUnsettledClearing(db).find((candidate) => candidate.accountId === trip);
    expect(row).toEqual({
      accountId: trip,
      name: "Trip clearing",
      currency: PLN,
      decimals: 2,
      balance: "80.00000000",
      oldestUnconsumedTransactionId: id<"transactions">("cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
      oldestDate: accountingDate("2026-08-05"),
      oldestUnconsumedPayee: "Dinner",
    });
  });
});
