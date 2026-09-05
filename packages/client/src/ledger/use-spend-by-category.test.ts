/** @vitest-environment jsdom */

import { renderHook } from "@testing-library/react";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { describe, expect, it, vi } from "vitest";
import { createPhoneLedger, type PhoneLedgerPort } from "./create-phone-ledger.ts";
import { basePort } from "./test-port.ts";
import { useSpendByCategory } from "./use-spend-by-category.ts";

function fakeController(readSpendByCategory: PhoneLedgerPort["readSpendByCategory"]) {
  return createPhoneLedger(basePort({ readSpendByCategory }), {
    capture: () => ({
      date: accountingDate("2026-09-04"),
      timeZone: "Europe/Warsaw",
      offsetMinutes: 120,
      at: new Date("2026-09-04T10:00:00Z"),
    }),
    id: () => id("22222222-2222-4222-8222-222222222222"),
  });
}

describe("useSpendByCategory", () => {
  const PLN = money.currencyCode("PLN");
  const period = { start: accountingDate("2026-08-01"), end: accountingDate("2026-09-01") };

  it("reads through the controller and memoises on [ledger, period, scope, revision]", () => {
    const read = vi.fn(() => [
      { currency: PLN, decimals: 2, categoryId: "cat-1", amount: money.toMoney("40") },
    ]);
    const ledger = fakeController(read);
    const { result, rerender } = renderHook(
      ({ p }: { p: money.Period }) => useSpendByCategory(ledger, p, "mine", 0),
      { initialProps: { p: period } },
    );

    expect(result.current).toEqual([
      { currency: PLN, decimals: 2, categoryId: "cat-1", amount: "40.00000000" },
    ]);
    expect(read).toHaveBeenCalledTimes(1);

    // Same period, same revision — no re-read.
    rerender({ p: period });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("re-reads when the scope changes — the band's segment is a dependency, not a label", () => {
    const read = vi.fn(() => []);
    const ledger = fakeController(read);
    const { rerender } = renderHook(
      ({ s }: { s: money.LedgerScope }) => useSpendByCategory(ledger, period, s, 0),
      { initialProps: { s: "mine" as money.LedgerScope } },
    );
    rerender({ s: "business" as money.LedgerScope });
    expect(read).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenLastCalledWith(period, "business");
  });

  it("re-reads when the period changes", () => {
    const read = vi.fn(() => []);
    const ledger = fakeController(read);
    const other = { start: accountingDate("2026-09-01"), end: accountingDate("2026-10-01") };
    const { rerender } = renderHook(
      ({ p }: { p: money.Period }) => useSpendByCategory(ledger, p, "mine", 0),
      {
        initialProps: { p: period },
      },
    );
    rerender({ p: other });
    expect(read).toHaveBeenCalledTimes(2);
  });
});
