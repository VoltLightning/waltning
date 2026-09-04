/** @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { currencyCode } from "@waltning/core/money";
import { describe, expect, it, vi } from "vitest";
import { createPhoneLedger } from "./create-phone-ledger.ts";
import { usePhoneLedger } from "./use-phone-ledger.ts";

describe("usePhoneLedger", () => {
  it("rerenders after a write and unsubscribes on unmount", () => {
    const listeners = new Set<() => void>();
    const subscribe = vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    });
    let accounts: ReturnType<ReturnType<typeof createPhoneLedger>["getSnapshot"]>["accounts"] = [];
    const controller = createPhoneLedger(
      {
        listAccounts: () => accounts,
        listCurrencies: () => [
          {
            code: currencyCode("PLN"),
            name: "Polish Złoty",
            symbol: "zł",
            decimals: 2,
            capturable: true,
          },
        ],
        listGroups: () => [],
        listRecent: () => [],
        listCategories: () => [],
        listCategoryTree: () => [],
        listCounterparties: () => [],
        createAccount: (input) => {
          accounts = [
            {
              id: input.id,
              name: input.name,
              kind: input.kind,
              currency: input.currency,
              decimals: 2,
              balance: input.openingBalance,
              capturable: true,
            },
          ];
        },
        createTransaction: () => undefined,
        createCategory: () => undefined,
        reset: () => undefined,
      },
      {
        capture: () => ({
          date: accountingDate("2026-08-23"),
          timeZone: "Europe/Warsaw",
          offsetMinutes: 120,
          at: new Date("2026-08-23T10:00:00Z"),
        }),
        id: () => id("11111111-1111-4111-8111-111111111111"),
      },
    );
    const originalSubscribe = controller.subscribe;
    controller.subscribe = (listener) => {
      const removeProbe = subscribe(listener);
      const removeController = originalSubscribe(listener);
      return () => {
        removeProbe();
        removeController();
      };
    };

    const { result, unmount } = renderHook(() => usePhoneLedger(controller));
    act(() =>
      controller.createAccount({
        name: "Bank A · PLN",
        currency: currencyCode("PLN"),
        kind: "other",
        ownership: "own",
        isBusiness: false,
        openingBalance: "0",
        openingDate: null,
        memo: "",
        groupId: null,
      }),
    );
    expect(result.current.accounts).toHaveLength(1);

    unmount();
    expect(listeners).toHaveLength(0);
  });
});
