/** @vitest-environment jsdom */

import { renderHook } from "@testing-library/react";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { describe, expect, it, vi } from "vitest";
import { createPhoneLedger, type PhoneLedgerPort } from "./create-phone-ledger.ts";
import { basePort } from "./test-port.ts";
import { useCounterpartyHistory } from "./use-counterparty-history.ts";

const EMPTY_PAGE = {
  rows: [],
  nextCursor: undefined,
  total: { count: 0, currencies: [] },
} as const;

function fakeController(searchTransactions: PhoneLedgerPort["searchTransactions"]) {
  return createPhoneLedger(basePort({ searchTransactions }), {
    capture: () => ({
      date: accountingDate("2026-09-04"),
      timeZone: "Europe/Warsaw",
      offsetMinutes: 120,
      at: new Date("2026-09-04T10:00:00Z"),
    }),
    id: () => id("22222222-2222-4222-8222-222222222222"),
  });
}

describe("useCounterpartyHistory (M2)", () => {
  it("reads the two histories once per counterparty/revision, not once per render", () => {
    const search = vi.fn(() => EMPTY_PAGE);
    const controller = fakeController(search);
    search.mockClear(); // drop the constructor's own `refresh()` — this hook makes no calls of its own yet.

    const { result, rerender } = renderHook(
      ({ revision }) => useCounterpartyHistory(controller, "nina", revision),
      { initialProps: { revision: controller.getSnapshot().revision } },
    );

    expect(search).toHaveBeenCalledTimes(2); // debt-only, then every-role.
    const first = result.current;

    // A re-render with the same revision (a keypad digit, a toggled section)
    // must not re-run either search — the whole point of the memo.
    rerender({ revision: controller.getSnapshot().revision });
    expect(search).toHaveBeenCalledTimes(2);
    expect(result.current).toBe(first);

    // A bumped revision (a write elsewhere) is the one thing that reruns it.
    rerender({ revision: controller.getSnapshot().revision + 1 });
    expect(search).toHaveBeenCalledTimes(4);
  });

  it("returns empty pages, with no search call, for an undefined counterparty", () => {
    const search = vi.fn(() => EMPTY_PAGE);
    const controller = fakeController(search);
    search.mockClear();

    const { result } = renderHook(() => useCounterpartyHistory(controller, undefined, 1));

    expect(search).not.toHaveBeenCalled();
    expect(result.current.debtHistory.rows).toEqual([]);
    expect(result.current.everyHistory.rows).toEqual([]);
  });
});
