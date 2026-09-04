import * as money from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { convertAmountRaw } from "./convert-amount.ts";

describe("convertAmountRaw", () => {
  it("multiplies by the reference rate and rounds to the destination's own decimals", () => {
    // S31 §9's own reference rate, 3.8100 PLN per USD: the prefill before a
    // bank's actual 3.7680 is typed over it — 150 × 3.8100 = 571.50.
    const raw = convertAmountRaw(money.toMoney("150"), money.pivotPerUnit("3.8100"), 2);
    expect(raw).toBe("571,50");
  });

  it("uses the canonical comma, matching applyKey's own reported mark", () => {
    const raw = convertAmountRaw(money.toMoney("10"), money.pivotPerUnit("4.2810"), 2);
    expect(raw).toBe("42,81");
    expect(raw).not.toContain(".");
  });

  it("rounds to zero decimals for a currency with none", () => {
    const raw = convertAmountRaw(money.toMoney("1"), money.pivotPerUnit("150.5"), 0);
    expect(raw).toBe("151");
  });
});
