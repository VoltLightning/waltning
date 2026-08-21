/**
 * @vitest-environment jsdom
 *
 * `BalanceRow` — its own domain's test, beside its own component.
 */

import { render, screen } from "@testing-library/react";
import { money } from "@waltning/core";
import { describe, expect, it } from "vitest";
import { BalanceRow } from "./balance-row";

describe("BalanceRow", () => {
  it("renders a home-currency balance as a plain amount", () => {
    render(
      <BalanceRow
        account="Bank A"
        kind="bank"
        balance={money.toMoney("100.00000000")}
        currency="PLN"
      />,
    );
    expect(screen.getByText("100.00")).toBeDefined();
  });

  it("renders a foreign balance through FxAmount, rate and all", () => {
    // The rate is required to build the conversion at all — a foreign balance
    // cannot be rendered as a bare converted number (P1).
    render(
      <BalanceRow
        account="Bank B"
        kind="deposit"
        balance={money.toMoney("100.00000000")}
        currency="USD"
        conversion={{ rate: money.toMoney("4.00000000"), displayCurrency: "PLN" }}
      />,
    );
    expect(screen.getByText("4.0000")).toBeDefined();
    expect(screen.getByText("400.00")).toBeDefined();
  });
});
