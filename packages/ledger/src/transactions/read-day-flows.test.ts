import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { beforeEach, expect, it } from "vitest";
import { ledgerSchema } from "../schema-map.ts";
import { type ScratchStores, scratchStores } from "../test/stores.ts";
import { readDayFlows } from "./read-day-flows.ts";
import { readPeriodSpend } from "./read-period-spend.ts";

const { accounts, currencies, transactions } = ledgerSchema;

const PLN = currencyCode("PLN");
const OWN_ACCOUNT = id<"accounts">("11111111-1111-4111-8111-111111111111");
const SHARED_ACCOUNT = id<"accounts">("22222222-2222-4222-8222-222222222222");
const SEPTEMBER = {
  start: accountingDate("2026-09-01"),
  end: accountingDate("2026-10-01"),
};

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

it("returns one row per day that has something on it", () => {
  const db = stores.ledger.replica.db;
  db.insert(transactions)
    .values([
      tx("01", { amountOriginal: money.toMoney("30") }),
      tx("02", { amountOriginal: money.toMoney("12.50") }),
      tx("03", { date: accountingDate("2026-09-09"), type: "income" as const }),
    ])
    .run();

  expect(readDayFlows(db, SEPTEMBER)).toEqual([
    {
      date: "2026-09-04",
      currency: "PLN",
      decimals: 2,
      spend: money.toMoney("42.50"),
      inflow: money.ZERO,
    },
    {
      date: "2026-09-09",
      currency: "PLN",
      decimals: 2,
      spend: money.ZERO,
      inflow: money.toMoney("100"),
    },
  ]);
});

it("adds up to what the card above it says", () => {
  // The calendar's marks and the month card are one answer to §5. This is the
  // check that keeps them one — two queries is how a screen gets two answers.
  const db = stores.ledger.replica.db;
  db.insert(transactions)
    .values([
      tx("04", { amountOriginal: money.toMoney("30") }),
      tx("05", { date: accountingDate("2026-09-20"), amountOriginal: money.toMoney("11.25") }),
      tx("06", { date: accountingDate("2026-09-21"), type: "income" as const }),
    ])
    .run();

  const days = readDayFlows(db, SEPTEMBER);
  const summed = days.reduce((total, day) => money.add(total, day.spend), money.ZERO);
  expect(summed).toEqual(readPeriodSpend(db, SEPTEMBER)[0]?.spend);
});

it("applies the same filters the period figure does", () => {
  const db = stores.ledger.replica.db;
  db.insert(transactions)
    .values([
      tx("07", { accountId: SHARED_ACCOUNT }),
      tx("08", { date: accountingDate("2026-08-31") }),
      tx("09", { date: accountingDate("2026-10-01") }),
      tx("10", { type: "transfer" as const }),
      tx("11", { deletedAt: new Date() }),
    ])
    .run();
  expect(readDayFlows(db, SEPTEMBER)).toEqual([]);
});
