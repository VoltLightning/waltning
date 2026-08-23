/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { QuickAddForm } from "./quick-add-form";

const accounts = [{ id: "account-a", name: "Cash · USD", currency: "USD" as const }];

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
  fireEvent.click(screen.getByRole("button", { name: /Account: Cash · USD/ }));
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
