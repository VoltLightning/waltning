import { expect, it } from "vitest";
import type { PayeeHistoryRow } from "./payee-memory.ts";
import { recentCategories } from "./recent-categories.ts";

function row(payee: string, categoryId: string, date: string): PayeeHistoryRow {
  return { payee, categoryId, date } as PayeeHistoryRow;
}

const HISTORY = [
  row("Market B", "groceries", "2026-09-21"),
  row("Café A", "eating-out", "2026-09-20"),
  row("Lidl", "groceries", "2026-09-19"),
  row("Salary", "salary", "2026-09-18"),
  row("Tram", "transport", "2026-09-17"),
  row("Clinic G", "health", "2026-09-16"),
  row("Rent Co", "rent", "2026-09-01"),
];

it("names each category once, in the order it was last used", () => {
  const eligible = new Set(["groceries", "eating-out", "transport", "health", "rent"]);
  expect(recentCategories(HISTORY, eligible)).toEqual([
    "groceries",
    "eating-out",
    "transport",
    "health",
  ]);
});

/** The sheet's leaves are one kind at a time; an income category is not a recent expense. */
it("skips what the sheet cannot show", () => {
  expect(recentCategories(HISTORY, new Set(["salary", "rent"]))).toEqual(["salary", "rent"]);
});

it("stops at the limit, and says nothing over an empty history", () => {
  expect(recentCategories(HISTORY, new Set(["groceries", "rent", "health"]), 2)).toEqual([
    "groceries",
    "health",
  ]);
  expect(recentCategories([], new Set(["groceries"]))).toEqual([]);
});
