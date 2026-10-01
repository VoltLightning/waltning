import { currencyCode } from "@waltning/core/money";
import { describe, expect, it, vi } from "vitest";
import { type AnchorLedger, anchorToRegion } from "./anchor-to-region.ts";

const USD = currencyCode("USD");
const EUR = currencyCode("EUR");
const PLN = currencyCode("PLN");

function ledger(
  options: {
    pivot?: typeof USD;
    accounts?: number;
    transactions?: number;
    held?: readonly (typeof USD)[];
    refuse?: boolean;
  } = {},
) {
  const { pivot = USD, accounts = 0, transactions = 0, held = [USD, PLN, EUR], refuse } = options;
  const changePivot = vi.fn((_draft: { code: string }) =>
    refuse === true ? { fieldErrors: [] } : { code: EUR, droppedDates: 0 },
  );
  const port: AnchorLedger = {
    getSnapshot: () => ({
      accounts: Array.from({ length: accounts }),
      currencies: held.map((code) => ({ code, isPivot: code === pivot })),
    }),
    searchTransactions: () => ({ total: { count: transactions } }),
    changePivot,
  };
  return { port, changePivot };
}

describe("anchorToRegion", () => {
  it("anchors a fresh ledger to the region's currency", () => {
    const { port, changePivot } = ledger();
    expect(anchorToRegion(port, EUR, USD)).toBe("anchored");
    expect(changePivot).toHaveBeenCalledWith({ code: "EUR" });
  });

  it("keeps the anchor once an account exists", () => {
    const { port, changePivot } = ledger({ accounts: 1 });
    expect(anchorToRegion(port, EUR, USD)).toBe("kept");
    expect(changePivot).not.toHaveBeenCalled();
  });

  it("keeps the anchor once a transaction exists", () => {
    const { port, changePivot } = ledger({ transactions: 1 });
    expect(anchorToRegion(port, EUR, USD)).toBe("kept");
    expect(changePivot).not.toHaveBeenCalled();
  });

  it("does not revert an anchor a person already moved off the seed", () => {
    const { port, changePivot } = ledger({ pivot: PLN });
    expect(anchorToRegion(port, EUR, USD)).toBe("kept");
    expect(changePivot).not.toHaveBeenCalled();
  });

  it("keeps the anchor for an unknown region, a region already the anchor, or a currency not held", () => {
    expect(anchorToRegion(ledger().port, null, USD)).toBe("kept");
    expect(anchorToRegion(ledger().port, USD, USD)).toBe("kept");
    expect(anchorToRegion(ledger({ held: [USD, PLN] }).port, EUR, USD)).toBe("kept");
  });

  it("keeps the anchor when the registry refuses", () => {
    expect(anchorToRegion(ledger({ refuse: true }).port, EUR, USD)).toBe("kept");
  });
});
