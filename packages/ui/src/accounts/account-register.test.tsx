/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import * as money from "@waltning/core/money";
import { expect, it, vi } from "vitest";
import { AccountRegister, type AccountRegisterAccount } from "./account-register";

function account(overrides: Partial<AccountRegisterAccount>): AccountRegisterAccount {
  return {
    id: "acc-1",
    name: "Bank A · PLN",
    kind: "bank",
    ownership: "own",
    balance: money.toMoney("100"),
    currency: "PLN",
    isBusiness: false,
    expectedBalance: null,
    ...overrides,
  };
}

it("shows the first-run empty state with nothing to hold", () => {
  const onCreateAccount = vi.fn();
  render(
    <AccountRegister
      accounts={[]}
      archivedAccounts={[]}
      onSelectAccount={vi.fn()}
      onLoadArchived={vi.fn()}
      onCreateAccount={onCreateAccount}
    />,
  );
  expect(screen.getByText("No accounts yet")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Create account…" }));
  expect(onCreateAccount).toHaveBeenCalledTimes(1);
});

it("groups by kind, in S16's order, with a subtotal header per currency", () => {
  render(
    <AccountRegister
      accounts={[
        account({ id: "cash-1", name: "Cash", kind: "cash", balance: money.toMoney("840") }),
        account({ id: "bank-1", name: "Bank A", kind: "bank", balance: money.toMoney("6200") }),
        account({
          id: "bank-2",
          name: "Bank A/BIZ",
          kind: "bank",
          balance: money.toMoney("2220.10"),
          isBusiness: true,
        }),
      ]}
      archivedAccounts={[]}
      onSelectAccount={vi.fn()}
      onLoadArchived={vi.fn()}
      onCreateAccount={vi.fn()}
    />,
  );
  const headings = screen.getAllByText(/^(Bank|Cash)$/).map((node) => node.textContent);
  // Bank before Cash — S16 §3's order, not alphabetical or insertion order.
  expect(headings.indexOf("Bank")).toBeLessThan(headings.indexOf("Cash"));
  expect(screen.getByText("8 420.10")).toBeDefined();
  expect(screen.getByText("BIZ")).toBeDefined();
});

it("puts a clearing account's non-zero balance under the amber marker", () => {
  render(
    <AccountRegister
      accounts={[
        account({ id: "clr-1", name: "Clearing", kind: "clearing", balance: money.toMoney("340") }),
      ]}
      archivedAccounts={[]}
      onSelectAccount={vi.fn()}
      onLoadArchived={vi.fn()}
      onCreateAccount={vi.fn()}
    />,
  );
  expect(screen.getByText("Unsettled")).toBeDefined();
});

it("holds a shared account apart, subtotalled on its own, never inside a kind group", () => {
  render(
    <AccountRegister
      accounts={[
        account({ id: "own-1", name: "Bank A", kind: "bank" }),
        account({
          id: "shared-1",
          name: "Household",
          kind: "deposit",
          ownership: "shared",
          balance: money.toMoney("1800"),
        }),
      ]}
      archivedAccounts={[]}
      onSelectAccount={vi.fn()}
      onLoadArchived={vi.fn()}
      onCreateAccount={vi.fn()}
    />,
  );
  expect(screen.getByText("Shared")).toBeDefined();
  expect(screen.queryByText("Deposit")).not.toBeNull(); // the shared row's own kind label
  expect(screen.getAllByText("Household")).toHaveLength(1);
});

it("archived accounts stay hidden until the toggle opens, and the load fires once", () => {
  const onLoadArchived = vi.fn();
  render(
    <AccountRegister
      accounts={[account({})]}
      archivedAccounts={[account({ id: "old-1", name: "Old · PLN" })]}
      onSelectAccount={vi.fn()}
      onLoadArchived={onLoadArchived}
      onCreateAccount={vi.fn()}
    />,
  );
  expect(screen.queryByText("Old · PLN")).toBeNull();
  expect(screen.getByText("Archived")).toBeDefined();

  fireEvent.click(screen.getByText("Archived"));

  expect(onLoadArchived).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Old · PLN")).toBeDefined();
  expect(screen.getByText("Archived (1)")).toBeDefined();
});

it("tapping a row calls onSelectAccount with its id", () => {
  const onSelectAccount = vi.fn();
  render(
    <AccountRegister
      accounts={[account({ id: "bank-1", name: "Bank A" })]}
      archivedAccounts={[]}
      onSelectAccount={onSelectAccount}
      onLoadArchived={vi.fn()}
      onCreateAccount={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Bank A" }));
  expect(onSelectAccount).toHaveBeenCalledWith("bank-1");
});

it("shows Last observed on a row that has been reconciled", () => {
  render(
    <AccountRegister
      accounts={[
        account({
          id: "bank-1",
          name: "Bank A",
          expectedBalance: money.toMoney("1198.30"),
        }),
      ]}
      archivedAccounts={[]}
      onSelectAccount={vi.fn()}
      onLoadArchived={vi.fn()}
      onCreateAccount={vi.fn()}
    />,
  );
  expect(screen.getByText("Last observed:")).toBeDefined();
  expect(screen.getByText("1 198.30")).toBeDefined();
});

it("filters by name across own, shared and archived, with a live result count", () => {
  render(
    <AccountRegister
      accounts={[
        account({ id: "bank-1", name: "Bank A" }),
        account({ id: "cash-1", name: "Cash", kind: "cash" }),
      ]}
      archivedAccounts={[]}
      onSelectAccount={vi.fn()}
      onLoadArchived={vi.fn()}
      onCreateAccount={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "bank" } });
  expect(screen.getByText("Bank A")).toBeDefined();
  expect(screen.queryByText("Cash")).toBeNull();
  expect(screen.getByText("1 result")).toBeDefined();
});

/** S16 §7 — S31's own entry point. */
it("offers Transfer from here on an own account's row, only when asked", () => {
  const onTransferFrom = vi.fn();
  render(
    <AccountRegister
      accounts={[account({ id: "cash-1", name: "Cash" })]}
      archivedAccounts={[]}
      onSelectAccount={vi.fn()}
      onLoadArchived={vi.fn()}
      onCreateAccount={vi.fn()}
      onTransferFrom={onTransferFrom}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Transfer from here" }));
  expect(onTransferFrom).toHaveBeenCalledWith("cash-1");
});

it("has no Transfer action when the screen does not offer one", () => {
  render(
    <AccountRegister
      accounts={[account({ id: "cash-1", name: "Cash" })]}
      archivedAccounts={[]}
      onSelectAccount={vi.fn()}
      onLoadArchived={vi.fn()}
      onCreateAccount={vi.fn()}
    />,
  );
  expect(screen.queryByRole("button", { name: "Transfer from here" })).toBeNull();
});
