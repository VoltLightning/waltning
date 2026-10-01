/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { toMoney } from "@waltning/core/money";
import { describe, expect, it, vi } from "vitest";
import { OpenDebtsCard, type OpenDebtsCardLine } from "./open-debts-card";

const YOU_OWE: OpenDebtsCardLine = {
  key: "a-EUR",
  counterpartyId: "a",
  name: "Nina",
  currency: "EUR",
  decimals: 2,
  balance: toMoney("-5.00000000"),
};
const THEY_OWE: OpenDebtsCardLine = {
  key: "b-EUR",
  counterpartyId: "b",
  name: "Tomasz",
  currency: "EUR",
  decimals: 2,
  balance: toMoney("150.00000000"),
};

describe("OpenDebtsCard — the overview's open debts", () => {
  it("names each person with the direction in words, and the figure without a sign", () => {
    render(<OpenDebtsCard lines={[THEY_OWE, YOU_OWE]} onOpenCounterparty={vi.fn()} />);
    expect(screen.getByText("Open debts")).toBeDefined();
    expect(screen.getByText("owes you")).toBeDefined();
    expect(screen.getByText("you owe")).toBeDefined();
    expect(screen.getByText(/^150[.,]00/)).toBeDefined();
    expect(screen.getByText(/^5[.,]00/)).toBeDefined();
    expect(screen.queryByText(/^-/)).toBeNull();
  });

  it("opens the person when their line is pressed", () => {
    const onOpen = vi.fn();
    render(<OpenDebtsCard lines={[YOU_OWE]} onOpenCounterparty={onOpen} />);
    // The whole line is the label: who, which way, how much.
    fireEvent.click(screen.getByRole("button", { name: /^Nina, you owe, 5[.,]00\u00a0EUR$/ }));
    expect(onOpen).toHaveBeenCalledWith("a");
  });

  it("draws nothing when no debt is open", () => {
    const { container } = render(<OpenDebtsCard lines={[]} onOpenCounterparty={vi.fn()} />);
    expect(container.textContent).toBe("");
    expect(screen.queryByText("Open debts")).toBeNull();
  });
});
