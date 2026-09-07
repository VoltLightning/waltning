/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { currencyCode } from "@waltning/core/money";
import { expect, it, vi } from "vitest";
import { type QuickAddDraft, QuickAddForm, type QuickAddFormProps } from "./quick-add-form";

const accounts = [
  { id: "account-a", name: "Bank A · PLN", currency: currencyCode("PLN"), capturable: true },
  { id: "account-b", name: "Bank B · BYN", currency: currencyCode("BYN"), capturable: true },
];

const categories = [
  { id: "cat-groceries", name: "Groceries", kind: "expense" as const },
  { id: "cat-salary", name: "Salary", kind: "income" as const },
];

const TODAY = "2026-09-03";

/** Every field `onSave` should carry once amount and account are filled and nothing more is touched. */
const restingDraft: Omit<QuickAddDraft, "amount" | "accountId"> = {
  type: "expense",
  categoryId: null,
  date: TODAY,
  note: "",
  isBusiness: false,
  counterpartyId: null,
  counterpartyRole: null,
};

const BASE_PROPS: QuickAddFormProps = {
  accounts,
  categories,
  counterparties: [],
  today: TODAY,
  accountId: null,
  onOpenAccountPicker: vi.fn(),
  categoryId: null,
  onOpenCategoryPicker: vi.fn(),
  onCancel: vi.fn(),
  onSave: vi.fn(),
};

function renderForm(overrides: Partial<QuickAddFormProps> = {}) {
  return render(<QuickAddForm {...BASE_PROPS} {...overrides} />);
}

function fillAmount() {
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "10" } });
}

/**
 * The absence list is superseded by B3 — Category, Date and Income used to be
 * proof this was still the disposable preview. Now the type segment and the
 * category picker are the fast path's own next step, so they render
 * collapsed; only the *More* fold and the voice/scan/sync/FX affordances this
 * card never touches stay absent.
 */
it("collapses to amount, account, type, category and More — nothing else", () => {
  renderForm();
  expect(screen.getByLabelText("Amount")).toBeDefined();
  expect(screen.getByRole("button", { name: "Account" })).toBeDefined();
  expect(screen.getByRole("tab", { name: "Expense" })).toBeDefined();
  expect(screen.getByRole("tab", { name: "Income" })).toBeDefined();
  expect(screen.getByText("Category")).toBeDefined();
  expect(screen.getByRole("button", { name: "More" })).toBeDefined();

  for (const absent of [
    "Date",
    "Note",
    "Business",
    "Counterparty",
    "Voice",
    "Scan",
    "Sync",
    "Shared",
    "FX",
    "Tabs",
  ]) {
    expect(screen.queryByText(absent)).toBeNull();
  }
});

it("reveals date, note, business and counterparty only after More", () => {
  renderForm({ counterparties: [{ id: "cp-a", name: "Counterparty A" }] });
  fireEvent.click(screen.getByRole("button", { name: "More" }));

  expect(screen.getByLabelText("Date")).toBeDefined();
  expect(screen.getByLabelText("Note")).toBeDefined();
  expect(screen.getByRole("switch", { name: "Business" })).toBeDefined();
  expect(screen.getByText("Counterparty")).toBeDefined();
});

it("saves the resting draft — amount and account, everything else at its default", () => {
  const onSave = vi.fn();
  renderForm({ onSave });
  expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-disabled")).toBe("true");
  cleanup();

  // The account is a controlled prop now — the screen sets it once
  // `AccountPicker`'s own pick lands, the same way `categoryId` already works.
  renderForm({ onSave, accountId: "account-a" });
  fillAmount();
  const save = screen.getByRole("button", { name: "Save" });
  expect(save.getAttribute("aria-disabled")).toBeNull();
  fireEvent.click(save);
  expect(onSave).toHaveBeenCalledWith({ ...restingDraft, amount: "10", accountId: "account-a" });
  expect(typeof onSave.mock.calls[0]?.[0].amount).toBe("string");
});

/**
 * `AccountPicker` (`accounts/`) is a sibling domain — the same rule
 * `QuickAddComposer` already keeps for `CategorySheet`. This form only ever
 * asks the screen to open it, carrying the amount typed so far — the sheet's
 * own footer needs it for the escape to account creation.
 */
