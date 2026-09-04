/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { FieldsCard, type TransactionFields } from "./fields-card";

const ACCOUNTS = [
  { id: "account-a", name: "Cash · PLN" },
  { id: "account-b", name: "Bank A · PLN" },
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
  render(
    <FieldsCard
      fields={FIELDS}
      accounts={ACCOUNTS}
      today="2026-08-06"
      categoryId="cat-eating-out"
      categoryName="Eating out"
      onOpenCategoryPicker={onOpenCategoryPicker}
      onSave={onSave}
      {...overrides}
    />,
  );
  return { onSave, onOpenCategoryPicker };
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
