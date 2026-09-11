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
import { useNearestActivity } from "./use-nearest-activity.ts";

const PERIOD = { start: accountingDate("2026-07-01"), end: accountingDate("2026-08-01") };
const REVISION = 0 as unknown as PhoneLedgerSnapshot;

function fakeController(readNearestActivity: PhoneLedgerPort["readNearestActivity"]) {
  return createPhoneLedger(basePort({ readNearestActivity }), {
    capture: () => ({
      date: accountingDate("2026-09-04"),
      timeZone: "Europe/Warsaw",
      offsetMinutes: 120,
      at: new Date("2026-09-04T10:00:00Z"),
    }),
    id: () => id("22222222-2222-4222-8222-222222222222"),
  });
}

describe("useNearestActivity", () => {
  it("does not ask from a month that has entries of its own", () => {
    const read = vi.fn(() => null);
    const { result } = renderHook(() =>
      useNearestActivity(fakeController(read), PERIOD, false, REVISION),
    );
    expect(read).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it("asks once, and holds the answer across renders", () => {
    const nearest = { date: accountingDate("2026-09-09"), month: "2026-09", count: 2 };
    const read = vi.fn(() => nearest);
    const ledger = fakeController(read);
    const { result, rerender } = renderHook(() =>
      useNearestActivity(ledger, PERIOD, true, REVISION),
    );
    rerender();
    expect(read).toHaveBeenCalledTimes(1);
    expect(result.current).toEqual(nearest);
  });
});
