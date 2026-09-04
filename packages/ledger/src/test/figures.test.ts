/**
 * The phone's class-F figures, end to end through the replica store.
 *
 * `scratchStores()` rather than `scratch.ts`'s `scratchLedger()`: `readAccounts`
 * and `readNetWorth` both take `ReplicaDb`, the branded type `openLedger`
 * produces (see `open.ts`'s `STORE` phantom marker) — `scratchLedger()`'s
 * single merged replica+outbox database is unbranded and built for tests that
 * care about the two stores *not* being separate (`write.test.ts`,
 * `recover.test.ts`), which these are not. `read-accounts.test.ts` already
 * establishes this pattern; this file follows it rather than inventing a cast.
 */

import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { afterEach, describe, expect, it } from "vitest";
import { readAccounts } from "../accounts/read-accounts.ts";
import { readNetWorth } from "../accounts/read-net-worth.ts";
import { ledgerSchema } from "../schema-map.ts";
import { type ScratchStores, scratchStores } from "./stores.ts";

const { accounts, currencies, transactions } = ledgerSchema;
const PLN = currencyCode("PLN");

describe("the phone's class-F figures", () => {
  let stores: ScratchStores;
  afterEach(() => stores.close());

  it("computes balances and net worth through the money.ts folds", () => {
    stores = scratchStores();
    const db = stores.ledger.replica.db;

    db.insert(currencies)
      .values({ code: PLN, name: "Polish Złoty", decimals: 2, isPivot: true })
      .run();
    db.insert(accounts)
      .values([
        {
          id: id<"accounts">("11111111-1111-4111-8111-111111111111"),
          name: "Bank A · PLN",
          currency: PLN,
          openingBalance: money.toMoney("10"),
          ownership: "own",
        },
        {
          id: id<"accounts">("22222222-2222-4222-8222-222222222222"),
          name: "Household · PLN",
          currency: PLN,
          openingBalance: money.toMoney("0"),
          ownership: "shared",
        },
      ])
      .run();
    db.insert(transactions)
      .values([
        {
          id: id<"transactions">("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
          date: accountingDate("2026-09-01"),
          type: "income",
          accountId: id<"accounts">("11111111-1111-4111-8111-111111111111"),
          amountOriginal: money.toMoney("100"),
          currency: PLN,
          fxRate: money.pivotPerUnit("1"),
        },
        {
          id: id<"transactions">("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
          date: accountingDate("2026-09-02"),
          type: "transfer",
          accountId: id<"accounts">("11111111-1111-4111-8111-111111111111"),
          toAccountId: id<"accounts">("22222222-2222-4222-8222-222222222222"),
          amountOriginal: money.toMoney("40"),
          toAmount: money.toMoney("40"),
          currency: PLN,
          toCurrency: PLN,
          fxRate: money.pivotPerUnit("1"),
        },
      ])
      .run();

    const byId = new Map(readAccounts(db).map((a) => [a.id, a.balance]));
    expect(byId.get(id<"accounts">("11111111-1111-4111-8111-111111111111"))).toBe("70.00000000");
    expect(byId.get(id<"accounts">("22222222-2222-4222-8222-222222222222"))).toBe("40.00000000");

    expect(readNetWorth(db)).toEqual([
      {
        currency: PLN,
        decimals: 2,
        mine: "70.00000000",
        ours: "110.00000000",
        hasShared: true,
      },
    ]);
  });

  /**
   * `DualTotal`'s own contract wants `ours: null` when no shared account
   * exists — never the same figure printed twice. `readNetWorth` is where
   * ownership is still visible (§3's fold sees only summed balances), so
   * `hasShared` is decided here and carried to the client as a field, not
   * inferred by comparing `mine` and `ours` for equality — a shared account
   * with a zero balance would net to the same number and read as "no shared
   * account" by that comparison, which is a different fact.
   */
  it("says hasShared: false when every account for a currency is own", () => {
    stores = scratchStores();
    const db = stores.ledger.replica.db;

    db.insert(currencies)
      .values({ code: PLN, name: "Polish Złoty", decimals: 2, isPivot: true })
      .run();
    db.insert(accounts)
      .values({
        id: id<"accounts">("33333333-3333-4333-8333-333333333333"),
        name: "Bank A · PLN",
        currency: PLN,
        openingBalance: money.toMoney("10"),
        ownership: "own",
      })
      .run();

    expect(readNetWorth(db)).toEqual([
      {
        currency: PLN,
        decimals: 2,
        mine: "10.00000000",
        ours: "10.00000000",
        hasShared: false,
      },
    ]);
  });
});
