/**
 * `search_transactions`'s structural filters, server side —
 * `SearchTransactionsFilter`'s own doc: `text` is accepted, not yet applied
 * (§13's trigram needs `pg_trgm` and a GIN index, a migration this fix
 * round holds none of); every other filter is a plain `WHERE` and is
 * exercised here, mirroring `@waltning/ledger`'s `search-transactions.ts`
 * structural conditions.
 */

import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { accounts, categories, currencies, transactions } from "@waltning/db/schema";
import { type Scratch, scratchDatabase } from "@waltning/db/test/scratch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { searchTransactions } from "./transactions.service.ts";

let s: Scratch;

const OWN = id<"accounts">("44444444-4444-4444-4444-000000000001");
const SHARED = id<"accounts">("44444444-4444-4444-4444-000000000002");
const FOOD = id<"categories">("44444444-4444-4444-4444-000000000003");
const TRAVEL = id<"categories">("44444444-4444-4444-4444-000000000004");

beforeAll(async () => {
  s = await scratchDatabase("search-transactions");
  const PLN = currencyCode("PLN");
  await s.db
    .insert(currencies)
    .values({ code: PLN, name: "Polish Złoty", decimals: 2, isPivot: true });
  await s.db.insert(accounts).values([
    { id: OWN, name: "Bank A · PLN", currency: PLN, ownership: "own" },
    { id: SHARED, name: "Household · PLN", currency: PLN, ownership: "shared" },
  ]);
  await s.db.insert(categories).values([
    { id: FOOD, name: "Food", kind: "expense" },
    { id: TRAVEL, name: "Travel", kind: "expense" },
  ]);
  await s.db.insert(transactions).values([
    {
      id: id<"transactions">("44444444-4444-4444-4444-0000000000a1"),
      date: accountingDate("2026-08-01"),
      type: "expense",
      accountId: OWN,
      categoryId: FOOD,
      amountOriginal: money.toMoney("10"),
      currency: PLN,
      fxRate: money.pivotPerUnit("1"),
      payee: "Groceries own",
    },
    {
      id: id<"transactions">("44444444-4444-4444-4444-0000000000a2"),
      date: accountingDate("2026-08-02"),
      type: "expense",
      accountId: OWN,
      categoryId: TRAVEL,
      isBusiness: true,
      amountOriginal: money.toMoney("20"),
      currency: PLN,
      fxRate: money.pivotPerUnit("1"),
      payee: "Business lunch",
    },
    {
      id: id<"transactions">("44444444-4444-4444-4444-0000000000a3"),
      date: accountingDate("2026-08-03"),
      type: "expense",
      accountId: SHARED,
      categoryId: FOOD,
      amountOriginal: money.toMoney("30"),
      currency: PLN,
      fxRate: money.pivotPerUnit("1"),
      payee: "Shared groceries",
    },
  ]);
}, 60_000);

afterAll(async () => {
  await s?.drop();
});

describe("searchTransactions structural filters", () => {
  it("filters by account", async () => {
    const page = await searchTransactions(s.db, { accountIds: [SHARED] }, 50, null);
    expect(page.rows.map((r) => r.payee)).toEqual(["Shared groceries"]);
  });

  it("filters by category", async () => {
    const page = await searchTransactions(s.db, { categoryIds: [TRAVEL] }, 50, null);
    expect(page.rows.map((r) => r.payee)).toEqual(["Business lunch"]);
  });

  it("scope=mine excludes shared accounts and business rows", async () => {
    const page = await searchTransactions(s.db, { scope: "mine" }, 50, null);
    expect(page.rows.map((r) => r.payee).sort()).toEqual(["Groceries own"]);
  });

  it("scope=shared includes only shared-ownership accounts", async () => {
    const page = await searchTransactions(s.db, { scope: "shared" }, 50, null);
    expect(page.rows.map((r) => r.payee)).toEqual(["Shared groceries"]);
  });

  it("scope=business includes only business rows, regardless of ownership", async () => {
    const page = await searchTransactions(s.db, { scope: "business" }, 50, null);
    expect(page.rows.map((r) => r.payee)).toEqual(["Business lunch"]);
  });

  it("filters by date range", async () => {
    const page = await searchTransactions(
      s.db,
      { from: accountingDate("2026-08-02"), to: accountingDate("2026-08-02") },
      50,
      null,
    );
    expect(page.rows.map((r) => r.payee)).toEqual(["Business lunch"]);
  });
});
