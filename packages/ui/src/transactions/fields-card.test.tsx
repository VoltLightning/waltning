/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { FieldsCard, type TransactionFields } from "./fields-card";

const ACCOUNTS = [
  {
    id: "account-a",
    name: "Cash · PLN",
    currency: "PLN",
    kind: "cash" as const,
    capturable: true,
    ownership: "own" as const,
    groupId: null,
  },
  {
    id: "account-b",
    name: "Bank A · PLN",
    currency: "PLN",
    kind: "bank" as const,
    capturable: true,
    ownership: "own" as const,
    groupId: null,
  },
];

const FIELDS: TransactionFields = {
  date: "2026-08-06",
  accountId: "account-a",
  categoryId: "cat-eating-out",
  payee: "Café A",
  note: "",
  isBusiness: false,
};

function renderCard(overrides: Partial<Parameters<typeof FieldsCard>[0]> = {}) {
  const onSave = vi.fn();
  const onOpenCategoryPicker = vi.fn();
  const onOpenAccountPicker = vi.fn();
  render(
    <FieldsCard
      fields={FIELDS}
      accounts={ACCOUNTS}
      accountId="account-a"
      onOpenAccountPicker={onOpenAccountPicker}
      today="2026-08-06"
      categoryId="cat-eating-out"
      categoryName="Eating out"
      onOpenCategoryPicker={onOpenCategoryPicker}
      onSave={onSave}
      {...overrides}
    />,
  );
  return { onSave, onOpenCategoryPicker, onOpenAccountPicker };
}

it("shows every field's current value as a row — label left, value right", () => {
  renderCard();
  expect(screen.getByRole("button", { name: "Category: Eating out" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Date: 2026-08-06" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Account: Cash · PLN" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Payee: Café A" })).toBeDefined();
});

it("opens CategorySheet through the screen's own callback, never inline", () => {
  const { onOpenCategoryPicker } = renderCard();
  fireEvent.click(screen.getByRole("button", { name: "Category: Eating out" }));
  expect(onOpenCategoryPicker).toHaveBeenCalledTimes(1);
});

/**
 * `L` — the account row used to hold a flat `Select` of every account,
 * rendered inline. It now escapes to `AccountPicker` (`accounts/`) the same
 * way `category` already does — composed by the screen, never by this card.
 */
it("opens AccountPicker through the screen's own callback, never inline", () => {
  const { onOpenAccountPicker } = renderCard();
  fireEvent.click(screen.getByRole("button", { name: "Account: Cash · PLN" }));
  expect(onOpenAccountPicker).toHaveBeenCalledTimes(1);
  expect(screen.queryByLabelText("Account")).toBeNull();
});

it("carries an account change (picked by the screen's own AccountPicker) into the patch", () => {
  const { onSave } = renderCard({ accountId: "account-b" });
  const save = screen.getByRole("button", { name: "Save" });
  expect(save).toHaveProperty("disabled", false);
  fireEvent.click(save);
  expect(onSave).toHaveBeenCalledWith({ accountId: "account-b" });
});

it("Save starts disabled — nothing has changed yet", () => {
  renderCard();
  expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
});

it("Save sends only the field that changed", () => {
  const { onSave } = renderCard();

  fireEvent.click(screen.getByRole("button", { name: "Payee: Café A" }));
  fireEvent.change(screen.getByLabelText("Payee"), { target: { value: "Bakery A" } });

  const save = screen.getByRole("button", { name: "Save" });
  expect(save).toHaveProperty("disabled", false);
  fireEvent.click(save);

  expect(onSave).toHaveBeenCalledWith({ payee: "Bakery A" });
});

it("carries a category change (set by the screen once the sheet picks one) alongside a field change, in one patch", () => {
  const { onSave } = renderCard({ categoryId: "cat-groceries", categoryName: "Groceries" });

  fireEvent.click(screen.getByRole("switch", { name: "Business" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(onSave).toHaveBeenCalledWith({ categoryId: "cat-groceries", isBusiness: true });
});

it("shows a form-level refusal — a stale version names no single field", () => {
  renderCard({
    fieldErrors: { byField: {}, formLevel: ["This transaction changed elsewhere."] },
  });
  expect(screen.getByRole("alert").textContent).toContain("This transaction changed elsewhere.");
});