it("opens the account picker carrying the amount typed so far", () => {
  const onOpenAccountPicker = vi.fn();
  renderForm({ initialAmount: "10", onOpenAccountPicker });
  fireEvent.click(screen.getByRole("button", { name: "Account" }));
  expect(onOpenAccountPicker).toHaveBeenCalledWith({ amount: "10" });
});

// L — a trailing-separator seed ("1," mid-way to "1,50") is fine: `AmountField`
// keeps it on screen verbatim, unparsed, the same as anything else typed.
it("seeds a trailing-separator initial amount onto the field verbatim", () => {
  renderForm({ initialAmount: "1," });
  expect(screen.getByLabelText("Amount")).toHaveProperty("value", "1,");
});

it("shows the picked account on the chip, from the controlled accountId", () => {
  renderForm({ accountId: "account-a" });
  expect(screen.getByRole("button", { name: "Account: Bank A · PLN" })).toBeDefined();
});

/**
 * The affix follows the account, and the second account is in a different
 * currency from the first. `QuickAddAccount.currency` was the literal type
 * `"USD"` and the field's affix was the literal string — so an expense against a
 * złoty account was labelled in dollars, and the compiler called it correct.
 */
it("labels the amount in the selected account's own currency", () => {
  const { rerender } = renderForm();
  expect(screen.queryByText("PLN")).toBeNull();

  rerender(<QuickAddForm {...BASE_PROPS} accountId="account-a" />);
  expect(screen.getByText("PLN")).toBeDefined();

  rerender(<QuickAddForm {...BASE_PROPS} accountId="account-b" />);
  expect(screen.getByText("BYN")).toBeDefined();
  expect(screen.queryByText("PLN")).toBeNull();
});

/** §7.2 — the keypad never signs, `type` alone carries direction. */
it("reaches onSave with type: income once the Income tab is chosen", () => {
  const onSave = vi.fn();
  renderForm({ onSave, accountId: "account-a" });
  fireEvent.click(screen.getByRole("tab", { name: "Income" }));
  fillAmount();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(onSave.mock.calls[0]?.[0]).toMatchObject({ type: "income" });
});

/**
 * D4a: S06's sheet is composed by the screen, not this form
 * (`architecture/11` — a module composes at app routes, never a sibling
 * domain), so the field is a trigger. The current `type` travels with the
 * request, because the form is the one place that knows which half of the
 * taxonomy is in play.
 */
it("opens the category picker for the current type when the field is pressed", () => {
  const onOpenCategoryPicker = vi.fn();
  renderForm({ onOpenCategoryPicker });
  fireEvent.click(screen.getByRole("button", { name: "Category" }));
  expect(onOpenCategoryPicker).toHaveBeenCalledWith("expense");

  fireEvent.click(screen.getByRole("tab", { name: "Income" }));
  fireEvent.click(screen.getByRole("button", { name: "Category" }));
  expect(onOpenCategoryPicker).toHaveBeenLastCalledWith("income");
});

/** The picked leaf is a controlled prop — the field shows it, and Save carries it. */
it("shows the picked category and carries it into onSave", () => {
  const onSave = vi.fn();
  renderForm({ categoryId: "cat-groceries", onSave, accountId: "account-a" });
  expect(screen.getByRole("button", { name: "Category: Groceries" })).toBeDefined();

  fillAmount();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onSave.mock.calls[0]?.[0]).toMatchObject({ categoryId: "cat-groceries" });
});

/**
 * TAXONOMY R1 pairs a category with the type it belongs to. `categoryId` is
 * controlled now — the form cannot clear a parent-owned prop — so a stale
 * pick is masked instead: hidden from the field and left out of the save,
 * without losing it if `type` switches back.
 */
it("masks a category that no longer matches the type, and restores it on switching back", () => {
  const onSave = vi.fn();
  renderForm({ categoryId: "cat-groceries", onSave, accountId: "account-a" });
  fireEvent.click(screen.getByRole("tab", { name: "Income" }));
  expect(screen.getByRole("button", { name: "Category" })).toBeDefined();
  expect(screen.queryByRole("button", { name: "Category: Groceries" })).toBeNull();

  fillAmount();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onSave.mock.calls[0]?.[0]).toMatchObject({ categoryId: null, type: "income" });

  fireEvent.click(screen.getByRole("tab", { name: "Expense" }));
  expect(screen.getByRole("button", { name: "Category: Groceries" })).toBeDefined();
});

