/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { currencyCode } from "@waltning/core/money";
import { expect, it, vi } from "vitest";
import { QuickAddForm } from "./quick-add-form";

const accounts = [
  { id: "account-a", name: "Bank A · PLN", currency: currencyCode("PLN"), capturable: true },
  { id: "account-b", name: "Bank B · BYN", currency: currencyCode("BYN"), capturable: true },
];

it("renders only amount, account, and the Create account escape", () => {
  render(
    <QuickAddForm
      accounts={accounts}
      onCancel={vi.fn()}
      onCreateAccount={vi.fn()}
      onSave={vi.fn()}
    />,
  );
  expect(screen.getByLabelText("Amount")).toBeDefined();
  expect(screen.getByText("Account")).toBeDefined();
  expect(screen.getByRole("button", { name: "Create account…" })).toBeDefined();
  for (const absent of [
    "Category",
    "Date",
    "Voice",
    "Scan",
    "Sync",
    "Shared",
    "FX",
    "Note",
    "Income",
    "Tabs",
  ]) {
    expect(screen.queryByText(absent)).toBeNull();
  }
});

it("saves a positive amount as a string only with an account", () => {
  const onSave = vi.fn();
  render(
    <QuickAddForm
      accounts={accounts}
      onCancel={vi.fn()}
      onCreateAccount={vi.fn()}
      onSave={onSave}
    />,
  );
  expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-disabled")).toBe("true");
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "10" } });
  fireEvent.click(screen.getByRole("radio", { name: /Account: Bank A · PLN/ }));
  const save = screen.getByRole("button", { name: "Save" });
  expect(save.getAttribute("aria-disabled")).toBeNull();
  fireEvent.click(save);
  expect(onSave).toHaveBeenCalledWith({ amount: "10", accountId: "account-a" });
  expect(typeof onSave.mock.calls[0]?.[0].amount).toBe("string");
});

it("restores a draft and carries it through Create account", () => {
  const onCreateAccount = vi.fn();
  render(
    <QuickAddForm
      accounts={accounts}
      initialAmount="10"
      initialAccountId="account-a"
      onCancel={vi.fn()}
      onCreateAccount={onCreateAccount}
      onSave={vi.fn()}
    />,
  );
  expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toBe("10");
  screen.getByRole("button", { name: "Create account…" }).click();
  expect(onCreateAccount).toHaveBeenCalledWith({ amount: "10", accountId: "account-a" });
});

/**
 * The affix follows the account, and the second account is in a different
 * currency from the first. `QuickAddAccount.currency` was the literal type
 * `"USD"` and the field's affix was the literal string — so an expense against a
 * złoty account was labelled in dollars, and the compiler called it correct.
 */
it("labels the amount in the selected account's own currency", () => {
  render(
    <QuickAddForm
      accounts={accounts}
      onCancel={vi.fn()}
      onCreateAccount={vi.fn()}
      onSave={vi.fn()}
    />,
  );
  expect(screen.queryByText("PLN")).toBeNull();

  fireEvent.click(screen.getByRole("radio", { name: /Account: Bank A · PLN/ }));
  expect(screen.getByText("PLN")).toBeDefined();

  fireEvent.click(screen.getByRole("radio", { name: /Account: Bank B · BYN/ }));
  expect(screen.getByText("BYN")).toBeDefined();
  expect(screen.queryByText("PLN")).toBeNull();
});

/**
 * The account the ledger cannot value a capture in — a non-pivot currency with
 * no rate, which is every currency on a phone that has never synced (§14.6).
 *
 * Without this the write throws from inside `create_transaction`, *after* the
 * outbox entry has committed, with a message written for a sync log. On a phone
 * with no backend that entry drains nowhere.
 */
it("declines a capture into a currency it holds no rate for, and says why", () => {
  const onSave = vi.fn();
  const unrated = [
    { id: "account-a", name: "Bank A · PLN", currency: currencyCode("PLN"), capturable: false },
  ];
  render(
    <QuickAddForm
      accounts={unrated}
      onCancel={vi.fn()}
      onCreateAccount={vi.fn()}
      onSave={onSave}
    />,
  );

  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "10" } });
  fireEvent.click(screen.getByRole("radio", { name: /Account: Bank A · PLN/ }));

  expect(screen.getByText(/PLN needs an exchange rate/)).toBeDefined();
  const save = screen.getByRole("button", { name: "Save" });
  expect(save.getAttribute("aria-disabled")).toBe("true");
  fireEvent.click(save);
  expect(onSave).not.toHaveBeenCalled();
});

/** The reason belongs to the choice, so it is absent until one is made. */
it("says nothing about rates before an account is chosen", () => {
  render(
    <QuickAddForm
      accounts={[
        { id: "account-a", name: "Bank A · PLN", currency: currencyCode("PLN"), capturable: false },
      ]}
      onCancel={vi.fn()}
      onCreateAccount={vi.fn()}
      onSave={vi.fn()}
    />,
  );
  expect(screen.queryByText(/needs an exchange rate/)).toBeNull();
});
