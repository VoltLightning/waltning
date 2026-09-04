/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { toMoney } from "@waltning/core/money";
import { expect, it, vi } from "vitest";
import {
  AccountPicker,
  type AccountPickerAccount,
  type AccountPickerGroup,
} from "./account-picker";

const GROUPS: AccountPickerGroup[] = [
  { id: "grp-bank", name: "BANK" },
  { id: "grp-cash", name: "CASH" },
];

const CASH: AccountPickerAccount = {
  id: "acc-cash",
  name: "Cash · PLN",
  currency: "PLN",
  decimals: 2,
  kind: "cash",
  capturable: true,
  ownership: "own",
  groupId: "grp-cash",
};
const BANK_CARD: AccountPickerAccount = {
  id: "acc-card",
  name: "Bank A card · PLN",
  currency: "PLN",
  decimals: 2,
  kind: "card",
  capturable: true,
  ownership: "own",
  groupId: "grp-bank",
};
const BANK: AccountPickerAccount = {
  id: "acc-bank",
  name: "Bank A · PLN",
  currency: "PLN",
  decimals: 2,
  kind: "bank",
  capturable: true,
  ownership: "own",
  groupId: "grp-bank",
};
const UNGROUPED: AccountPickerAccount = {
  id: "acc-ungrouped",
  name: "Loose · USD",
  currency: "USD",
  decimals: 2,
  kind: "other",
  capturable: true,
  ownership: "own",
  groupId: null,
};
const SHARED: AccountPickerAccount = {
  id: "acc-shared",
  name: "Joint · PLN",
  currency: "PLN",
  decimals: 2,
  kind: "bank",
  capturable: true,
  ownership: "shared",
  groupId: "grp-bank",
};
const UNCAPTURABLE: AccountPickerAccount = {
  id: "acc-byn",
  name: "Cash · BYN",
  currency: "BYN",
  decimals: 2,
  kind: "cash",
  capturable: false,
  ownership: "own",
  groupId: "grp-cash",
};
const ARCHIVED: AccountPickerAccount = {
  id: "acc-archived",
  name: "Old · PLN",
  currency: "PLN",
  decimals: 2,
  kind: "cash",
  capturable: true,
  ownership: "own",
  groupId: "grp-cash",
  archived: true,
};

const ACCOUNTS = [CASH, BANK_CARD, BANK, UNGROUPED, SHARED, UNCAPTURABLE, ARCHIVED];

function renderPicker(overrides: Partial<React.ComponentProps<typeof AccountPicker>> = {}) {
  return render(
    <AccountPicker
      visible
      accounts={ACCOUNTS}
      groups={GROUPS}
      accountId={null}
      onPick={vi.fn()}
      onCreateAccount={vi.fn()}
      onDismiss={vi.fn()}
      {...overrides}
    />,
  );
}

it("groups accounts under their own group header, then kind, ungrouped last under Other", () => {
  renderPicker();
  const headings = screen.getAllByText(/^(BANK|CASH|Other)$/).map((el) => el.textContent);
  expect(headings).toEqual(["BANK", "CASH", "Other"]);
  // Within BANK: `bank` sorts before `card` (`ACCOUNT_KIND`'s own order).
  const names = ["Bank A · PLN", "Bank A card · PLN", "Joint · PLN"];
  const bankRadios = screen
    .getAllByRole("radio")
    .filter((el) => names.includes(el.getAttribute("aria-label") ?? ""));
  expect(bankRadios.map((el) => el.getAttribute("aria-label"))).toEqual([
    "Bank A · PLN",
    "Joint · PLN",
    "Bank A card · PLN",
  ]);
});

it("never offers an archived account", () => {
  renderPicker();
  expect(screen.queryByText("Old · PLN")).toBeNull();
});

it("puts the last-used account first, in its own Recent section, machine-filled", () => {
  renderPicker({ lastUsedId: "acc-bank", lastUsedAt: new Date("2026-08-12T14:20:00Z").getTime() });
  expect(screen.getByText("Recent")).toBeDefined();
  expect(screen.getByText(/From your last capture/)).toBeDefined();
  // It still appears a second time in its own group.
  expect(screen.getAllByRole("radio", { name: "Bank A · PLN" })).toHaveLength(2);
});

it("filters live by folded name once search is offered", () => {
  const many = [
    ...ACCOUNTS,
    ...Array.from({ length: 3 }, (_, i) => ({
      ...CASH,
      id: `acc-extra-${i}`,
      name: `Extra ${i} · PLN`,
    })),
  ];
  renderPicker({ accounts: many });
  expect(screen.getByPlaceholderText(/Search \d+ accounts/)).toBeDefined();
  fireEvent.change(screen.getByPlaceholderText(/Search \d+ accounts/), {
    target: { value: "bank a" },
  });
  expect(screen.getByRole("radio", { name: "Bank A · PLN" })).toBeDefined();
  expect(screen.queryByRole("radio", { name: "Cash · PLN" })).toBeNull();
  // Group headers fold away while searching, matching `CategorySheet`'s own rule.
  expect(screen.queryByText("BANK")).toBeNull();
});

it("shows an empty state when the search matches nothing", () => {
  const many = [
    ...ACCOUNTS,
    ...Array.from({ length: 3 }, (_, i) => ({ ...CASH, id: `acc-extra-${i}`, name: `Extra ${i}` })),
  ];
  renderPicker({ accounts: many });
  fireEvent.change(screen.getByPlaceholderText(/Search \d+ accounts/), {
    target: { value: "nothing matches this" },
  });
  expect(screen.getByText("No matching account")).toBeDefined();
});

it("never hides an uncapturable account, and explains why beside it", () => {
  renderPicker();
  const tile = screen.getByRole("radio", { name: "Cash · BYN" });
  expect(tile).toBeDefined();
  expect(
    screen.getByText("BYN needs an exchange rate before a transaction can be recorded in it."),
  ).toBeDefined();
});

it("fires the pick callback with the account id, from any section", () => {
  const onPick = vi.fn();
  renderPicker({ onPick, lastUsedId: "acc-bank" });
  fireEvent.click(screen.getAllByRole("radio", { name: "Bank A · PLN" })[1] as HTMLElement);
  expect(onPick).toHaveBeenCalledWith("acc-bank");
});

it("marks a shared account with a tag rather than a colour", () => {
  renderPicker();
  expect(screen.getByText("Shared")).toBeDefined();
});

it("shows a balance through Amount only when the caller passes one", () => {
  renderPicker({
    accounts: [{ ...CASH, balance: toMoney("840") }],
  });
  expect(screen.getByText("840.00")).toBeDefined();
});

it("renders the grid two columns wide", () => {
  renderPicker();
  const tile = screen.getByRole("radio", { name: "Cash · PLN" });
  const wrap = tile.parentElement as HTMLElement;
  expect(getComputedStyle(wrap).width).toBe("48%");
});

it("offers Create account… from the pinned footer", () => {
  const onCreateAccount = vi.fn();
  renderPicker({ onCreateAccount });
  fireEvent.click(screen.getByRole("button", { name: "Create account…" }));
  expect(onCreateAccount).toHaveBeenCalledOnce();
});
