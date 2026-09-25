/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
  type: "expense",
  date: "2026-08-06",
  accountId: "account-a",
  amount: "48.90",
  toAccountId: null,
  toAmount: null,
  fee: null,
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

/** One card for every type: an expense's amount is a row like any other field. */
it("edits an expense's amount, unsigned, and sends only that", () => {
  const { onSave } = renderCard();
  fireEvent.click(screen.getByRole("button", { name: "Amount: 48.90" }));
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "52.10" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onSave).toHaveBeenCalledWith({ amountOriginal: "52.10" });
});

it("counts 48.9 and 48.90 as the same amount — nothing to save", () => {
  renderCard();
  fireEvent.click(screen.getByRole("button", { name: "Amount: 48.90" }));
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "48.9" } });
  expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
});

describe("a transfer — the same card, with a transfer's own rows", () => {
  const EUR_CARD = {
    id: "account-c",
    name: "Card A · EUR",
    currency: "EUR",
    kind: "card" as const,
    capturable: true,
    ownership: "own" as const,
    groupId: null,
  };
  const TRANSFER: TransactionFields = {
    ...FIELDS,
    type: "transfer",
    accountId: "account-b",
    amount: "400.00",
    toAccountId: "account-a",
    toAmount: "400.00",
    fee: null,
    categoryId: null,
    enteredName: "",
  };
  function renderTransfer(overrides: Partial<Parameters<typeof FieldsCard>[0]> = {}) {
    const onOpenToAccountPicker = vi.fn();
    const rendered = renderCard({
      fields: TRANSFER,
      accounts: [...ACCOUNTS, EUR_CARD],
      accountId: "account-b",
      toAccountId: "account-a",
      onOpenToAccountPicker,
      categoryId: null,
      categoryName: null,
      ...overrides,
    });
    return { ...rendered, onOpenToAccountPicker };
  }

  it("names both legs and the amount, and has no category or entered name", () => {
    renderTransfer();
    expect(screen.getByRole("button", { name: "From: Bank A · PLN" })).toBeDefined();
    expect(screen.getByRole("button", { name: "To: Cash · PLN" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Amount: 400.00" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Fee" })).toBeDefined();
    expect(screen.queryByRole("button", { name: /^Category/ }), "no category").toBeNull();
    expect(screen.queryByRole("button", { name: /^Payee/ }), "no entered name").toBeNull();
    // One currency, one figure: no second amount to state.
    expect(screen.queryByRole("button", { name: /^Destination amount/ })).toBeNull();
  });

  it("keeps who it was with and who owes — a repayment can land in an account", () => {
    renderTransfer();
    expect(screen.getByRole("button", { name: "Counterparty" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Someone owes" })).toBeDefined();
  });

  it("opens the destination through the screen's own picker", () => {
    const { onOpenToAccountPicker } = renderTransfer();
    fireEvent.click(screen.getByRole("button", { name: "To: Cash · PLN" }));
    expect(onOpenToAccountPicker).toHaveBeenCalledTimes(1);
  });

  it("moves both legs together within one currency", () => {
    const { onSave } = renderTransfer();
    fireEvent.click(screen.getByRole("button", { name: "Amount: 400.00" }));
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "450" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ amountOriginal: "450", toAmount: "450" });
  });

  it("asks for the destination figure once the currencies differ, and sends its currency", () => {
    const { onSave } = renderTransfer({ toAccountId: "account-c" });
    fireEvent.click(screen.getByRole("button", { name: /^Destination amount/ }));
    fireEvent.change(screen.getByLabelText("Destination amount"), {
      target: { value: "93.20" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({
      toAccountId: "account-c",
      toCurrency: "EUR",
      toAmount: "93.20",
    });
  });

  it("adds a fee, and a typed 0 is no fee", () => {
    const { onSave } = renderTransfer();
    fireEvent.click(screen.getByRole("button", { name: "Fee" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Fee" }), { target: { value: "0" } });
    expect(screen.queryByRole("button", { name: "Save" }), "0 is nothing").toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Fee" }), { target: { value: "2.50" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ fee: "2.50" });
  });
});
