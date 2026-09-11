/** @vitest-environment jsdom */

import { renderHook } from "@testing-library/react";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { describe, expect, it, vi } from "vitest";
import {
  createPhoneLedger,
  type PhoneLedgerPort,
  type PhoneLedgerSnapshot,
} from "../create-phone-ledger/create-phone-ledger.ts";
import { basePort } from "../test-port.ts";
import { useLedgerYears } from "./use-ledger-years.ts";

function fakeController(readLedgerYears: PhoneLedgerPort["readLedgerYears"]) {
  return createPhoneLedger(basePort({ readLedgerYears }), {
    capture: () => ({
      date: accountingDate("2026-09-04"),
      timeZone: "Europe/Warsaw",
      offsetMinutes: 120,
      at: new Date("2026-09-04T10:00:00Z"),
    }),
    id: () => id("22222222-2222-4222-8222-222222222222"),
  });
}

const REVISION = 0 as unknown as PhoneLedgerSnapshot;

describe("useLedgerYears", () => {
  /**
   * The gate is the point: the grid is the only thing that asks, and a screen
   * that scanned the ledger to draw a sheet nobody opened would pay for it on
   * every render of the Months page.
   */
  it("does not read the ledger while the sheet is closed", () => {
    const read = vi.fn(() => [2024]);
    const { result } = renderHook(() => useLedgerYears(fakeController(read), false, REVISION));
    expect(read).not.toHaveBeenCalled();
    expect(result.current.size).toBe(0);
  });

  it("reads once for the whole grid, not once per cell", () => {
    const read = vi.fn(() => [2019, 2024, 2026]);
    const ledger = fakeController(read);
    const { result, rerender } = renderHook(() => useLedgerYears(ledger, true, REVISION));
    rerender();
    rerender();
    expect(read).toHaveBeenCalledTimes(1);
    expect([...result.current]).toEqual([2019, 2024, 2026]);
  });
});
