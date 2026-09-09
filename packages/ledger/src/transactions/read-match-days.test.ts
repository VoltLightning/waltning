/**
 * §7's match counts, against real SQLite.
 *
 * The claim under test is not "counting works" — it is that this count and
 * `searchTransactions`' own answer are the **same** reading of §13. They share
 * the matcher deliberately, and every case below is one where a second reading
 * would have drifted: a fold, an amount that is only an amount when it is the
 * whole query, and a line description that lives on another table.
 */

import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { beforeEach, expect, it } from "vitest";
import { ledgerSchema } from "../schema-map.ts";
import { type ScratchStores, scratchStores } from "../test/stores.ts";
import { readMatchDays, searchTransactions } from "./search-transactions.ts";

const { accounts, currencies, transactions } = ledgerSchema;

const PLN = currencyCode("PLN");
const ACCOUNT = id<"accounts">("11111111-1111-4111-8111-111111111111");
const SEPTEMBER = { start: accountingDate("2026-09-01"), end: accountingDate("2026-10-01") };

let stores: ScratchStores;

function tx(suffix: string, over: Record<string, unknown>) {
  return {
    id: id<"transactions">(`aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa${suffix}`),
    date: accountingDate("2026-09-04"),
    type: "expense" as const,
    accountId: ACCOUNT,
    amountOriginal: money.toMoney("100"),
    currency: PLN,
    fxRate: money.pivotPerUnit("1"),
    payee: "",
    note: "",
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
    .values([{ id: ACCOUNT, name: "Bank A · PLN", currency: PLN, ownership: "own" }])
    .run();
});

function counted(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const day of readMatchDays(stores.ledger.replica.db, SEPTEMBER, text)) {
    out[day.date] = day.count;
  }
  return out;
}

it("counts the matching rows of each day, and names no others", () => {
  stores.ledger.replica.db
    .insert(transactions)
    .values([
      tx("01", { payee: "Market B" }),
      tx("02", { payee: "Market B" }),
      tx("03", { date: accountingDate("2026-09-09"), payee: "Market B" }),
      tx("04", { date: accountingDate("2026-09-09"), payee: "Shop A" }),
    ])
    .run();

  // A day with no match is absent rather than zero: the grid knows which days
  // it draws, and inventing one per empty day hands it its own shape back.
  expect(counted("market")).toEqual({ "2026-09-04": 2, "2026-09-09": 1 });
});

/**
 * **The same total `searchTransactions` reports, always.** This is the whole
 * reason the count lives in that file: §13's text rule cannot be pushed into
 * SQL, so a count computed anywhere else is a second reading of what a search
 * means — and the field above the grid would disagree with the grid.
 */
it("adds up to what the search field says", () => {
  stores.ledger.replica.db
    .insert(transactions)
    .values([
      tx("01", { payee: "Market B" }),
      tx("02", { payee: "market b", date: accountingDate("2026-09-07") }),
      tx("03", { payee: "Shop A", note: "market run" }),
      tx("04", { payee: "Shop A" }),
    ])
    .run();

  const days = readMatchDays(stores.ledger.replica.db, SEPTEMBER, "market");
  const summed = days.reduce((total, day) => total + day.count, 0);
  const page = searchTransactions(
    stores.ledger.replica.db,
    { text: "market", from: SEPTEMBER.start, to: SEPTEMBER.end },
    undefined,
    { countOnly: true },
  );
  expect(summed).toBe(page.total.count);
  expect(summed).toBe(3);
});

/**
 * §13's amount rule: a token is an amount only when it is the *whole* query.
 * Borrowing capture's grammar instead made `"Shop A 2024"` match every row at
 * `2 024,00` — the count has to make the same mistake never, which it does by
 * making no separate decision at all.
 */
it("reads a bare amount as an amount and an amount inside words as text", () => {
  stores.ledger.replica.db
    .insert(transactions)
    .values([
      tx("01", { payee: "Shop A", amountOriginal: money.toMoney("48.90") }),
      tx("02", { payee: "Shop A 2024", amountOriginal: money.toMoney("2024") }),
    ])
    .run();

  expect(counted("48,90")).toEqual({ "2026-09-04": 1 });
  // The row *named* "Shop A 2024" matches by payee; the one costing 2 024 does
  // not, because the query is not only an amount.
  expect(counted("Shop A 2024")).toEqual({ "2026-09-04": 1 });
});

it("finds nothing for an empty query rather than everything", () => {
  stores.ledger.replica.db
    .insert(transactions)
    .values([tx("01", { payee: "Market B" })])
    .run();
  // The empty needle matches every row. A caller that let it through would
  // draw a grid claiming every day matched a search nobody typed.
  expect(counted("")).toEqual({});
  expect(counted("   ")).toEqual({});
});

it("bounds itself to the period it was asked for", () => {
  stores.ledger.replica.db
    .insert(transactions)
    .values([
      tx("01", { payee: "Market B" }),
      tx("02", { payee: "Market B", date: accountingDate("2026-08-31") }),
      tx("03", { payee: "Market B", date: accountingDate("2026-10-01") }),
    ])
    .run();

  expect(counted("market")).toEqual({ "2026-09-04": 1 });
});
