/**
 * **The dot and the page it points at are one predicate.** Every case here is a
 * year the old read offered and Months then drew as twelve zeroes — a dot whose
 * whole job is to separate *nothing here* from *not loaded yet* was answering a
 * third thing.
 */

import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { beforeEach, expect, it } from "vitest";
import { ledgerSchema } from "../schema-map.ts";
import { type ScratchStores, scratchStores } from "../test/stores.ts";
import { readDayFlows } from "./read-day-flows.ts";
import { readLedgerYears } from "./read-ledger-years.ts";

const { accounts, currencies, transactions } = ledgerSchema;

const PLN = currencyCode("PLN");
const OWN_ACCOUNT = id<"accounts">("11111111-1111-4111-8111-111111111111");
const SHARED_ACCOUNT = id<"accounts">("22222222-2222-4222-8222-222222222222");

let stores: ScratchStores;

function tx(suffix: string, over: Record<string, unknown>) {
  return {
    id: id<"transactions">(`aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa${suffix}`),
    date: accountingDate("2026-09-04"),
    type: "expense" as const,
    accountId: OWN_ACCOUNT,
    amountOriginal: money.toMoney("100"),
    currency: PLN,
    fxRate: money.pivotPerUnit("1"),
    ...over,
  };
}

function year(y: number) {
  return {
    start: accountingDate(`${y}-01-01`),
    end: accountingDate(`${y + 1}-01-01`),
  };
}

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
});

it("names each year once, oldest first, however many rows it holds", () => {
  const db = stores.ledger.replica.db;
  db.insert(transactions)
    .values([
      tx("01", { date: accountingDate("2024-03-02") }),
      tx("02", { date: accountingDate("2024-11-30") }),
      tx("03", { date: accountingDate("2022-01-01") }),
    ])
    .run();

  expect(readLedgerYears(db)).toEqual([2022, 2024]);
});

it("does not offer a year whose only row is deleted", () => {
  const db = stores.ledger.replica.db;
  db.insert(transactions)
    .values([tx("01", { date: accountingDate("2021-06-06"), deletedAt: new Date() })])
    .run();

  expect(readLedgerYears(db)).toEqual([]);
});

/**
 * A transfer is a real row on a real account and the old read offered its year.
 * Months folds `readDayFlows`, which keeps income and expense only — so the dot
 * promised figures the page had none of.
 */
it("does not offer a year holding only transfers, which Months does not draw", () => {
  const db = stores.ledger.replica.db;
  db.insert(transactions)
    .values([tx("01", { date: accountingDate("2019-04-04"), type: "transfer" as const })])
    .run();

  expect(readDayFlows(db, year(2019)), "the page the dot points at").toEqual([]);
  expect(readLedgerYears(db)).toEqual([]);
});

it("does not offer a year holding only another household's account", () => {
  const db = stores.ledger.replica.db;
  db.insert(transactions)
    .values([tx("01", { date: accountingDate("2018-08-08"), accountId: SHARED_ACCOUNT })])
    .run();

  expect(readDayFlows(db, year(2018)), "the page the dot points at").toEqual([]);
  expect(readLedgerYears(db)).toEqual([]);
});

/**
 * The two reads are one predicate, so a year either has a dot *and* rows or
 * neither — the property, rather than the four cases above that instance it.
 */
it("offers exactly the years readDayFlows draws something for", () => {
  const db = stores.ledger.replica.db;
  db.insert(transactions)
    .values([
      tx("01", { date: accountingDate("2023-02-02"), type: "income" as const }),
      tx("02", { date: accountingDate("2022-02-02"), type: "transfer" as const }),
      tx("03", { date: accountingDate("2021-02-02"), accountId: SHARED_ACCOUNT }),
      tx("04", { date: accountingDate("2020-02-02"), deletedAt: new Date() }),
      tx("05", { date: accountingDate("2019-02-02") }),
    ])
    .run();

  const offered = readLedgerYears(db);
  for (const y of [2019, 2020, 2021, 2022, 2023]) {
    expect(offered.includes(y), `${y}`).toBe(readDayFlows(db, year(y)).length > 0);
  }
});