/** The reason belongs to the field that caused it (`architecture/12`). */
it("renders a categoryId field error under the field", () => {
  renderForm({
    fieldErrors: { byField: { categoryId: ["that category was archived"] }, formLevel: [] },
  });
  expect(screen.getByText("that category was archived")).toBeDefined();
});

/** The `capturedTz` card's editable-date half — an edited date reaches the write. */
it("carries an edited date through to onSave", () => {
  const onSave = vi.fn();
  renderForm({ onSave, accountId: "account-a" });
  fireEvent.click(screen.getByRole("button", { name: "More" }));
  fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-01-15" } });
  fillAmount();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(onSave.mock.calls[0]?.[0]).toMatchObject({ date: "2026-01-15" });
});

/** A date that is not `YYYY-MM-DD` blocks Save rather than reaching the write malformed. */
it("blocks Save on a malformed date", () => {
  renderForm({ accountId: "account-a" });
  fireEvent.click(screen.getByRole("button", { name: "More" }));
  fireEvent.change(screen.getByLabelText("Date"), { target: { value: "15 Jan" } });
  fillAmount();

  expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-disabled")).toBe("true");
});

it("offers no counterparty field when the ledger holds none", () => {
  renderForm();
  fireEvent.click(screen.getByRole("button", { name: "More" }));
  expect(screen.queryByText("Counterparty")).toBeNull();
});

/** §6.6 — a counterparty is offered, and its role stays hidden until one is chosen. */
it("offers a counterparty once the ledger holds one, and its role once it is picked", () => {
  renderForm({ counterparties: [{ id: "cp-a", name: "Counterparty A" }] });
  fireEvent.click(screen.getByRole("button", { name: "More" }));
  expect(screen.getByText("Counterparty")).toBeDefined();
  expect(screen.queryByRole("radiogroup", { name: "Role" })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Counterparty" }));
  fireEvent.click(screen.getByRole("radio", { name: "Counterparty A" }));

  expect(screen.getByRole("radiogroup", { name: "Role" })).toBeDefined();
  expect(screen.getByRole("radio", { name: "Debt — expected back" })).toBeDefined();
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
  renderForm({ accounts: unrated, onSave, accountId: "account-a" });
  fillAmount();

  expect(screen.getByText(/PLN needs an exchange rate/)).toBeDefined();
  const save = screen.getByRole("button", { name: "Save" });
  expect(save.getAttribute("aria-disabled")).toBe("true");
  fireEvent.click(save);
  expect(onSave).not.toHaveBeenCalled();
});

/** The reason belongs to the choice, so it is absent until one is made. */
it("says nothing about rates before an account is chosen", () => {
  renderForm({
    accounts: [
      { id: "account-a", name: "Bank A · PLN", currency: currencyCode("PLN"), capturable: false },
    ],
  });
  expect(screen.queryByText(/needs an exchange rate/)).toBeNull();
});

it("renders two errors from one map on their own fields", () => {
  renderForm({
    categories: [],
    today: "2026-08-24",
    fieldErrors: {
      byField: { amountOriginal: ["must be positive"], accountId: ["choose one"] },
      formLevel: [],
    },
  });
  expect(screen.getByText("must be positive")).toBeDefined();
  expect(screen.getByText("choose one")).toBeDefined();
});

it("renders an unknown path at form level, under an alert", () => {
  renderForm({
    categories: [],
    today: "2026-08-24",
    fieldErrors: { byField: {}, formLevel: ["date: not accepted"] },
  });
  const alert = screen.getByRole("alert");
  expect(alert.textContent).toContain("Couldn't save");
  expect(alert.textContent).toContain("date: not accepted");
});

it("renders nothing extra with no fieldErrors prop", () => {
  renderForm({ categories: [], today: "2026-08-24" });
  expect(screen.queryByRole("alert")).toBeNull();
});
