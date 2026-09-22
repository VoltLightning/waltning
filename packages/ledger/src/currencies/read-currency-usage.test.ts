/**
 * `readCurrencyUsage` — S17 §6's decision variable: a currency with rows can
 * only be hidden, one with neither rows nor rates can be removed.
 */

import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { afterEach, beforeEach, expect, it } from "vitest";
import { ledgerSchema } from "../schema-map.ts";
import { type ScratchStores, scratchStores } from "../test/stores.ts";
import { readCurrencyUsage } from "./read-currency-usage.ts";

const { accounts, currencies, transactions } = ledgerSchema;

const USD = currencyCode("USD");
const EUR = currencyCode("EUR");
const SEK = currencyCode("SEK");
const ACCOUNT = id<"accounts">("11111111-1111-4111-8111-111111111111");
const ARCHIVED = id<"accounts">("22222222-2222-4222-8222-222222222222");

let stores: ScratchStores;

beforeEach(() => {
  stores = scratchStores();
  const db = stores.ledger.replica.db;
  db.insert(currencies)
    .values([
      { code: USD, name: "US dollar", symbol: "$", decimals: 2, isPivot: true },
      { code: EUR, name: "Euro", symbol: "€", decimals: 2 },
      { code: SEK, name: "Swedish krona", symbol: "kr", decimals: 2 },
    ])
    .run();
  db.insert(accounts)
    .values([
      { id: ACCOUNT, name: "Wallet · USD", currency: USD },
      { id: ARCHIVED, name: "Old · EUR", currency: EUR, archived: true },
    ])
    .run();
  db.insert(transactions)
    .values([
      {
        id: id<"transactions">("33333333-3333-4333-8333-333333333333"),
        date: accountingDate("2026-08-23"),
        type: "expense" as const,
        accountId: ACCOUNT,
        amountOriginal: money.toMoney("10"),
        currency: USD,
        fxRate: money.pivotPerUnit("1"),
        payee: "Café A",
      },
      {
        id: id<"transactions">("44444444-4444-4444-8444-444444444444"),
        date: accountingDate("2026-08-24"),
        type: "expense" as const,
        accountId: ACCOUNT,
        amountOriginal: money.toMoney("5"),
        currency: USD,
        fxRate: money.pivotPerUnit("1"),
        payee: "Gone",
        deletedAt: new Date("2026-08-24T10:00:00Z"),
      },
    ])
    .run();
});

afterEach(() => stores.close());

it("counts the rows and the accounts a currency holds, skipping deleted rows", () => {
  const usage = readCurrencyUsage(stores.ledger.replica.db);
  expect(usage.get(USD)).toEqual({ transactions: 1, accounts: 1 });
});

/** An archived account still holds a balance, so it still holds its currency. */
it("counts an archived account too", () => {
  const usage = readCurrencyUsage(stores.ledger.replica.db);
  expect(usage.get(EUR)).toEqual({ transactions: 0, accounts: 1 });
});

/** The removable case: nothing at all points at it. */
it("says nothing at all about a currency nothing uses", () => {
  expect(readCurrencyUsage(stores.ledger.replica.db).get(SEK)).toBeUndefined();
});
