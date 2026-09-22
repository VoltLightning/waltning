import type * as money from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { debtTotalLines } from "./debt-totals.ts";

const row = (
  currency: string,
  theyOwe: string,
  youOwe: string,
  decimals = 2,
): money.DirectionTotalRow =>
  ({ currency, theyOwe, youOwe, decimals }) as unknown as money.DirectionTotalRow;

describe("debtTotalLines — S12 §3", () => {
  it("drops the empty half of a currency owed in one direction only", () => {
    expect(debtTotalLines([row("EUR", "96.50000000", "0.00000000")])).toEqual([
      {
        key: "EUR-they-owe",
        currency: "EUR",
        decimals: 2,
        direction: "they-owe",
        value: "96.50000000",
      },
    ]);
  });

  it("keeps both halves when both carry a figure", () => {
    expect(
      debtTotalLines([row("PLN", "240.00000000", "1400.00000000")]).map((line) => line.key),
    ).toEqual(["PLN-they-owe", "PLN-you-owe"]);
  });

  it("groups by direction, not by currency", () => {
    expect(
      debtTotalLines([
        row("EUR", "96.50000000", "12.00000000"),
        row("PLN", "240.00000000", "1400.00000000"),
      ]).map((line) => line.key),
    ).toEqual(["EUR-they-owe", "PLN-they-owe", "EUR-you-owe", "PLN-you-owe"]);
  });

  it("drops a half that is only dust at the currency's own scale", () => {
    // Below half a minor unit: the row would render `0,00`, so the line
    // states nothing the card can show.
    expect(debtTotalLines([row("PLN", "500.00000000", "0.00400000")]).map((l) => l.key)).toEqual([
      "PLN-they-owe",
    ]);
  });

  it("answers nothing for no currencies", () => {
    expect(debtTotalLines([])).toEqual([]);
  });
});
