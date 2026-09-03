/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import * as money from "@waltning/core/money";
import { describe, expect, it, vi } from "vitest";
import { MatchWarning } from "./match-warning";

const candidate = {
  name: "Ania",
  balance: money.toMoney("240.00000000"),
  currency: "PLN",
  decimals: 2,
  transactionCount: 12,
};

describe("MatchWarning", () => {
  it("shows the candidate with its balance and transaction count", () => {
    render(<MatchWarning candidate={candidate} onSame={vi.fn()} onDifferent={vi.fn()} />);
    expect(screen.getByText("Ania")).toBeDefined();
    expect(screen.getByText("Transactions: 12")).toBeDefined();
  });

  it("offers two equal actions and no default", () => {
    const onSame = vi.fn();
    const onDifferent = vi.fn();
    render(<MatchWarning candidate={candidate} onSame={onSame} onDifferent={onDifferent} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
    buttons[0]?.click();
    expect(onSame).toHaveBeenCalledOnce();
    expect(onDifferent).not.toHaveBeenCalled();
    buttons[1]?.click();
    expect(onDifferent).toHaveBeenCalledOnce();
  });
});
