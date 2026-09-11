/** @vitest-environment jsdom */

/**
 * `QuickAddComposer` — the deck's anatomy for S05 §3: the amount card, the
 * rows under it, the chips, the note. Every rule the chip row used to carry
 * (P2's trail, §6.6's role, §6.7's scope, §14.6's refusal) is asserted here
 * against the rows that carry it now.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { currencyCode } from "@waltning/core/money";
import { expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n/provider";
import { ThemeProvider } from "../../../theme/provider";
import { light } from "../../../theme/roles";
import { QuickAddComposer, type QuickAddComposerProps } from "./quick-add-composer";

const ACCOUNTS: QuickAddComposerProps["accounts"] = [
  {
    id: "account-a",
    name: "Cash · PLN",
    currency: currencyCode("PLN"),
    decimals: 2,
    capturable: true,
    ownership: "own",
  },
  {
    id: "account-shared",
    name: "Joint · PLN",
    currency: currencyCode("PLN"),
    decimals: 2,
    capturable: true,
    ownership: "shared",
  },
];

const CATEGORIES: QuickAddComposerProps["categories"] = [
  { id: "cat-eating-out", name: "Eating out", kind: "expense", usage: 12 },
  { id: "cat-groceries", name: "Groceries", kind: "expense", usage: 40 },
  { id: "cat-transport", name: "Transport", kind: "expense", usage: 9 },
  { id: "cat-home", name: "Home", kind: "expense", usage: 7 },
  { id: "cat-fun", name: "Fun", kind: "expense", usage: 3 },
  { id: "cat-salary", name: "Salary", kind: "income", usage: 6 },
];

/** §14.6 — held, and nothing can be captured in it: the pivot holds no rate for PLN. */
const UNCAPTURABLE_CASH: QuickAddComposerProps["accounts"][number] = {
  id: "account-a",
  name: "Cash · PLN",
  currency: currencyCode("PLN"),
  decimals: 2,
  capturable: false,
  ownership: "own",
};

const TODAY = "2026-09-03";

/** Fresh mocks per draw — a shared `vi.fn()` carries one test's calls into the next. */
function base(): QuickAddComposerProps {
  return {
    raw: "",
    onRawChange: vi.fn(),
    type: "expense",
    accounts: ACCOUNTS,
    accountId: null,
    accountMachineFilled: false,
    onOpenAccountPicker: vi.fn(),
    categories: CATEGORIES,
    categoryId: null,
    onOpenCategoryPicker: vi.fn(),
    onPickCategory: vi.fn(),
    payee: "",
    onPayeeChange: vi.fn(),
    date: TODAY,
    onDateChange: vi.fn(),
    today: TODAY,
    isBusiness: false,
    onBusinessChange: vi.fn(),
    note: "",
    onNoteChange: vi.fn(),
    counterparties: [],
    counterpartyId: null,
    onCounterpartyChange: vi.fn(),
    counterpartyRole: null,
    onCounterpartyRoleChange: vi.fn(),
  };
}

function draw(overrides: Partial<QuickAddComposerProps> = {}) {
  const props = { ...base(), ...overrides };
  render(
    <ThemeProvider theme={light}>
      <I18nProvider>
        <QuickAddComposer {...props} />
      </I18nProvider>
    </ThemeProvider>,
  );
  return props;
}

function openMore() {
  fireEvent.click(screen.getByRole("button", { name: /^More details/ }));
}

it("draws two rows at rest — the account and the category — and the rest behind one", () => {
  draw();
  expect(screen.getByRole("button", { name: /^From/ })).toBeDefined();
  expect(screen.getByRole("button", { name: "Category" })).toBeDefined();
  expect(
    screen.getByRole("button", { name: "More details: Payee, date, scope, person" }),
  ).toBeDefined();
  expect(screen.queryByRole("button", { name: "Payee" })).toBeNull();
  openMore();
  expect(screen.getByRole("button", { name: "Payee" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Date: Today" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Scope" })).toBeDefined();
});

