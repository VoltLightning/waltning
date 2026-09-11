/**
 * §8.1: a `range` empty state must offer *the nearest period that does, with
 * its count*. Everything here is that sentence, and the cases where a naive
 * answer sends the reader somewhere just as empty as where they started.
 */

import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { beforeEach, expect, it } from "vitest";
import { ledgerSchema } from "../schema-map.ts";
import { type ScratchStores, scratchStores } from "../test/stores.ts";
import { readNearestActivity } from "./read-nearest-activity.ts";

const { accounts, currencies, transactions } = ledgerSchema;

const PLN = currencyCode("PLN");
const OWN_ACCOUNT = id<"accounts">("11111111-1111-4111-8111-111111111111");
const SHARED_ACCOUNT = id<"accounts">("22222222-2222-4222-8222-222222222222");

const JULY = { start: accountingDate("2026-07-01"), end: accountingDate("2026-08-01") };

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

it("is nothing at all when the ledger holds nothing — that is first-run, not range", () => {
  expect(readNearestActivity(stores.ledger.replica.db, JULY)).toBeNull();
});

it("names the month, the day inside it, and how many entries that month holds", () => {
  const db = stores.ledger.replica.db;
  db.insert(transactions)
    .values([
      tx("01", { date: accountingDate("2026-09-09") }),
      tx("02", { date: accountingDate("2026-09-20") }),
      tx("03", { date: accountingDate("2026-11-02") }),
    ])
    .run();

  expect(readNearestActivity(db, JULY)).toEqual({
    date: "2026-09-09",
    month: "2026-09",
    count: 2,
  });
});

it("looks backwards as readily as forwards", () => {
  const db = stores.ledger.replica.db;
  db.insert(transactions)
    .values([tx("01", { date: accountingDate("2026-05-30") })])
    .run();

  expect(readNearestActivity(db, JULY)?.month).toBe("2026-05");
});

/**
 * Measured in days off the period's own edges, which a string comparison
 * cannot do: 30 June is one day before July and 1 September is thirty-one days
 * after it, and both are "adjacent months" to anything that compares `2026-06`
 * with `2026-09`.
 */
it("picks the nearer of the two by days, not by how the strings sort", () => {
  const db = stores.ledger.replica.db;
  db.insert(transactions)
    .values([
      tx("01", { date: accountingDate("2026-05-01") }),
      tx("02", { date: accountingDate("2026-08-02") }),
    ])
    .run();

  expect(readNearestActivity(db, JULY)?.date).toBe("2026-08-02");
});

/**
 * Equidistant is a real case, and everything else on this screen is
 * reverse-chronological.
 */
it("gives the past the tie", () => {
  const db = stores.ledger.replica.db;
  db.insert(transactions)
    .values([
      tx("01", { date: accountingDate("2026-06-30") }),
      tx("02", { date: accountingDate("2026-08-01") }),
    ])
    .run();

  expect(readNearestActivity(db, JULY)?.date).toBe("2026-06-30");
});

/**
 * Sending a reader to a month whose only row is a transfer, or another
 * household's, is sending them to a page as empty as the one they are on —
 * worse than saying nothing, because they made the trip.
 */
it("only offers a month the calendar will actually draw something in", () => {
  const db = stores.ledger.replica.db;
  db.insert(transactions)
    .values([
      tx("01", { date: accountingDate("2026-08-02"), type: "transfer" as const }),
      tx("02", { date: accountingDate("2026-08-03"), accountId: SHARED_ACCOUNT }),
      tx("03", { date: accountingDate("2026-08-04"), deletedAt: new Date() }),
      tx("04", { date: accountingDate("2026-12-01") }),
    ])
    .run();

  expect(readNearestActivity(db, JULY)).toEqual({
    date: "2026-12-01",
    month: "2026-12",
    count: 1,
  });
});

it("counts only the month it names, not the ledger", () => {
  const db = stores.ledger.replica.db;
  db.insert(transactions)
    .values([
      tx("01", { date: accountingDate("2026-08-02") }),
      tx("02", { date: accountingDate("2026-08-03") }),
      tx("03", { date: accountingDate("2026-09-03") }),
    ])
    .run();

  expect(readNearestActivity(db, JULY)?.count).toBe(2);
});
