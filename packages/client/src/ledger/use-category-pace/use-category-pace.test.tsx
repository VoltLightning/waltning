/** @vitest-environment jsdom */

import { renderHook } from "@testing-library/react";
import { accountingDate } from "@waltning/core/date";
import { currencyCode, toMoney } from "@waltning/core/money";
import { expect, it, vi } from "vitest";
import { useCategoryPace } from "./use-category-pace.ts";

const PLN = currencyCode("PLN");
const TODAY = accountingDate("2026-09-11");

/** Spend per month start, for one category; anything else is zero. */
function ledgerSpending(byMonth: Record<string, string>, categoryId = "cat-1") {
  const readSpendByCategory = vi.fn((period: { start: string }) => {
    const amount = byMonth[period.start];
    return amount === undefined
      ? []
      : [{ currency: PLN, decimals: 2, categoryId, amount: toMoney(amount) }];
  });
  return { readSpendByCategory };
}

it("states this month as a whole percentage of the mean of the previous three", () => {
  const ledger = ledgerSpending({
    "2026-09-01": "61",
    "2026-08-01": "100",
    "2026-07-01": "120",
    "2026-06-01": "80",
  });
  const { result } = renderHook(() => useCategoryPace(ledger, "cat-1", PLN, TODAY, 1));
  expect(result.current).toEqual({ percent: 61 });
});

it("leaves months with nothing out of the mean, rather than averaging in zeroes", () => {
  const ledger = ledgerSpending({ "2026-09-01": "50", "2026-08-01": "100" });
  const { result } = renderHook(() => useCategoryPace(ledger, "cat-1", PLN, TODAY, 1));
  expect(result.current).toEqual({ percent: 50 });
});

it("is nothing with no habit to measure against, and nothing with no category", () => {
  const ledger = ledgerSpending({ "2026-09-01": "50" });
  expect(
    renderHook(() => useCategoryPace(ledger, "cat-1", PLN, TODAY, 1)).result.current,
  ).toBeNull();
  expect(renderHook(() => useCategoryPace(ledger, null, PLN, TODAY, 1)).result.current).toBeNull();
  // Four reads at most, and none at all without a category.
  expect(ledger.readSpendByCategory).toHaveBeenCalledTimes(4);
});

it("counts only the category's own rows", () => {
  const readSpendByCategory = vi.fn((period: { start: string }) =>
    period.start === "2026-09-01"
      ? [
          { currency: PLN, decimals: 2, categoryId: "cat-1", amount: toMoney("10") },
          { currency: PLN, decimals: 2, categoryId: "cat-2", amount: toMoney("990") },
        ]
      : [{ currency: PLN, decimals: 2, categoryId: "cat-1", amount: toMoney("40") }],
  );
  const { result } = renderHook(() =>
    useCategoryPace({ readSpendByCategory }, "cat-1", PLN, TODAY, 1),
  );
  expect(result.current).toEqual({ percent: 25 });
});

/**
 * `spendByCategory` buckets by currency and category, so one category held
 * in two currencies is two rows — and a sum across them adds złoty to euro.
 * PLN 100 + EUR 100 this month over PLN 200 last month read *100% of usual*
 * while the PLN habit had halved.
 */
it("measures one currency — the draft account's — never a sum across them", () => {
  const EUR = currencyCode("EUR");
  const readSpendByCategory = vi.fn((period: { start: string }) =>
    period.start === "2026-09-01"
      ? [
          { currency: PLN, decimals: 2, categoryId: "cat-1", amount: toMoney("100") },
          { currency: EUR, decimals: 2, categoryId: "cat-1", amount: toMoney("100") },
        ]
      : period.start === "2026-08-01"
        ? [{ currency: PLN, decimals: 2, categoryId: "cat-1", amount: toMoney("200") }]
        : [],
  );
  const { result } = renderHook(() =>
    useCategoryPace({ readSpendByCategory }, "cat-1", PLN, TODAY, 1),
  );
  expect(result.current).toEqual({ percent: 50 });
});

/**
 * Lines carry no positivity check, so a month can net to zero or below (a
 * refund larger than the spend). `+100` and `−100` averaged to a mean of 0,
 * and `50 / 0` drew *Infinity% of usual*.
 */
it("leaves a month that nets to nothing or less out, and says nothing over no positive mean", () => {
  const ledger = ledgerSpending({ "2026-09-01": "50", "2026-08-01": "100", "2026-07-01": "-100" });
  expect(renderHook(() => useCategoryPace(ledger, "cat-1", PLN, TODAY, 1)).result.current).toEqual({
    percent: 50,
  });
  const refunds = ledgerSpending({
    "2026-09-01": "50",
    "2026-08-01": "-100",
    "2026-07-01": "-100",
  });
  expect(
    renderHook(() => useCategoryPace(refunds, "cat-1", PLN, TODAY, 1)).result.current,
  ).toBeNull();
  const nothing = ledgerSpending({ "2026-09-01": "-5", "2026-08-01": "100" });
  expect(
    renderHook(() => useCategoryPace(nothing, "cat-1", PLN, TODAY, 1)).result.current,
  ).toBeNull();
});
