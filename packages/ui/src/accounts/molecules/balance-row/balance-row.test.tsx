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
  /**
   * **The second line is optional, and inside a kind group there is none.**
   * The register's card already names the kind and the figure on the right
   * carries the currency, so the line that sat here was the one thing on the
   * row said twice — and it made every account in the register two lines
   * tall. The shared card is where it still earns its place: that one holds
   * accounts of mixed kinds, which is the thing its own title cannot say.
   */
  it("draws no line under the name when no kind is given", () => {
    render(<BalanceRow account="Everyday" balance={money.toMoney("100")} currency="PLN" />);
    expect(screen.getByText("Everyday")).toBeDefined();
    expect(screen.queryByText("Checking")).toBeNull();
  });

  it("draws the kind under the name where one is given", () => {
    render(
      <BalanceRow
        account="Household"
        kind="Deposit"
        balance={money.toMoney("100")}
        currency="PLN"
      />,
    );
    expect(screen.getByText("Deposit")).toBeDefined();
  });

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

  it("renders a foreign balance converted, and does not repeat the rate", () => {
    // The rate is still required to *build* the conversion — a foreign balance
    // is never a bare converted number (P1) — but it is a property of the
    // currency on a date, not of this row. In a register every row is as of
    // today, so the same four decimals would repeat down every dollar account
    // and distinguish none of them (`design-system/04` §4.2).
    render(
      <BalanceRow
        account="Bank B"
        kind="deposit"
        balance={money.toMoney("100.00000000")}
        currency="USD"
        conversion={{ rate: money.pivotPerUnit("4.00000000"), displayCurrency: "PLN" }}
      />,
    );
    expect(screen.getByText("400.00")).toBeDefined();
    expect(screen.queryByText("4.0000")).toBeNull();
  });

  /**
   * A self-hosted ledger has no rate feed, so every rate is entered by hand and
   * `manual` would fire on every foreign row forever. A marker that never
   * varies marks nothing, and reads as a warning while carrying no information.
   */
  it("does not tag a hand-entered rate in the register", () => {
    render(
      <BalanceRow
        account="Bank B"
        kind="deposit"
        balance={money.toMoney("100.00000000")}
        currency="USD"
        conversion={{
          rate: money.pivotPerUnit("4.00000000"),
          displayCurrency: "PLN",
          provenance: { kind: "override" },
        }}
      />,
    );
    expect(screen.queryByText("manual")).toBeNull();
  });

  /** `stale` and `estimated` do vary, and each says this figure may be wrong. */
  it("still tags a stale rate, which is a warning and not a provenance note", () => {
    render(
      <BalanceRow
        account="Bank B"
        kind="deposit"
        balance={money.toMoney("100.00000000")}
        currency="USD"
        conversion={{
          rate: money.pivotPerUnit("4.00000000"),
          displayCurrency: "PLN",
          provenance: { kind: "stale", ageDays: 9 },
        }}
      />,
    );
    expect(screen.getByText("stale 9d")).toBeDefined();
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

/**
 * **A rule above every account but the first of its section.**
 *
 * Three banks with nothing between them is one block of text the eye has to
 * parse back into rows, which is what made the register hard to read at any
 * length past one account per kind. The rule is on the *top* of the row for
 * the reason `balance-row.tsx` gives: drawn below, the last row of a section
 * lands its hairline on the heavier rule that begins the next one, and every
 * kind boundary is two lines.
 */
it("draws a rule above every row but the first of its section", () => {
  const { container, unmount } = render(
    <BalanceRow account="Bank A · PLN" kind="Bank" balance={money.toMoney("0")} currency="PLN" />,
  );
  const between = container.firstElementChild as HTMLElement;
  expect(getComputedStyle(between).borderTopWidth).toBe("1px");
  unmount();

  const { container: head } = render(
    <BalanceRow
      account="Bank A · PLN"
      kind="Bank"
      balance={money.toMoney("0")}
      currency="PLN"
      first
    />,
  );
  const firstRow = head.firstElementChild as HTMLElement;
  expect(getComputedStyle(firstRow).borderTopWidth).toBe("0px");
});
