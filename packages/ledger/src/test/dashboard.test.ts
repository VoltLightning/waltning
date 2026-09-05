/**
 * `DESK4`'s three new reads, end to end through the replica store —
 * `figures.test.ts`'s own pattern (`scratchStores()`, real tables), for the
 * same reason: these are folds a screen trusts, not a unit worth mocking the
 * database out from under.
 */

import { accountingDate, yearMonth } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { afterEach, describe, expect, it } from "vitest";
import { readActiveLayout } from "../dashboard/read-active-layout.ts";
import { ledgerSchema } from "../schema-map.ts";
import { readIncomeVsExpense } from "../transactions/read-income-vs-expense.ts";
import { readSpendByCategory } from "../transactions/read-spend-by-category.ts";
import { type ScratchStores, scratchStores } from "./stores.ts";

const { accounts, categories, currencies, transactionLines, transactions } = ledgerSchema;
const PLN = currencyCode("PLN");

describe("readActiveLayout — DESK4", () => {
  let stores: ScratchStores;
  afterEach(() => stores.close());

  it("reads the seeded default layout and its five widgets in sort order", () => {
    stores = scratchStores();
    const layout = readActiveLayout(stores.ledger.replica.db);
    expect(layout?.name).toBe("Standing");
    expect(layout?.widgets.map((w) => w.kind)).toEqual([
      "balances",
      "recent",
      "debt",
      "spend_by_category",
      "income_vs_expense",
    ]);
    expect(layout?.widgets.map((w) => w.size)).toEqual(["m", "m", "s", "m", "l"]);
  });

  /**
   * M5 — the replica had no bound on `is_active` at all: `packages/db` has
   * carried `dashboard_layouts_one_active` since `0000`, and this side had
   * neither the index nor a trigger, while three doc comments claimed `null`
   * was reachable "only on an empty, never-migrated database". `0011`'s
   * migration adds the index; this is it refusing.
   */
  it("refuses a second active layout", () => {
    stores = scratchStores();
    expect(() =>
      stores.ledger.replica.db
        .insert(ledgerSchema.dashboardLayouts)
        .values({
          id: id<"dashboardLayouts">("00000000-0000-4000-8000-00000000d0ff"),
          name: "Second",
          isActive: true,
        })
        .run(),
    ).toThrow(/UNIQUE/i);
  });
});

describe("readSpendByCategory — DESK4", () => {
  let stores: ScratchStores;
  afterEach(() => stores.close());

  it("counts a four-line split transaction once, through the real replica", () => {
    stores = scratchStores();
    const db = stores.ledger.replica.db;
    const period = { start: accountingDate("2026-08-01"), end: accountingDate("2026-09-01") };

    db.insert(currencies)
      .values({ code: PLN, name: "Polish Złoty", decimals: 2, isPivot: true })
      .run();
    db.insert(accounts)
      .values({
        id: id<"accounts">("11111111-1111-4111-8111-111111111111"),
        name: "Bank A · PLN",
        currency: PLN,
        openingBalance: money.ZERO,
        ownership: "own",
      })
      .run();
    db.insert(categories)
      .values([
        {
          id: id<"categories">("22222222-2222-4222-8222-222222222222"),
          name: "Dining",
          kind: "expense",
        },
        {
          id: id<"categories">("33333333-3333-4333-8333-333333333333"),
          name: "Groceries",
          kind: "expense",
        },
      ])
      .run();
    db.insert(transactions)
      .values({
        id: id<"transactions">("44444444-4444-4444-8444-444444444444"),
        date: accountingDate("2026-08-12"),
        type: "expense",
        accountId: id<"accounts">("11111111-1111-4111-8111-111111111111"),
        amountOriginal: money.toMoney("100"),
        currency: PLN,
        fxRate: money.pivotPerUnit("1"),
      })
      .run();
    db.insert(transactionLines)
      .values([
        {
          id: id<"transactionLines">("55555555-5555-4555-8555-555555555555"),
          transactionId: id<"transactions">("44444444-4444-4444-8444-444444444444"),
          description: "Dinner",
          amount: money.toMoney("25"),
          categoryId: id<"categories">("22222222-2222-4222-8222-222222222222"),
        },
        {
          id: id<"transactionLines">("66666666-6666-4666-8666-666666666666"),
          transactionId: id<"transactions">("44444444-4444-4444-8444-444444444444"),
          description: "Wine",
          amount: money.toMoney("25"),
          categoryId: id<"categories">("22222222-2222-4222-8222-222222222222"),
        },
        {
          id: id<"transactionLines">("77777777-7777-4777-8777-777777777777"),
          transactionId: id<"transactions">("44444444-4444-4444-8444-444444444444"),
          description: "Snacks",
          amount: money.toMoney("30"),
          categoryId: id<"categories">("33333333-3333-4333-8333-333333333333"),
        },
        {
          id: id<"transactionLines">("88888888-8888-4888-8888-888888888888"),
          transactionId: id<"transactions">("44444444-4444-4444-8444-444444444444"),
          description: "Taxi",
          amount: money.toMoney("20"),
          categoryId: null,
        },
      ])
      .run();

    const result = readSpendByCategory(db, period, "mine");
    const total = result.reduce((sum, row) => money.add(sum, row.amount), money.ZERO);
    expect(total).toBe("100.00000000");
    expect(result).toHaveLength(3);
  });
});

describe("readIncomeVsExpense — DESK4", () => {
  let stores: ScratchStores;
  afterEach(() => stores.close());

  it("sums income and expense per trailing month bucket, capital excluded", () => {
    stores = scratchStores();
    const db = stores.ledger.replica.db;

    db.insert(currencies)
      .values({ code: PLN, name: "Polish Złoty", decimals: 2, isPivot: true })
      .run();
    db.insert(accounts)
      .values({
        id: id<"accounts">("11111111-1111-4111-8111-111111111111"),
        name: "Bank A · PLN",
        currency: PLN,
        openingBalance: money.ZERO,
        ownership: "own",
      })
      .run();
    db.insert(transactions)
      .values([
        {
          id: id<"transactions">("22222222-2222-4222-8222-222222222222"),
          date: accountingDate("2026-08-05"),
          type: "income",
          accountId: id<"accounts">("11111111-1111-4111-8111-111111111111"),
          amountOriginal: money.toMoney("300"),
          currency: PLN,
          fxRate: money.pivotPerUnit("1"),
        },
        {
          id: id<"transactions">("33333333-3333-4333-8333-333333333333"),
          date: accountingDate("2026-08-06"),
          type: "expense",
          accountId: id<"accounts">("11111111-1111-4111-8111-111111111111"),
          amountOriginal: money.toMoney("500000"),
          currency: PLN,
          isCapital: true,
          fxRate: money.pivotPerUnit("1"),
        },
      ])
      .run();

    const buckets = money.trailingMonthBuckets(yearMonth("2026-08"), 1);
    const result = readIncomeVsExpense(db, buckets, "mine");
    expect(result).toEqual([
      {
        label: "2026-08",
        currency: PLN,
        decimals: 2,
        income: "300.00000000",
        expense: "0.00000000",
      },
    ]);
  });
});
