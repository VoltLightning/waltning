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
  paidAmount: null,
  paidCurrency: null,
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
  fireEvent.click(screen.getByRole("button", { name: "Person or company" }));
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
    paidAmount: null,
    paidCurrency: null,
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
    expect(screen.getByRole("button", { name: "Person or company" })).toBeDefined();
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

/**
 * §6.6 — S09 follows the category: a debt category makes the role `debt`, asks
 * **Who?** and cannot be saved without it; leaving the category takes back the
 * role it gave, and the person it was asked for with it.
 */
describe("a debt category — Who? is required, the role follows the category", () => {
  const DEBT = {
    categoryId: "cat-borrowed",
    categoryName: "Money from friends",
    debtCategory: true,
  };
  const NINA = { obligationCounterpartyId: "cp-nina", obligationCounterpartyName: "Nina" };

  it("asks Who? with no role to choose, and refuses Save on that row until a person is named", () => {
    const { onSave } = renderCard(DEBT);
    expect(screen.getByRole("button", { name: "Who?" })).toBeDefined();
    expect(screen.queryByRole("button", { name: /^Role/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Choose who this is with.")).toBeDefined();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves the category, the person and the debt role together", () => {
    const { onSave } = renderCard({ ...DEBT, ...NINA });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({
      categoryId: "cat-borrowed",
      obligationCounterpartyId: "cp-nina",
      obligationRole: "debt",
    });
  });

  /** The saved row is a debt under a debt category; the pick moves it to a plain one. */
  function renderSavedDebt(obligationRole: "debt" | "contribution") {
    const saved: TransactionFields = {
      ...FIELDS,
      categoryId: "cat-borrowed",
      obligationCounterpartyId: "cp-nina",
      obligationRole,
    };
    const onSave = vi.fn();
    const props = {
      fields: saved,
      accounts: ACCOUNTS,
      accountId: "account-a",
      onOpenAccountPicker: vi.fn(),
      today: "2026-08-06",
      onOpenCategoryPicker: vi.fn(),
      counterpartyId: null,
      counterpartyName: null,
      ...NINA,
      onOpenCounterpartyPicker: vi.fn(),
      onSave,
    };
    const view = render(<FieldsCard {...props} {...DEBT} />);
    return { onSave, view, props };
  }

  it("takes the role and the person back when the category stops being a debt", () => {
    const { onSave, view, props } = renderSavedDebt("debt");
    view.rerender(
      <FieldsCard {...props} categoryId="cat-salary" categoryName="Salary" debtCategory={false} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({
      categoryId: "cat-salary",
      obligationCounterpartyId: null,
      obligationRole: null,
    });
  });

  it("keeps a role somebody chose by hand when the category changes", () => {
    const { onSave, view, props } = renderSavedDebt("contribution");
    view.rerender(
      <FieldsCard {...props} categoryId="cat-salary" categoryName="Salary" debtCategory={false} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    // Only the category moved: the contribution and its person stay.
    expect(onSave).toHaveBeenCalledWith({ categoryId: "cat-salary" });
  });
});

/**
 * A legacy row — filed under a debt category before the rule — is shown as it
 * is. Opening it changes nothing and an unrelated edit is never held up.
 */
describe("a legacy row under a debt category", () => {
  const DEBT = {
    categoryId: "cat-borrowed",
    categoryName: "Money from friends",
    debtCategory: true,
  };
  const legacy = (overrides: Partial<TransactionFields>): TransactionFields => ({
    ...FIELDS,
    categoryId: "cat-borrowed",
    ...overrides,
  });

  it("does not open with Save showing when it carries a contribution", () => {
    renderCard({
      ...DEBT,
      fields: legacy({ obligationCounterpartyId: "cp-nina", obligationRole: "contribution" }),
      obligationCounterpartyId: "cp-nina",
      obligationCounterpartyName: "Nina",
    });
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("says it is not counted as a debt, and a note edit saves without asking for who", () => {
    const { onSave } = renderCard({ ...DEBT, fields: legacy({}) });
    expect(screen.getByText(/^Not counted as a debt yet/)).toBeDefined();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Note" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), {
      target: { value: "a note" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ note: "a note" });
  });

  it("becomes a debt the moment somebody is named", () => {
    const { onSave } = renderCard({
      ...DEBT,
      fields: legacy({}),
      obligationCounterpartyId: "cp-nina",
      obligationCounterpartyName: "Nina",
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({
      obligationCounterpartyId: "cp-nina",
      obligationRole: "debt",
    });
  });
});

/** §7.8 — an entry paid in another currency than its account's: both figures are shown, and both edited. */
describe("what was paid — beside what the account was charged", () => {
  const EUR_ACCOUNT = {
    id: "account-eur",
    name: "Card A · EUR",
    currency: "EUR",
    kind: "card" as const,
    capturable: true,
    ownership: "own" as const,
    groupId: null,
  };
  const CURRENCIES = [
    { code: "EUR", name: "Euro" },
    { code: "CZK", name: "Czech koruna" },
    { code: "JPY", name: "Yen" },
  ];
  const CHARGED: TransactionFields = {
    ...FIELDS,
    accountId: "account-eur",
    amount: "14.02",
    paidAmount: "350.00",
    paidCurrency: "CZK",
  };
  const draw = (overrides: Partial<Parameters<typeof FieldsCard>[0]> = {}) =>
    renderCard({
      accounts: [EUR_ACCOUNT],
      accountId: "account-eur",
      paidCurrencies: CURRENCIES,
      ...overrides,
    });

  it("offers a Paid row on an entry that has none, and draws it empty", () => {
    draw({ fields: { ...FIELDS, accountId: "account-eur" } });
    expect(screen.getByRole("button", { name: "Paid" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Amount: 48.90" })).toBeDefined();
  });

  it("draws no Paid row when there is no other currency to offer and nothing was paid", () => {
    draw({
      fields: { ...FIELDS, accountId: "account-eur" },
      paidCurrencies: [{ code: "EUR", name: "Euro" }],
    });
    expect(screen.queryByRole("button", { name: /^Paid/ })).toBeNull();
  });

  it("shows both figures — what was paid, and what the account was charged", () => {
    draw({ fields: CHARGED });
    expect(screen.getByRole("button", { name: "Paid: 350.00 CZK" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Charged to the account: 14.02" })).toBeDefined();
  });

  it("puts a pair on an entry, both halves in one patch", () => {
    const { onSave } = draw({ fields: { ...FIELDS, accountId: "account-eur" } });
    fireEvent.click(screen.getByRole("button", { name: "Paid" }));
    fireEvent.click(screen.getByRole("button", { name: /^Currency paid in/ }));
    fireEvent.click(screen.getByRole("radio", { name: "CZK · Czech koruna" }));
    fireEvent.change(screen.getByLabelText("Amount paid"), { target: { value: "350" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ paidCurrency: "CZK", paidAmount: "350" });
  });

  it("will not save a currency with no figure", () => {
    draw({ fields: { ...FIELDS, accountId: "account-eur" } });
    fireEvent.click(screen.getByRole("button", { name: "Paid" }));
    fireEvent.click(screen.getByRole("button", { name: /^Currency paid in/ }));
    fireEvent.click(screen.getByRole("radio", { name: "CZK · Czech koruna" }));
    expect(screen.getByText("Enter the amount as well.")).toBeDefined();
    // Half a pair is not a change: there is nothing to save until it is whole.
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("edits the paid figure alone, and the charged figure alone", () => {
    const { onSave } = draw({ fields: CHARGED });
    fireEvent.click(screen.getByRole("button", { name: "Paid: 350.00 CZK" }));
    fireEvent.change(screen.getByLabelText("Amount paid"), { target: { value: "351" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenLastCalledWith({ paidAmount: "351" });
    cleanup();

    const second = draw({ fields: CHARGED });
    fireEvent.click(screen.getByRole("button", { name: "Charged to the account: 14.02" }));
    fireEvent.change(screen.getByLabelText("Charged to the account"), {
      target: { value: "14.05" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(second.onSave).toHaveBeenCalledWith({ amountOriginal: "14.05" });
  });

  it("takes the pair off by choosing the account's own currency — both to null", () => {
    const { onSave } = draw({ fields: CHARGED });
    fireEvent.click(screen.getByRole("button", { name: "Paid: 350.00 CZK" }));
    fireEvent.click(screen.getByRole("button", { name: /^Currency paid in/ }));
    fireEvent.click(screen.getByRole("radio", { name: "EUR — the account's own" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ paidAmount: null, paidCurrency: null });
  });

  it("offers no Paid row on a repayment — it has no paid side", () => {
    draw({ fields: { ...FIELDS, accountId: "account-eur" }, settlement: true });
    expect(screen.queryByRole("button", { name: /^Paid/ })).toBeNull();
  });

  it("offers no Paid row on a transfer", () => {
    draw({
      fields: { ...FIELDS, type: "transfer", toAccountId: "account-a", toAmount: "48.90" },
      toAccountId: "account-a",
      accounts: [EUR_ACCOUNT, ...ACCOUNTS],
    });
    expect(screen.queryByRole("button", { name: /^Paid/ })).toBeNull();
  });
});
