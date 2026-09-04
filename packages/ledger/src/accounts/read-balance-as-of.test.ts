import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ledgerSchema } from "../schema-map.ts";
import { type ScratchStores, scratchStores } from "../test/stores.ts";
import { readBalanceAsOf } from "./read-balance-as-of.ts";

const { accounts, currencies, transactions } = ledgerSchema;

const USD = currencyCode("USD");
const ACCOUNT_A = id<"accounts">("11111111-1111-4111-8111-111111111111");

let stores: ScratchStores;

beforeEach(() => {
  stores = scratchStores();
  stores.ledger.replica.db
    .insert(currencies)
    .values({ code: USD, name: "US dollar", symbol: "$", decimals: 2, isPivot: true })
    .run();
  stores.ledger.replica.db
    .insert(accounts)
    .values({
      id: ACCOUNT_A,
      name: "Wallet · USD",
      currency: USD,
      openingBalance: money.toMoney("100"),
    })
    .run();
  stores.ledger.replica.db
    .insert(transactions)
    .values([
      {
        id: id<"transactions">("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
        date: accountingDate("2026-08-10"),
        type: "expense",
        accountId: ACCOUNT_A,
        amountOriginal: money.toMoney("10"),
        currency: USD,
        fxRate: money.pivotPerUnit("1"),
      },
      // Dated after the cutoff below — must not count toward it.
      {
        id: id<"transactions">("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
        date: accountingDate("2026-08-23"),
        type: "expense",
        accountId: ACCOUNT_A,
        amountOriginal: money.toMoney("40"),
        currency: USD,
        fxRate: money.pivotPerUnit("1"),
      },
    ])
    .run();
});

afterEach(() => stores.close());

describe("readBalanceAsOf", () => {
  it("excludes a row dated after asOf", () => {
    // opening 100, minus the one row on or before 2026-08-15: 100 - 10 = 90.
    // The 40 expense on 2026-08-23 must not be folded in.
    const balance = readBalanceAsOf(
      stores.ledger.replica.db,
      ACCOUNT_A,
      accountingDate("2026-08-15"),
    );
    expect(balance).toBe("90.00000000");
  });

  it("includes a row dated exactly on asOf, and moves as the date moves", () => {
    const beforeBoth = readBalanceAsOf(
      stores.ledger.replica.db,
      ACCOUNT_A,
      accountingDate("2026-08-09"),
    );
    expect(beforeBoth).toBe("100.00000000");

    const afterBoth = readBalanceAsOf(
      stores.ledger.replica.db,
      ACCOUNT_A,
      accountingDate("2026-08-23"),
    );
    expect(afterBoth).toBe("50.00000000");
  });

  it("throws for an account that does not exist", () => {
    expect(() =>
      readBalanceAsOf(
        stores.ledger.replica.db,
        id<"accounts">("99999999-9999-4999-8999-999999999999"),
        accountingDate("2026-08-15"),
      ),
    ).toThrow(/no account/);
  });
});
