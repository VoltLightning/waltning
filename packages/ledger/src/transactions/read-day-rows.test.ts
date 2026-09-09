import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { beforeEach, expect, it } from "vitest";
import { ledgerSchema } from "../schema-map.ts";
import { type ScratchStores, scratchStores } from "../test/stores.ts";
import { readDayRows } from "./read-day-rows.ts";

const { accounts, currencies, transactions } = ledgerSchema;

const PLN = currencyCode("PLN");
const ACCOUNT = id<"accounts">("11111111-1111-4111-8111-111111111111");
const DAY = accountingDate("2026-09-04");

let stores: ScratchStores;

function tx(suffix: string, over: Record<string, unknown> = {}) {
  return {
    id: id<"transactions">(`aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa${suffix}`),
    date: DAY,
    type: "expense" as const,
    accountId: ACCOUNT,
    payee: `Payee ${suffix}`,
    amountOriginal: money.toMoney("10"),
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
  db.insert(accounts).values({ id: ACCOUNT, name: "Bank A · PLN", currency: PLN }).run();
});

it("returns the day's rows and nothing from either side of it", () => {
  const db = stores.ledger.replica.db;
  db.insert(transactions)
    .values([
      tx("01"),
      tx("02"),
      tx("03", { date: accountingDate("2026-09-03") }),
      tx("04", { date: accountingDate("2026-09-05") }),
    ])
    .run();

  const rows = readDayRows(db, DAY);
  expect(rows.map((row) => row.payee)).toEqual(["Payee 01", "Payee 02"]);
});

it("is bounded by the date, never by a row count", () => {
  // `readLedgerPage` stops at thirty because a ledger does not end. A day does,
  // and a calendar showing the first thirty rows of one would be a shorter
  // truth than the mark above it, which counted all of them.
  const db = stores.ledger.replica.db;
  db.insert(transactions)
    .values(Array.from({ length: 42 }, (_, index) => tx(String(index).padStart(2, "0"))))
    .run();

  expect(readDayRows(db, DAY)).toHaveLength(42);
});

it("leaves out what the ledger has deleted", () => {
  const db = stores.ledger.replica.db;
  db.insert(transactions)
    .values([tx("05"), tx("06", { deletedAt: new Date() })])
    .run();

  expect(readDayRows(db, DAY)).toHaveLength(1);
});

it("signs a row the way the list does, so the two cannot disagree", () => {
  const db = stores.ledger.replica.db;
  db.insert(transactions)
    .values([tx("07", { amountOriginal: money.toMoney("96") })])
    .run();

  const [row] = readDayRows(db, DAY);
  expect(row?.amount).toEqual(money.toMoney("-96"));
});
