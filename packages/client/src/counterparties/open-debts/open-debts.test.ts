import * as money from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { type OpenDebtRow, openDebtLines } from "./open-debts.ts";

const row = (id: string, name: string, currency: string, balance: string, decimals = 2) =>
  ({
    counterpartyId: id,
    name,
    currency,
    decimals,
    balance: money.toMoney(balance),
  }) as unknown as OpenDebtRow;

describe("openDebtLines — the overview's open debts", () => {
  it("names the direction from the balance's sign", () => {
    const lines = openDebtLines([
      row("a", "Nina", "EUR", "-5.00000000"),
      row("b", "Tomasz", "EUR", "150.00000000"),
    ]);
    expect(lines.map((line) => [line.name, line.direction])).toEqual([
      ["Tomasz", "theyOwe"],
      ["Nina", "youOwe"],
    ]);
  });

  it("keeps one line per person per currency, never folded", () => {
    const lines = openDebtLines([
      row("a", "Nina", "EUR", "-5.00000000"),
      row("a", "Nina", "PLN", "-20.00000000"),
    ]);
    expect(lines.map((line) => line.key)).toEqual(["a-EUR", "a-PLN"]);
  });

  it("drops a settled balance and dust under the currency's own scale", () => {
    expect(
      openDebtLines([
        row("a", "Nina", "EUR", "0.00000000"),
        row("b", "Tomasz", "EUR", "0.00400000"),
      ]),
    ).toEqual([]);
  });

  it("says nothing for no balances", () => {
    expect(openDebtLines([])).toEqual([]);
  });
});
