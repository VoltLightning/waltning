/**
 * `readContextRows` — S09's *Who* and *Pair* rows (`computations.md` §6a),
 * against a real replica.
 */

import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { afterEach, beforeEach, expect, it } from "vitest";
import { ledgerSchema } from "../schema-map.ts";
import { type ScratchStores, scratchStores } from "../test/stores.ts";
import { readContextRows } from "./read-context-rows.ts";

const { accounts, counterparties, currencies, transactions } = ledgerSchema;

const USD = currencyCode("USD");
const CASH = id<"accounts">("11111111-1111-4111-8111-111111111111");
const SAVINGS = id<"accounts">("22222222-2222-4222-8222-222222222222");
const SHOP = id<"counterparties">("33333333-3333-4333-8333-333333333333");
const FRIEND = id<"counterparties">("44444444-4444-4444-8444-444444444444");
const WINDOW = {
  currency: USD,
  from: accountingDate("2026-03-01"),
  to: accountingDate("2026-08-31"),
};

let stores: ScratchStores;
let sequence = 0;

function txn(values: Partial<typeof transactions.$inferInsert>) {
  sequence += 1;
  return {
    id: id<"transactions">(`00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`),
    date: accountingDate("2026-08-06"),
    type: "expense" as const,
    accountId: CASH,
    amountOriginal: money.toMoney("10"),
    currency: USD,
    fxRate: money.pivotPerUnit("1"),
    enteredName: "",
    ...values,
  };
}

beforeEach(() => {
  stores = scratchStores();
  const db = stores.ledger.replica.db;
  db.insert(currencies)
    .values({ code: USD, name: "US dollar", symbol: "$", decimals: 2, isPivot: true })
    .run();
  db.insert(accounts)
    .values([
      { id: CASH, name: "Cash", currency: USD },
      { id: SAVINGS, name: "Savings", currency: USD },
    ])
    .run();
  db.insert(counterparties)
    .values([
      { id: SHOP, name: "Shop A", nameFolded: "shop a", kind: "company" as const },
      { id: FRIEND, name: "Friend A", nameFolded: "friend a", kind: "person" as const },
    ])
    .run();
  const move = (from: typeof CASH, to: typeof CASH, date: string) =>
    txn({
      type: "transfer",
      accountId: from,
      toAccountId: to,
      toAmount: money.toMoney("10"),
      toCurrency: USD,
      date: accountingDate(date),
    });
  db.insert(transactions)
    .values([
      txn({ counterpartyId: SHOP, amountOriginal: money.toMoney("48.90") }),
      txn({ counterpartyId: SHOP, isCapital: true, amountOriginal: money.toMoney("500") }),
      txn({ counterpartyId: SHOP, type: "income" }),
      txn({ counterpartyId: SHOP, date: accountingDate("2026-02-28") }),
      txn({ counterpartyId: SHOP, deletedAt: new Date("2026-08-07T00:00:00Z") }),
      // Owed by a friend, bought at the shop: the friend is not who it was *with*.
      txn({ counterpartyId: SHOP, obligationCounterpartyId: FRIEND, obligationRole: "debt" }),
      txn({ obligationCounterpartyId: FRIEND, obligationRole: "debt" }),
      move(CASH, SAVINGS, "2026-08-01"),
      move(SAVINGS, CASH, "2026-08-02"),
    ])
    .run();
});

afterEach(() => stores.close());

it("reads the identity link only, one type, inside the window — one-offs flagged, not dropped", () => {
  const shop = readContextRows(stores.ledger.replica.db, {
    ...WINDOW,
    kind: "who",
    counterpartyId: SHOP,
    type: "expense",
  });
  expect(shop.map((row) => [row.amountOriginal, row.isCapital]).sort()).toEqual([
    ["10.00000000", false],
    ["48.90000000", false],
    ["500.00000000", true],
  ]);
  const friend = readContextRows(stores.ledger.replica.db, {
    ...WINDOW,
    kind: "who",
    counterpartyId: FRIEND,
    type: "expense",
  });
  expect(friend).toEqual([]);
});

it("reads moves between two accounts in one direction only", () => {
  const rows = readContextRows(stores.ledger.replica.db, {
    ...WINDOW,
    kind: "pair",
    accountId: CASH,
    toAccountId: SAVINGS,
  });
  expect(rows.map((row) => row.date)).toEqual(["2026-08-01"]);
});
