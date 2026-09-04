/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { pivotPerUnit, toMoney } from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { BalanceLedger } from "./balance-ledger";

describe("BalanceLedger", () => {
  it("shows one row per currency, direction in words", () => {
    render(
      <BalanceLedger
        rows={[
          { currency: "PLN", balance: toMoney("840.00000000") },
          { currency: "EUR", balance: toMoney("-120.00000000") },
        ]}
        settlementCurrency="EUR"
        settlementNet={toMoney("74.44000000")}
      />,
    );
    expect(screen.getByText("owes you")).toBeDefined();
    expect(screen.getByText("you owe")).toBeDefined();
    expect(screen.getByText("net in EUR")).toBeDefined();
    expect(screen.getByText("74.44")).toBeDefined();
  });

  it("omits the net row entirely when the fold was incomplete (P1)", () => {
    render(
      <BalanceLedger
        rows={[{ currency: "USD", balance: toMoney("10.00000000") }]}
        settlementCurrency="EUR"
        settlementNet={null}
      />,
    );
    expect(screen.queryByText("net in EUR")).toBeNull();
  });

  it("shows the display equivalent, with its rate, only when one is on hand", () => {
    render(
      <BalanceLedger
        rows={[{ currency: "EUR", balance: toMoney("74.44000000") }]}
        settlementCurrency="EUR"
        settlementNet={toMoney("74.44000000")}
        display={{ currency: "PLN", rate: pivotPerUnit("4.32"), asOf: "2026-08-30" }}
      />,
    );
    expect(screen.getByText("4.3200")).toBeDefined();
  });

  /** P1 — `counterparties.atRateDate`, the rate and date the display total actually converted at. */
  it("states the display total's own rate and date, from readRate's asOf", () => {
    render(
      <BalanceLedger
        rows={[{ currency: "EUR", balance: toMoney("74.44000000") }]}
        settlementCurrency="EUR"
        settlementNet={toMoney("74.44000000")}
        display={{ currency: "PLN", rate: pivotPerUnit("4.32"), asOf: "2026-08-30" }}
      />,
    );
    expect(screen.getByText("@ 4.3200 · 2026-08-30")).toBeDefined();
  });

  it("carries no rate-and-date line when there is no display total to state one for", () => {
    render(
      <BalanceLedger
        rows={[{ currency: "EUR", balance: toMoney("74.44000000") }]}
        settlementCurrency="EUR"
        settlementNet={toMoney("74.44000000")}
      />,
    );
    expect(screen.queryByText("@", { exact: false })).toBeNull();
  });

  it("shows only the settlement net, no display line, without a display rate", () => {
    render(
      <BalanceLedger
        rows={[{ currency: "EUR", balance: toMoney("74.44000000") }]}
        settlementCurrency="EUR"
        settlementNet={toMoney("74.44000000")}
      />,
    );
    expect(screen.queryByText("4.3200")).toBeNull();
  });
});