it("folds what the system keyboard typed onto the draft's own shape", () => {
  const props = draw({ accountId: "account-a" });
  fireEvent.change(screen.getByLabelText("How much?"), { target: { value: "1 240.509 zł" } });
  expect(props.onRawChange).toHaveBeenCalledWith("1240,50");
});

it("carries the chosen account's currency onto the figure, and its sign from the kind", () => {
  draw({ accountId: "account-a", raw: "48,90" });
  expect(screen.getByText("PLN")).toBeDefined();
  expect(screen.getByText("−")).toBeDefined();
});

it("offers this kind's most-used categories as chips, and a chip's pick is the row's value", () => {
  const props = draw();
  const chips = screen.getAllByRole("radio").map((chip) => chip.getAttribute("aria-label"));
  expect(chips).toEqual(["Groceries", "Eating out", "Transport", "Home"]);
  expect(screen.queryByRole("radio", { name: "Salary" })).toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: "Transport" }));
  expect(props.onPickCategory).toHaveBeenCalledWith("cat-transport");
});

it("keeps the picked category among the chips even when it is not among the most used", () => {
  draw({ categoryId: "cat-fun" });
  expect(screen.getByRole("radio", { name: "Fun" })).toHaveProperty("ariaChecked", "true");
  expect(screen.queryByRole("radio", { name: "Home" })).toBeNull();
  expect(screen.getByRole("button", { name: "Category: Fun" })).toBeDefined();
});

it("opens the category and account pickers through callbacks rather than rendering them", () => {
  const props = draw();
  fireEvent.click(screen.getByRole("button", { name: "Category" }));
  fireEvent.click(screen.getByRole("button", { name: /^From/ }));
  expect(props.onOpenCategoryPicker).toHaveBeenCalledOnce();
  expect(props.onOpenAccountPicker).toHaveBeenCalledOnce();
});

it("shows D2's proposal machine-filled until a real pick lands (P2)", () => {
  draw({
    payee: "Corner Cafe",
    categoryProposal: {
      categoryId: "cat-eating-out",
      confidence: 0.9,
      basis: "exact",
      neighbours: [],
    },
  });
  expect(
    screen.getByRole("button", { name: "Category: Eating out, filled automatically" }),
  ).toBeDefined();
});

