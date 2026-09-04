/**
 * @vitest-environment jsdom
 *
 * `BalanceRow` — its own domain's test, beside its own component.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import * as money from "@waltning/core/money";
import { describe, expect, it, vi } from "vitest";
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
        conversion={{ rate: money.pivotPerUnit("4.00000000"), displayCurrency: "PLN" }}
      />,
    );
    expect(screen.getByText("4.0000")).toBeDefined();
    expect(screen.getByText("400.00")).toBeDefined();
  });

  it("renders the BIZ tag on a business account", () => {
    render(
      <BalanceRow
        account="Bank A/BIZ"
        kind="bank"
        balance={money.toMoney("100")}
        currency="PLN"
        isBusiness
      />,
    );
    expect(screen.getByText("BIZ")).toBeDefined();
  });

  it("renders the amber marker on an unsettled clearing account", () => {
    render(
      <BalanceRow
        account="Clearing"
        kind="clearing"
        balance={money.toMoney("340")}
        currency="PLN"
        unsettled
      />,
    );
    expect(screen.getByText("Unsettled")).toBeDefined();
  });

  it("renders neither tag by default", () => {
    render(<BalanceRow account="Cash" kind="cash" balance={money.toMoney("840")} currency="PLN" />);
    expect(screen.queryByText("BIZ")).toBeNull();
    expect(screen.queryByText("Unsettled")).toBeNull();
  });

  it("is a plain row with no onPress, and a target once one is given", () => {
    const { rerender } = render(
      <BalanceRow account="Bank A" kind="bank" balance={money.toMoney("100")} currency="PLN" />,
    );
    expect(screen.queryByRole("button")).toBeNull();

    const onPress = vi.fn();
    rerender(
      <BalanceRow
        account="Bank A"
        kind="bank"
        balance={money.toMoney("100")}
        currency="PLN"
        onPress={onPress}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Bank A" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("shows Last observed when expectedBalance is set", () => {
    render(
      <BalanceRow
        account="Bank A"
        kind="bank"
        balance={money.toMoney("1240.50")}
        currency="PLN"
        expectedBalance={money.toMoney("1198.30")}
      />,
    );
    expect(screen.getByText("Last observed:")).toBeDefined();
    expect(screen.getByText("1 198.30")).toBeDefined();
  });

  it("omits Last observed when expectedBalance is null or absent", () => {
    const { rerender } = render(
      <BalanceRow account="Bank A" kind="bank" balance={money.toMoney("100")} currency="PLN" />,
    );
    expect(screen.queryByText("Last observed:")).toBeNull();

    rerender(
      <BalanceRow
        account="Bank A"
        kind="bank"
        balance={money.toMoney("100")}
        currency="PLN"
        expectedBalance={null}
      />,
    );
    expect(screen.queryByText("Last observed:")).toBeNull();
  });
});
