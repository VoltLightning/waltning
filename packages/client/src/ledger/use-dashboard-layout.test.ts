/** @vitest-environment jsdom */

import { renderHook } from "@testing-library/react";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { describe, expect, it, vi } from "vitest";
import { createPhoneLedger, type PhoneLedgerPort } from "./create-phone-ledger.ts";
import { basePort } from "./test-port.ts";
import { useDashboardLayout } from "./use-dashboard-layout.ts";

function fakeController(readActiveDashboardLayout: PhoneLedgerPort["readActiveDashboardLayout"]) {
  return createPhoneLedger(basePort({ readActiveDashboardLayout }), {
    capture: () => ({
      date: accountingDate("2026-09-04"),
      timeZone: "Europe/Warsaw",
      offsetMinutes: 120,
      at: new Date("2026-09-04T10:00:00Z"),
    }),
    id: () => id("22222222-2222-4222-8222-222222222222"),
  });
}

describe("useDashboardLayout", () => {
  it("reads the active layout through the controller and memoises on [ledger, revision]", () => {
    const read = vi.fn(() => ({
      id: "layout-1",
      name: "Standing",
      widgets: [
        { id: "w1", kind: "balances", slot: "a1", size: "m" as const, config: {}, sort: 0 },
      ],
    }));
    const ledger = fakeController(read);
    const { result, rerender } = renderHook(() => useDashboardLayout(ledger, 0));

    expect(result.current?.name).toBe("Standing");
    expect(read).toHaveBeenCalledTimes(1);

    rerender();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("returns null on an empty, never-migrated database", () => {
    const ledger = fakeController(() => null);
    const { result } = renderHook(() => useDashboardLayout(ledger, 0));
    expect(result.current).toBeNull();
  });

  it("re-reads when revision bumps", () => {
    const read = vi.fn(() => null);
    const ledger = fakeController(read);
    const { rerender } = renderHook(
      ({ revision }: { revision: number }) => useDashboardLayout(ledger, revision),
      { initialProps: { revision: 0 } },
    );
    rerender({ revision: 1 });
    expect(read).toHaveBeenCalledTimes(2);
  });
});
