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
  it("names only the clearing account with a non-zero balance", () => {
    expect(readUnsettledClearing(stores.ledger.replica.db)).toEqual([
      {
        accountId: UNSETTLED,
        name: "Shared clearing",
        currency: PLN,
        decimals: 2,
        balance: "340.00000000",
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
});