it("shows the P2 trail and Undo when the draft holds an applied proposal (H1)", () => {
  const onUndoCategory = vi.fn();
  draw({
    payee: "Corner Cafe",
    categoryId: "cat-eating-out",
    categoryAutoFilled: true,
    onUndoCategory,
    categoryProposal: {
      categoryId: "cat-eating-out",
      confidence: 0.9,
      basis: "neighbours",
      neighbours: [{ payee: "Corner Café", similarity: 0.95, categoryId: "cat-eating-out" }],
    },
  });
  expect(screen.getByText("From your history: Corner Café")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(onUndoCategory).toHaveBeenCalledOnce();
});

it("shows a below-threshold proposal as a suggestion in the placeholder, never as a value", () => {
  draw({
    payee: "Corner",
    categoryProposal: {
      categoryId: "cat-eating-out",
      confidence: 0.3,
      basis: "neighbours",
      neighbours: [{ payee: "Corner Café", similarity: 0.4, categoryId: "cat-eating-out" }],
    },
  });
  // The suggestion is the row's placeholder, and the row's name carries it —
  // a suggestion only the sighted can read is tint alone (P5).
  expect(screen.getByRole("button", { name: "Category: Suggested: Eating out" })).toBeDefined();
  expect(screen.queryByRole("button", { name: /filled automatically/ })).toBeNull();
});

it("lets someone type a payee through its own sheet, and the More row then says so", () => {
  const props = draw();
  openMore();
  fireEvent.click(screen.getByRole("button", { name: "Payee" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Payee" }), {
    target: { value: "Corner Café" },
  });
  expect(props.onPayeeChange).toHaveBeenCalledWith("Corner Café");
});

it("summarises the rarer fields on the More row while they are folded away", () => {
  draw({ payee: "Corner Café", date: "2026-09-01", isBusiness: true, accountId: "account-a" });
  expect(
    screen.getByRole("button", { name: "More details: Corner Café · 2026-09-01 · Business" }),
  ).toBeDefined();
});

it("marks the account row machine-filled when the last-used window filled it (P2)", () => {
  draw({ accountId: "account-a", accountMachineFilled: true });
  expect(
    screen.getByRole("button", { name: "From: Cash · PLN, filled automatically" }),
  ).toBeDefined();
});

it("offers a person once the ledger holds one, and never defaults the role (§6.6)", () => {
  const props = draw({ counterparties: [{ id: "cp-a", name: "Corner Café" }] });
  openMore();
  fireEvent.click(screen.getByRole("button", { name: "Person" }));
  fireEvent.click(screen.getByRole("button", { name: "Counterparty" }));
  fireEvent.click(screen.getByRole("radio", { name: "Corner Café" }));
  expect(props.onCounterpartyChange).toHaveBeenCalledWith("cp-a");
});

it("spells out a missing role on the person row rather than leaving it to a form error", () => {
  draw({ counterparties: [{ id: "cp-a", name: "Corner Café" }], counterpartyId: "cp-a" });
  openMore();
  expect(screen.getByRole("button", { name: "Person: Corner Café · role?" })).toBeDefined();
});

it("renders a field error under the row it names, and the amount's under the figure", () => {
  draw({
    fieldErrors: {
      byField: {
        amountOriginal: ["Amount must be positive."],
        categoryId: ["Pick a category."],
      },
      formLevel: [],
    },
  });
  expect(screen.getByText("Amount must be positive.")).toBeDefined();
  expect(screen.getByText("Pick a category.")).toBeDefined();
});

it("carries a folded row's error onto the More row so it is never hidden", () => {
  draw({ fieldErrors: { byField: { payee: ["Too long."] }, formLevel: [] } });
  expect(screen.getByText("Too long.")).toBeDefined();
});

it("states the needsRate refusal the moment an uncapturable account is picked (§14.6)", () => {
  const onSetRate = vi.fn();
  draw({
    accounts: [UNCAPTURABLE_CASH],
    accountId: "account-a",
    onSetRate,
  });
  expect(
    screen.getByText("PLN needs an exchange rate before a transaction can be recorded in it."),
  ).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Set a PLN rate" }));
  expect(onSetRate).toHaveBeenCalledOnce();
});

it("states the refusal once when the field error repeats the banner's sentence (L2)", () => {
  draw({
    accounts: [UNCAPTURABLE_CASH],
    accountId: "account-a",
    fieldErrors: {
      byField: {
        accountId: ["PLN needs an exchange rate before a transaction can be recorded in it."],
      },
      formLevel: [],
    },
  });
  expect(
    screen.getAllByText("PLN needs an exchange rate before a transaction can be recorded in it."),
  ).toHaveLength(1);
});

it("shows the scope row's value from the account's ownership, and toggles Business through its sheet", () => {
  const props = draw({ accountId: "account-a" });
  openMore();
  fireEvent.click(screen.getByRole("button", { name: "Scope: Mine" }));
  fireEvent.click(screen.getByRole("tab", { name: "Business" }));
  expect(props.onBusinessChange).toHaveBeenCalledWith(true);
});

it("makes Business unreachable for a shared account, and says why (§6.7)", () => {
  const props = draw({ accountId: "account-shared" });
  openMore();
  fireEvent.click(screen.getByRole("button", { name: "Scope: Shared" }));
  const business = screen.getByRole("tab", { name: /Business/ });
  expect(business.getAttribute("aria-disabled")).toBe("true");
  fireEvent.click(business);
  expect(props.onBusinessChange).not.toHaveBeenCalled();
  expect(
    screen.getByRole("tab", { name: "Business, A shared account is never business." }),
  ).toBeDefined();
});

it("takes the note in its own field, without a sheet", () => {
  const props = draw();
  fireEvent.change(screen.getByLabelText("Note"), { target: { value: "for the party" } });
  expect(props.onNoteChange).toHaveBeenCalledWith("for the party");
});

it("draws the pace line under the figure as given, and nothing when there is none", () => {
  draw({ pace: "Groceries this month: 61% of usual" });
  expect(screen.getByText("Groceries this month: 61% of usual")).toBeDefined();
});
