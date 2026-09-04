/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { toMoney } from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { DebtDirectionTag } from "./debt-direction-tag";

describe("DebtDirectionTag", () => {
  it("reads 'owes you' for a positive balance", () => {
    render(<DebtDirectionTag balance={toMoney("840.00000000")} decimals={2} />);
    expect(screen.getByText("owes you")).toBeDefined();
  });

  it("reads 'you owe' for a negative balance", () => {
    render(<DebtDirectionTag balance={toMoney("-120.00000000")} decimals={2} />);
    expect(screen.getByText("you owe")).toBeDefined();
  });

  it("reads 'settled' for exactly zero", () => {
    render(<DebtDirectionTag balance={toMoney("0.00000000")} decimals={2} />);
    expect(screen.getByText("settled")).toBeDefined();
  });

  /** H2 — sub-minor-unit dust reads as settled, never a direction, once rounded to the currency's own scale. */
  it("reads 'settled' for a balance that rounds to zero at the given scale", () => {
    render(<DebtDirectionTag balance={toMoney("0.00000001")} decimals={2} />);
    expect(screen.getByText("settled")).toBeDefined();
  });
});
