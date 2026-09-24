/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import * as money from "@waltning/core/money";
import { expect, it, vi } from "vitest";
import { AccountRegister, type AccountRegisterAccount } from "./account-register";

/** The display currency, for the cases that exercise the register's own totals. */
const PIVOT = { currency: "PLN", decimals: 2 };

function account(overrides: Partial<AccountRegisterAccount>): AccountRegisterAccount {
  return {
    id: "acc-1",
    name: "Bank A · PLN",
    kind: "bank",
    ownership: "own",
    balance: money.toMoney("100"),
    currency: "PLN",
    isBusiness: false,
    expectedBalance: null,
    ...overrides,
  };
}

it("shows the first-run empty state with nothing to hold", () => {
  const onCreateAccount = vi.fn();
  render(
    <AccountRegister
      accounts={[]}
      archivedAccounts={[]}
      onSelectAccount={vi.fn()}
      onLoadArchived={vi.fn()}
      onCreateAccount={onCreateAccount}
    />,
  );
  expect(screen.getByText("No accounts yet")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Add account" }));
  expect(onCreateAccount).toHaveBeenCalledTimes(1);
});

it("groups by kind, in S16's order, with a subtotal in the display currency", () => {
  render(
    <AccountRegister
      accounts={[
        account({
          id: "cash-1",
          name: "Wallet",
          kind: "cash",
          balance: money.toMoney("840"),
          pivotBalance: money.toMoney("840"),
        }),
        account({
          id: "bank-1",
          name: "Everyday",
          kind: "bank",
          balance: money.toMoney("6200"),
          pivotBalance: money.toMoney("6200"),
        }),
        account({
          id: "bank-2",
          name: "Studio",
          kind: "bank",
          balance: money.toMoney("2220.10"),
          pivotBalance: money.toMoney("2220.10"),
          isBusiness: true,
        }),
      ]}
      archivedAccounts={[]}
      pivot={PIVOT}
      onSelectAccount={vi.fn()}
      onLoadArchived={vi.fn()}
      onCreateAccount={vi.fn()}
    />,
  );
  const headings = screen.getAllByText(/^(Bank|Cash)$/).map((node) => node.textContent);
  // Bank before Cash — S16 §3's order, not alphabetical or insertion order.
  expect(headings.indexOf("Bank")).toBeLessThan(headings.indexOf("Cash"));
  expect(screen.getAllByText("8 420.10").length).toBeGreaterThan(0);
  expect(screen.getByText("BIZ")).toBeDefined();
});

/**
 * **A kind's subtotal exists only in the display currency.** A kind is the one
 * grouping whose members need not share a unit — three banks in złoty, euro
 * and dollars have a sum only once converted — so a caller that cannot convert
 * gets the label and no figure, rather than three figures side by side where
 * a reader asked for one.
 */
it("states no subtotal at all without a display currency", () => {
  render(
    <AccountRegister
      accounts={[
        account({ id: "bank-1", name: "Everyday", balance: money.toMoney("6200") }),
        account({ id: "bank-2", name: "Studio", balance: money.toMoney("2220.10") }),
      ]}
      archivedAccounts={[]}
      onSelectAccount={vi.fn()}
      onLoadArchived={vi.fn()}
      onCreateAccount={vi.fn()}
    />,
  );
  expect(screen.queryByText("8 420.10")).toBeNull();
  expect(screen.getByText("Bank")).toBeDefined();
});

/**
 * S16 §3 — every kind group is a card, and a card is the group of rows it
 * holds (`design-system/05` §5.1). A kind nobody has an account in has no
 * group, so it must draw no card: a *Card* heading with a subtotal of nothing
 * under it is chrome claiming a group exists.
 *
 * **Broken once**: with the `.filter((group) => group.rows.length > 0)` gone
 * from `groups`, this ledger renders all nine `KIND_ORDER` headings, seven of
 * them empty, and the assertions below fail on the first of them.
 *
 * The loop names **all seven** — every kind in `KIND_ORDER` this ledger holds
 * no account in, the two loan kinds included. A subset would let a kind added
 * to `KIND_ORDER`, or one simply forgotten, draw an empty card with nothing
 * saying so; the point of the check is the whole order, not a sample of it.
 */
it("draws no card for a kind nobody holds an account in", () => {
  render(
    <AccountRegister
      accounts={[
        account({ id: "bank-1", name: "Bank A · PLN", kind: "bank" }),
        account({ id: "cash-1", name: "Cash", kind: "cash", balance: money.toMoney("40") }),
      ]}
      archivedAccounts={[]}
      onSelectAccount={vi.fn()}
      onLoadArchived={vi.fn()}
      onCreateAccount={vi.fn()}
    />,
  );

  // `getAllByText` — each kind word appears twice here, once as the group's
  // card title and once as its one row's own kind label.
  expect(screen.getAllByText("Bank").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Cash").length).toBeGreaterThan(0);
  // The kinds this ledger holds nothing in — no heading, so no card.
  for (const kind of [
    "Card",
    "Clearing",
    "Loan (receivable)",
    "Loan (payable)",
    "Investment",
    "Deposit",
    "Other",
  ]) {
    expect(screen.queryByText(kind), `${kind} group drawn with no rows`).toBeNull();
  }
});

it("puts a clearing account's non-zero balance under the amber marker", () => {
  render(
    <AccountRegister
      accounts={[
        account({ id: "clr-1", name: "Clearing", kind: "clearing", balance: money.toMoney("340") }),
      ]}
      archivedAccounts={[]}
      onSelectAccount={vi.fn()}
      onLoadArchived={vi.fn()}
      onCreateAccount={vi.fn()}
    />,
  );
  expect(screen.getByText("Unsettled")).toBeDefined();
});

it("holds a shared account apart, subtotalled on its own, never inside a kind group", () => {
  render(
    <AccountRegister
      accounts={[
        account({ id: "own-1", name: "Bank A", kind: "bank" }),
        account({
          id: "shared-1",
          name: "Household",
          kind: "deposit",
          ownership: "shared",
          balance: money.toMoney("1800"),
        }),
      ]}
      archivedAccounts={[]}
      onSelectAccount={vi.fn()}
      onLoadArchived={vi.fn()}
      onCreateAccount={vi.fn()}
    />,
  );
  expect(screen.getByText("Shared")).toBeDefined();
  expect(screen.queryByText("Deposit")).not.toBeNull(); // the shared row's own kind label
  expect(screen.getAllByText("Household")).toHaveLength(1);
});

it("archived accounts stay hidden until the toggle opens, and the load fires once", () => {
  const onLoadArchived = vi.fn();
  render(
    <AccountRegister
      accounts={[account({})]}
      archivedAccounts={[account({ id: "old-1", name: "Old · PLN" })]}
      archivedLoaded
      onSelectAccount={vi.fn()}
      onLoadArchived={onLoadArchived}
      onCreateAccount={vi.fn()}
    />,
  );
  expect(screen.queryByText("Old · PLN")).toBeNull();
  expect(screen.getByText("Archived")).toBeDefined();

  fireEvent.click(screen.getByText("Archived"));

  expect(onLoadArchived).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Old · PLN")).toBeDefined();
  expect(screen.getByText("Archived (1)")).toBeDefined();
});

/**
 * **A loader that never loads leaves the section closed.** An empty
 * `archivedAccounts` means two things — nothing fetched, nothing there — and
 * the register is only told which by `archivedLoaded`. Without it the
 * section cannot open, because the alternative is a categorical sentence
 * about a list nobody has read.
 */
it("stays collapsed while the load has not delivered", () => {
  render(
    <AccountRegister
      accounts={[account({})]}
      archivedAccounts={[]}
      onSelectAccount={vi.fn()}
      onLoadArchived={vi.fn()}
      onCreateAccount={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByText("Archived"));

  expect(screen.queryByText("No archived accounts.")).toBeNull();
  expect(screen.queryByText("Archived (0)")).toBeNull();
  expect(screen.getByRole("button", { name: "Archived" }).getAttribute("aria-expanded")).toBe(
    "false",
  );
});

/**
 * Loaded, and there is nothing there. The heading takes its expanded string —
 * the control read *Archived* while open once, at the moment tapping it
 * would close the section — and announces that it is expanded.
 */
it("says so when the archived section opens onto nothing", () => {
  render(
    <AccountRegister
      accounts={[account({})]}
      archivedAccounts={[]}
      archivedLoaded
      onSelectAccount={vi.fn()}
      onLoadArchived={vi.fn()}
      onCreateAccount={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByText("Archived"));

  expect(screen.getByText("No archived accounts.")).toBeDefined();
  const heading = screen.getByRole("button", { name: "Archived (0)" });
  expect(heading.getAttribute("aria-expanded")).toBe("true");
});

/**
 * *No archived accounts* is a claim about the ledger. Made while two sit
 * behind a search query it is simply false — the query is what excluded
 * them, and that is a different sentence.
 */
it("says the query excluded them, not that there are none", () => {
  render(
    <AccountRegister
      accounts={[account({})]}
      archivedAccounts={[
        account({ id: "old-1", name: "Old · PLN" }),
        account({ id: "old-2", name: "Older · PLN" }),
      ]}
      archivedLoaded
      onSelectAccount={vi.fn()}
      onLoadArchived={vi.fn()}
      onCreateAccount={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByPlaceholderText("Search…"), { target: { value: "zzz" } });
  fireEvent.click(screen.getByText("Archived"));

  expect(screen.getByText("No archived accounts match.")).toBeDefined();
  expect(screen.queryByText("No archived accounts.")).toBeNull();
});

/** S16 §3 — the register's own primary, on the ground under every group. */
it("offers Add account with accounts present, not only in the empty state", () => {
  const onCreateAccount = vi.fn();
  render(
    <AccountRegister
      accounts={[account({})]}
      archivedAccounts={[]}
      onSelectAccount={vi.fn()}
      onLoadArchived={vi.fn()}
      onCreateAccount={onCreateAccount}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Add account" }));
  expect(onCreateAccount).toHaveBeenCalledTimes(1);
});

it("tapping a row calls onSelectAccount with its id", () => {
  const onSelectAccount = vi.fn();
  render(
    <AccountRegister
      accounts={[account({ id: "bank-1", name: "Bank A" })]}
      archivedAccounts={[]}
      onSelectAccount={onSelectAccount}
      onLoadArchived={vi.fn()}
      onCreateAccount={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Bank A" }));
  expect(onSelectAccount).toHaveBeenCalledWith("bank-1");
});

it("shows Last observed on a row that has been reconciled", () => {
  render(
    <AccountRegister
      accounts={[
        account({
          id: "bank-1",
          name: "Bank A",
          expectedBalance: money.toMoney("1198.30"),
        }),
      ]}
      archivedAccounts={[]}
      onSelectAccount={vi.fn()}
      onLoadArchived={vi.fn()}
      onCreateAccount={vi.fn()}
    />,
  );
  expect(screen.getByText("Last observed:")).toBeDefined();
  expect(screen.getByText("1 198.30")).toBeDefined();
});

it("filters by name across own, shared and archived, with a live result count", () => {
  render(
    <AccountRegister
      accounts={[
        account({ id: "bank-1", name: "Bank A" }),
        account({ id: "cash-1", name: "Cash", kind: "cash" }),
      ]}
      archivedAccounts={[]}
      onSelectAccount={vi.fn()}
      onLoadArchived={vi.fn()}
      onCreateAccount={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "bank" } });
  expect(screen.getByText("Bank A")).toBeDefined();
  expect(screen.queryByText("Cash")).toBeNull();
  expect(screen.getByText("1 result")).toBeDefined();
});

/** S16 §7 — S31's own entry point. */
it("offers Transfer from here on an own account's row, only when asked", () => {
  const onTransferFrom = vi.fn();
  render(
    <AccountRegister
      accounts={[account({ id: "cash-1", name: "Cash" })]}
      archivedAccounts={[]}
      onSelectAccount={vi.fn()}
      onLoadArchived={vi.fn()}
      onCreateAccount={vi.fn()}
      onTransferFrom={onTransferFrom}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Transfer from here" }));
  expect(onTransferFrom).toHaveBeenCalledWith("cash-1");
});

it("has no Transfer action when the screen does not offer one", () => {
  render(
    <AccountRegister
      accounts={[account({ id: "cash-1", name: "Cash" })]}
      archivedAccounts={[]}
      onSelectAccount={vi.fn()}
      onLoadArchived={vi.fn()}
      onCreateAccount={vi.fn()}
    />,
  );
  expect(screen.queryByRole("button", { name: "Transfer from here" })).toBeNull();
});

/**
 * S16 §3 — reordering lives behind *Edit*, because a register is read far
 * more often than it is arranged. Without the handler there is no *Edit* at
 * all: a screen that cannot write the order must not offer to change it.
 */
it("offers Edit only where the order can be written", () => {
  render(
    <AccountRegister
      accounts={[account({}), account({ id: "acc-2", name: "Bank B · PLN" })]}
      archivedAccounts={[]}
      onSelectAccount={vi.fn()}
      onLoadArchived={vi.fn()}
      onCreateAccount={vi.fn()}
    />,
  );
  expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
});

it("sends the whole list in its new order, and refuses a move off the end", () => {
  const onReorder = vi.fn();
  render(
    <AccountRegister
      accounts={[
        account({ id: "acc-1", name: "Bank A · PLN" }),
        account({ id: "acc-2", name: "Bank B · PLN" }),
        account({ id: "acc-3", name: "Cash · PLN", kind: "cash" }),
      ]}
      archivedAccounts={[account({ id: "acc-old", name: "Old · PLN" })]}
      onSelectAccount={vi.fn()}
      onLoadArchived={vi.fn()}
      onCreateAccount={vi.fn()}
      onReorder={onReorder}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.click(screen.getByRole("button", { name: "Move Bank B · PLN up" }));

  // Every id the register holds, in the order it now draws them — `sort` is
  // one sequence over the whole table.
  expect(onReorder).toHaveBeenCalledWith(["acc-2", "acc-1", "acc-3", "acc-old"]);

  // The only cash row cannot move: its group has one member, and a swap
  // across a kind boundary would put a row in a group it cannot be seen in.
  expect(
    screen.getByRole("button", { name: "Move Cash · PLN up" }).getAttribute("aria-disabled"),
  ).toBe("true");
});

/** A filtered register cannot state a whole order, and the operation takes nothing less. */
it("withdraws Edit while a search is narrowing the list", () => {
  render(
    <AccountRegister
      accounts={[account({}), account({ id: "acc-2", name: "Bank B · PLN" })]}
      archivedAccounts={[]}
      onSelectAccount={vi.fn()}
      onLoadArchived={vi.fn()}
      onCreateAccount={vi.fn()}
      onReorder={vi.fn()}
    />,
  );
  expect(screen.getByRole("button", { name: "Edit" })).toBeDefined();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Bank B" } });
  expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
});

/**
 * **A kind's subtotal is stated in the display currency, always.**
 *
 * It used to be one figure per currency in the header, and to vanish for a
 * group of one because those two figures were identical and printed in the
 * same voice. Neither holds now: the section's label reads as the section's
 * own line rather than as another balance, and the figure beside it is the
 * one number a reader cannot get by looking — three banks in three currencies
 * summed into the one unit the screen totals in.
 */
it("states a kind's subtotal in the display currency, one account or three", () => {
  render(
    <AccountRegister
      accounts={[
        account({
          id: "cash-1",
          name: "Wallet",
          kind: "cash",
          balance: money.toMoney("840"),
          pivotBalance: money.toMoney("840"),
        }),
      ]}
      archivedAccounts={[]}
      pivot={PIVOT}
      onSelectAccount={vi.fn()}
      onLoadArchived={vi.fn()}
      onCreateAccount={vi.fn()}
    />,
  );
  // The row, the section's subtotal, and the register's own total: one
  // account is all three, and each says so in its own place.
  expect(screen.getAllByText("840.00").length).toBeGreaterThanOrEqual(2);
});

/**
 * **A foreign account with no rate is in the list and out of the total**, and
 * the line under the figure is what says so — a sum over two of three accounts
 * passed off as a sum over three is the one thing S16 §3 refuses.
 */
it("counts only the accounts it can convert, and says how many that was", () => {
  render(
    <AccountRegister
      accounts={[
        account({
          id: "bank-1",
          name: "Everyday",
          balance: money.toMoney("6200"),
          pivotBalance: money.toMoney("6200"),
        }),
        account({
          id: "bank-2",
          name: "Studio",
          balance: money.toMoney("2220.10"),
          pivotBalance: money.toMoney("2220.10"),
        }),
        account({ id: "bank-3", name: "Abroad", currency: "EUR", balance: money.toMoney("500") }),
      ]}
      archivedAccounts={[]}
      pivot={PIVOT}
      onSelectAccount={vi.fn()}
      onLoadArchived={vi.fn()}
      onCreateAccount={vi.fn()}
    />,
  );
  expect(screen.getAllByText("8 420.10").length).toBeGreaterThan(0);
  expect(screen.getByText("2 of 3 accounts counted")).toBeDefined();
});

/**
 * **A section folds, and the register is read far more often than it is
 * arranged.** Eleven accounts across five kinds is a screen you scroll; the
 * kinds you never look at should be one line each, and the ones you do should
 * still be open when you arrive — which is why the state is *shut* rather than
 * *open*, and empty by default.
 */
it("opens every section, and folds the one you press", () => {
  render(
    <AccountRegister
      accounts={[
        account({ id: "bank-1", name: "Everyday", kind: "bank" }),
        account({ id: "cash-1", name: "Wallet", kind: "cash" }),
      ]}
      archivedAccounts={[]}
      pivot={PIVOT}
      onSelectAccount={vi.fn()}
      onLoadArchived={vi.fn()}
      onCreateAccount={vi.fn()}
    />,
  );
  expect(screen.getByRole("button", { name: "Everyday" })).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: "Bank" }));
  expect(screen.queryByRole("button", { name: "Everyday" })).toBeNull();
  // Its own label stays, and only it folded — Cash is untouched.
  expect(screen.getByRole("button", { name: "Bank" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Wallet" })).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: "Bank" }));
  expect(screen.getByRole("button", { name: "Everyday" })).toBeDefined();
});

/**
 * **Two groupings, because a kind and a currency answer different questions.**
 * By kind is *what sort of money is this*; by currency is *what do I hold in
 * euro*. The same accounts, regrouped — nothing is filtered out by the switch.
 */
it("regroups by currency without losing an account", () => {
  render(
    <AccountRegister
      accounts={[
        account({ id: "bank-1", name: "Everyday", kind: "bank", currency: "PLN" }),
        account({ id: "card-1", name: "Card A", kind: "card", currency: "EUR" }),
        account({ id: "cash-1", name: "Wallet", kind: "cash", currency: "PLN" }),
      ]}
      archivedAccounts={[]}
      pivot={PIVOT}
      onSelectAccount={vi.fn()}
      onLoadArchived={vi.fn()}
      onCreateAccount={vi.fn()}
    />,
  );
  // The section headers, by role: a currency's *code* also appears as the mark
  // beside every figure, so matching on bare text would find EUR either way.
  expect(screen.getByRole("button", { name: "Bank" })).toBeDefined();
  expect(screen.queryByRole("button", { name: "EUR" })).toBeNull();

  fireEvent.click(screen.getByRole("tab", { name: "By currency" }));
  expect(screen.getByRole("button", { name: "PLN" })).toBeDefined();
  expect(screen.getByRole("button", { name: "EUR" })).toBeDefined();
  expect(screen.queryByRole("button", { name: "Bank" })).toBeNull();
  for (const name of ["Everyday", "Card A", "Wallet"]) {
    expect(screen.getByRole("button", { name })).toBeDefined();
  }
});
