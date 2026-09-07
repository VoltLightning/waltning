/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import * as money from "@waltning/core/money";
import { expect, it, vi } from "vitest";
import { SharedGroup, type SharedGroupAccount } from "./shared-group";

const accounts: readonly SharedGroupAccount[] = [
  {
    id: "acc-1",
    name: "Household · USD",
    kind: "Deposit",
    balance: money.toMoney("1800"),
    currency: "USD",
  },
  {
    id: "acc-2",
    name: "Joint · USD",
    kind: "Bank",
    balance: money.toMoney("200"),
    currency: "USD",
  },
];

it("renders nothing with no shared accounts", () => {
  const { container } = render(<SharedGroup accounts={[]} onSelectAccount={vi.fn()} />);
  expect(container.textContent).toBe("");
});

it("subtotals per currency across every account in the group", () => {
  render(<SharedGroup accounts={accounts} onSelectAccount={vi.fn()} />);
  expect(screen.getByText("Shared")).toBeDefined();
  expect(screen.getByText("2 000.00")).toBeDefined();
});

it("never sums across two currencies", () => {
  const mixed: readonly SharedGroupAccount[] = [
    ...accounts,
    {
      id: "acc-3",
      name: "Household · PLN",
      kind: "Bank",
      balance: money.toMoney("300"),
      currency: "PLN",
    },
    {
      id: "acc-4",
      name: "Joint · PLN",
      kind: "Bank",
      balance: money.toMoney("200"),
      currency: "PLN",
    },
  ];
  render(<SharedGroup accounts={mixed} onSelectAccount={vi.fn()} />);
  expect(screen.getByText("2 000.00")).toBeDefined();
  expect(screen.getByText("500.00")).toBeDefined();
});

it("tapping a row calls onSelectAccount with its id", () => {
  const onSelect = vi.fn();
  render(<SharedGroup accounts={accounts} onSelectAccount={onSelect} />);
  fireEvent.click(screen.getByRole("button", { name: "Household · USD" }));
  expect(onSelect).toHaveBeenCalledWith("acc-1");
});

it("renders the BIZ tag and the clearing marker when asked", () => {
  const flagged: readonly SharedGroupAccount[] = [
    {
      id: "acc-4",
      name: "Business joint · USD",
      kind: "Bank",
      balance: money.toMoney("10"),
      currency: "USD",
      isBusiness: true,
    },
    {
      id: "acc-5",
      name: "Clearing · USD",
      kind: "Clearing",
      balance: money.toMoney("40"),
      currency: "USD",
      unsettled: true,
    },
  ];
  render(<SharedGroup accounts={flagged} onSelectAccount={vi.fn()} />);
  expect(screen.getByText("BIZ")).toBeDefined();
  expect(screen.getByText("Unsettled")).toBeDefined();
});
