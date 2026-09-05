/** @vitest-environment jsdom */

import { renderHook } from "@testing-library/react";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { describe, expect, it, vi } from "vitest";
import { createPhoneLedger, type PhoneLedgerPort } from "./create-phone-ledger.ts";
import { basePort } from "./test-port.ts";
import { useIncomeVsExpense } from "./use-income-vs-expense.ts";

function fakeController(readIncomeVsExpense: PhoneLedgerPort["readIncomeVsExpense"]) {
  return createPhoneLedger(basePort({ readIncomeVsExpense }), {
    capture: () => ({
      date: accountingDate("2026-09-04"),
      timeZone: "Europe/Warsaw",
      offsetMinutes: 120,
      at: new Date("2026-09-04T10:00:00Z"),
    }),
    id: () => id("22222222-2222-4222-8222-222222222222"),
  });
}

describe("useIncomeVsExpense", () => {
  const PLN = money.currencyCode("PLN");
  const buckets = [
    { label: "2026-08", start: accountingDate("2026-08-01"), end: accountingDate("2026-09-01") },
  ];

  it("reads through the controller and memoises on [ledger, buckets, scope, revision]", () => {
    const read = vi.fn(() => [
      {
        label: "2026-08",
        currency: PLN,
        decimals: 2,
        income: money.toMoney("100"),
        expense: money.toMoney("40"),
      },
    ]);
    const ledger = fakeController(read);
    const { result, rerender } = renderHook(() => useIncomeVsExpense(ledger, buckets, "mine", 0));

    expect(result.current).toEqual([
      {
        label: "2026-08",
        currency: PLN,
        decimals: 2,
        income: "100.00000000",
        expense: "40.00000000",
      },
    ]);
    expect(read).toHaveBeenCalledTimes(1);

    rerender();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("re-reads when revision bumps", () => {
    const read = vi.fn(() => []);
    const ledger = fakeController(read);
    const { rerender } = renderHook(
      ({ revision }: { revision: number }) => useIncomeVsExpense(ledger, buckets, "mine", revision),
      {
        initialProps: { revision: 0 },
      },
    );
    rerender({ revision: 1 });
    expect(read).toHaveBeenCalledTimes(2);
  });
});
