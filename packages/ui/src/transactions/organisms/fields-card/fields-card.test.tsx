/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  counterpartyId: null,
  obligationCounterpartyId: null,
  obligationRole: null,
  enteredName: "Café A",
  note: "",
  isBusiness: false,
  isCapital: false,
};

function renderCard(overrides: Partial<Parameters<typeof FieldsCard>[0]> = {}) {
  const onSave = vi.fn();
  const onOpenCategoryPicker = vi.fn();
  const onOpenAccountPicker = vi.fn();
  const onOpenCounterpartyPicker = vi.fn();
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
      counterpartyId={null}
      counterpartyName={null}
      obligationCounterpartyId={null}
      obligationCounterpartyName={null}
      onOpenCounterpartyPicker={onOpenCounterpartyPicker}
      onSave={onSave}
      {...overrides}
    />,
  );
  return { onSave, onOpenCategoryPicker, onOpenAccountPicker, onOpenCounterpartyPicker };
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

it("draws no Save until something has changed — at rest there is nothing to commit", () => {
  renderCard();
  expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
});

it("Save sends only the field that changed", () => {
  const { onSave } = renderCard();

  fireEvent.click(screen.getByRole("button", { name: "Payee: Café A" }));
  fireEvent.change(screen.getByLabelText("Payee"), { target: { value: "Bakery A" } });

  const save = screen.getByRole("button", { name: "Save" });
  expect(save).toHaveProperty("disabled", false);
  fireEvent.click(save);

  expect(onSave).toHaveBeenCalledWith({ enteredName: "Bakery A" });
});

it("carries a category change (set by the screen once the sheet picks one) alongside a field change, in one patch", () => {
  const { onSave } = renderCard({ categoryId: "cat-groceries", categoryName: "Groceries" });

  fireEvent.click(screen.getByRole("checkbox", { name: "Business" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(onSave).toHaveBeenCalledWith({ categoryId: "cat-groceries", isBusiness: true });
});

it("shows a form-level refusal — a stale version names no single field", () => {
  renderCard({
    fieldErrors: { byField: {}, formLevel: ["This transaction changed elsewhere."] },
  });
  expect(screen.getByRole("alert").textContent).toContain("This transaction changed elsewhere.");
});

/** §6.6 — the counterparty escapes to the screen's picker, like category and account. */
it("opens the counterparty picker through the screen's own callback", () => {
  const { onOpenCounterpartyPicker } = renderCard();
  fireEvent.click(screen.getByRole("button", { name: "Counterparty" }));
  expect(onOpenCounterpartyPicker).toHaveBeenCalledTimes(1);
});

/**
 * A role with nobody to hold it is not a state the ledger has, so the row
 * does not exist until a counterparty does.
 */
it("offers the role only once a counterparty is set", () => {
  renderCard();
  expect(screen.queryByRole("button", { name: /^Role/ })).toBeNull();

  cleanup();
  renderCard({ obligationCounterpartyId: "cp-nina", counterpartyName: "Nina" });
  expect(screen.getByRole("button", { name: "Role" })).toBeDefined();
});

it("carries a counterparty and the role picked for them in one patch", () => {
  const { onSave } = renderCard({ obligationCounterpartyId: "cp-nina", counterpartyName: "Nina" });
  fireEvent.click(screen.getByRole("button", { name: "Role" }));
  fireEvent.click(screen.getByRole("radio", { name: "Debt — expected back" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  // No `counterpartyId` — the identity link did not move, and the patch
  // carries only what changed.
  expect(onSave).toHaveBeenCalledWith({
    obligationCounterpartyId: "cp-nina",
    obligationRole: "debt",
  });
});

/** Clearing the person clears the role with them — a role belongs to someone. */
it("drops the role when the counterparty is cleared", () => {
  const { onSave } = renderCard({
    fields: { ...FIELDS, obligationCounterpartyId: "cp-nina", obligationRole: "debt" },
    counterpartyId: null,
    counterpartyName: null,
    obligationCounterpartyId: null,
    obligationCounterpartyName: null,
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onSave).toHaveBeenCalledWith({ obligationCounterpartyId: null, obligationRole: null });
});

/** §6.8 — this screen is the flag's only producer, and it moves no balance. */
it("sends the one-off flag, which is off until it is turned on here", () => {
  const { onSave } = renderCard();
  const toggle = screen.getByRole("checkbox", { name: "One-off" });
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  fireEvent.click(toggle);
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onSave).toHaveBeenCalledWith({ isCapital: true });
});
