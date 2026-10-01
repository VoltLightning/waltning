import { currencyCode } from "@waltning/core/money";
import { describe, expect, it, vi } from "vitest";
import { type AnchorDecided, type AnchorLedger, anchorOnce } from "./anchor-to-region.ts";

const USD = currencyCode("USD");
const EUR = currencyCode("EUR");

function ledger(accounts = 0) {
  const changePivot = vi.fn((_draft: { code: string }) => ({ code: EUR, droppedDates: 0 }));
  const port: AnchorLedger = {
    getSnapshot: () => ({
      accounts: Array.from({ length: accounts }),
      currencies: [
        { code: USD, isPivot: true },
        { code: EUR, isPivot: false },
      ],
    }),
    searchTransactions: () => ({ total: { count: 0 } }),
    changePivot,
  };
  return { port, changePivot };
}

function marker(initial: "decided" | null = null) {
  let value = initial;
  const set = vi.fn(async (next: "decided") => {
    value = next;
  });
  const decided: AnchorDecided = {
    hydrate: async () => undefined,
    getSnapshot: () => ({ value }),
    set,
  };
  return { decided, set };
}

describe("anchorOnce", () => {
  it("anchors a fresh ledger the first time, and marks the device decided", async () => {
    const { port, changePivot } = ledger();
    const { decided, set } = marker();
    expect(await anchorOnce(port, EUR, USD, decided)).toBe("anchored");
    expect(changePivot).toHaveBeenCalledWith({ code: "EUR" });
    expect(set).toHaveBeenCalledWith("decided");
  });

  // A person who moved the anchor back to the seed, or a restored backup with
  // no accounts, looks exactly like a fresh ledger — only the marker tells.
  it("never anchors again once the device has decided", async () => {
    const { port, changePivot } = ledger();
    expect(await anchorOnce(port, EUR, USD, marker("decided").decided)).toBe("kept");
    expect(changePivot).not.toHaveBeenCalled();
  });

  it("marks the device decided even when the ledger was not fresh", async () => {
    const { port, changePivot } = ledger(1);
    const { decided, set } = marker();
    expect(await anchorOnce(port, EUR, USD, decided)).toBe("kept");
    expect(changePivot).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith("decided");
  });

  it("contains a throw, so startup cannot fail on it", async () => {
    const { port } = ledger();
    port.changePivot = () => {
      throw new Error("replica closed");
    };
    expect(await anchorOnce(port, EUR, USD, marker().decided)).toBe("kept");
  });
});
