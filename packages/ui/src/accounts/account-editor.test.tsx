/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import * as money from "@waltning/core/money";
import { expect, it, vi } from "vitest";
import { en } from "../i18n/en.ts";
import { pl } from "../i18n/pl.ts";
import { I18nProvider } from "../i18n/provider";
import {
  AccountEditor,
  type AccountEditorAccount,
  type AccountEditorGroup,
} from "./account-editor";

const TODAY = "2026-09-03";

const account: AccountEditorAccount = {
  id: "acc-1",
  name: "Bank A · PLN",
  currency: "PLN",
  currencySymbol: "zł",
  decimals: 2,
  kind: "bank",
  ownership: "own",
  isBusiness: false,
  openingBalance: money.toMoney("100"),
  openingDate: "2026-01-01",
  memo: "",
  groupId: null,
  version: 3,
  expectedBalance: null,
};

const groups: readonly AccountEditorGroup[] = [{ id: "group-1", name: "Household" }];

function noop() {
  return undefined;
}

function noopCreateGroup() {
  return null;
}

it("shows the currency as text, never a control", () => {
  render(
    <AccountEditor
      account={account}
      today={TODAY}
      groups={groups}
      onCancel={noop}
      onSave={noop}
      onArchive={noop}
      onReconcile={noop}
      onCreateGroup={noopCreateGroup}
    />,
  );
  expect(screen.getByText("PLN zł")).toBeDefined();
  expect(screen.queryByLabelText("Currency")).toBeNull();
});

it("omits Last observed until an account has been reconciled", () => {
  render(
    <AccountEditor
      account={account}
      today={TODAY}
      groups={groups}
      onCancel={noop}
      onSave={noop}
      onArchive={noop}
      onReconcile={noop}
      onCreateGroup={noopCreateGroup}
    />,
  );
  expect(screen.queryByText("Last observed:")).toBeNull();
});

it("shows Last observed once reconcile_account has recorded one", () => {
  render(
    <AccountEditor
      account={{ ...account, expectedBalance: money.toMoney("1198.30") }}
      today={TODAY}
      groups={groups}
      onCancel={noop}
      onSave={noop}
      onArchive={noop}
      onReconcile={noop}
      onCreateGroup={noopCreateGroup}
    />,
  );
  expect(screen.getByText("Last observed:")).toBeDefined();
  expect(screen.getByText("1 198.30")).toBeDefined();
});

it("Save starts disabled — nothing has changed yet", () => {
  render(
    <AccountEditor
      account={account}
      today={TODAY}
      groups={groups}
      onCancel={noop}
      onSave={noop}
      onArchive={noop}
      onReconcile={noop}
      onCreateGroup={noopCreateGroup}
    />,
  );
  expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-disabled")).toBe("true");
});

it("emits a patch with only the field that changed", () => {
  const onSave = vi.fn();
  render(
    <AccountEditor
      account={account}
      today={TODAY}
      groups={groups}
      onCancel={noop}
      onSave={onSave}
      onArchive={noop}
      onReconcile={noop}
      onCreateGroup={noopCreateGroup}
    />,
  );
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bank A · renamed" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onSave).toHaveBeenCalledWith({ name: "Bank A · renamed" });
});

it("forces business off when ownership moves to shared, and disables the toggle", () => {
  const onSave = vi.fn();
  render(
    <AccountEditor
      account={account}
      today={TODAY}
      groups={groups}
      onCancel={noop}
      onSave={onSave}
      onArchive={noop}
      onReconcile={noop}
      onCreateGroup={noopCreateGroup}
    />,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Shared" }));
  const toggle = screen.getByRole("switch", { name: "Business" });
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  expect(toggle.getAttribute("aria-disabled")).toBe("true");

  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onSave).toHaveBeenCalledWith({ ownership: "shared" });
});

it("shows the opening-balance confirm line only once it changed", () => {
  render(
    <AccountEditor
      account={account}
      today={TODAY}
      groups={groups}
      onCancel={noop}
      onSave={noop}
      onArchive={noop}
      onReconcile={noop}
      onCreateGroup={noopCreateGroup}
    />,
  );
  expect(
    screen.queryByText("Changing this moves every balance from this date forward."),
  ).toBeNull();

  fireEvent.change(screen.getByLabelText("Opening balance"), { target: { value: "50" } });

  expect(
    screen.getByText("Changing this moves every balance from this date forward."),
  ).toBeDefined();
});

/**
 * `numeric(20,8)` is the storage form; the field is the reading form. An
 * account opened at nothing showed `0.00000000` — eight decimals of a scale
 * no złoty account is kept at.
 *
 * **Both languages, explicitly.** The mark is a language property
 * (`design-system/04` §4.1), and a suite that only ever rendered the default
 * would assert nothing about the one component whose whole reason for
 * existing is the comma — S16 §5's own example is written `0,00`.
 */
function openingBalanceIn(locale: "en" | "pl", overrides: Partial<AccountEditorAccount>): string {
  const { unmount } = render(
    <I18nProvider locale={locale}>
      <AccountEditor
        account={{ ...account, ...overrides }}
        today={TODAY}
        groups={groups}
        onCancel={noop}
        onSave={noop}
        onArchive={noop}
        onReconcile={noop}
        onCreateGroup={noopCreateGroup}
      />
    </I18nProvider>,
  );
  // The field's own accessible name is translated too — read from the
  // catalogue rather than written out, so the query cannot drift from it.
  const field = (locale === "pl" ? pl : en).accounts.openingBalance;
  const value = (screen.getByLabelText(field) as HTMLInputElement).value;
  unmount();
  return value;
}

it("shows the opening balance at the currency's own scale, in the reader's own mark", () => {
  expect(openingBalanceIn("pl", { openingBalance: money.toMoney("0") })).toBe("0,00");
  expect(openingBalanceIn("en", { openingBalance: money.toMoney("0") })).toBe("0.00");
  expect(openingBalanceIn("pl", { openingBalance: money.toMoney("12.5") })).toBe("12,50");
  expect(openingBalanceIn("en", { openingBalance: money.toMoney("12.5") })).toBe("12.50");
});

/**
 * The mark follows the language; the grouping does not follow the figure into
 * an editable field. A seeded `6 200,00` keeps that space through every later
 * keystroke — type a digit inside it and the grouping is false for the number
 * it now holds, with no space key on a `decimal-pad` to repair it.
 */
it("does not group a figure that is about to be typed into", () => {
  expect(openingBalanceIn("pl", { openingBalance: money.toMoney("6200") })).toBe("6200,00");
  expect(
    openingBalanceIn("en", { currency: "JPY", decimals: 0, openingBalance: money.toMoney("1200") }),
  ).toBe("1200");
  expect(openingBalanceIn("pl", { openingBalance: money.toMoney("-4000") })).toBe("-4000,00");
});

/** §4.1's own rule — a minus sign on a figure the reader sees as nothing is a lie. */
it("drops the sign from dust that rounds to zero", () => {
  expect(openingBalanceIn("en", { openingBalance: money.toMoney("-0.004") })).toBe("0.00");
});

/**
 * Presenting the figure must not become a write of it: the rounded string is
 * the same money as the stored one, and `update_account` refuses an empty
 * patch — so Save stays disabled until something actually changes.
 */
it("does not count the presented figure as an edit", () => {
  const onSave = vi.fn();
  render(
    <AccountEditor
      account={{ ...account, openingBalance: money.toMoney("100") }}
      today={TODAY}
      groups={groups}
      onCancel={noop}
      onSave={onSave}
      onArchive={noop}
      onReconcile={noop}
      onCreateGroup={noopCreateGroup}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onSave).not.toHaveBeenCalled();

  // Retyping the same money, in the shape the field shows it, is still not a change.
  fireEvent.change(screen.getByLabelText("Opening balance"), { target: { value: "100.00" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onSave).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText("Opening balance"), { target: { value: "12,5" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onSave).toHaveBeenCalledWith({ openingBalance: "12.5" });
});

/**
 * `update_account`'s scale refusal is about one field, and under *Could not
 * save* it read as a defect of the whole form.
 */
it("puts an opening-balance refusal on the opening-balance field", () => {
  render(
    <AccountEditor
      account={account}
      today={TODAY}
      groups={groups}
      fieldErrors={{
        byField: { openingBalance: ["PLN holds 2 decimal places — this amount has more."] },
        formLevel: [],
      }}
      onCancel={noop}
      onSave={noop}
      onArchive={noop}
      onReconcile={noop}
      onCreateGroup={noopCreateGroup}
    />,
  );
  expect(screen.getByText("PLN holds 2 decimal places — this amount has more.")).toBeDefined();
  expect(screen.queryByText("Couldn't save")).toBeNull();
});

it("Archive and Reconcile call their own handlers, not Save", () => {
  const onArchive = vi.fn();
  const onReconcile = vi.fn();
  const onSave = vi.fn();
  render(
    <AccountEditor
      account={account}
      today={TODAY}
      groups={groups}
      onCancel={noop}
      onSave={onSave}
      onArchive={onArchive}
      onReconcile={onReconcile}
      onCreateGroup={noopCreateGroup}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Archive" }));
  fireEvent.click(screen.getByRole("button", { name: "Reconcile…" }));
  expect(onArchive).toHaveBeenCalledTimes(1);
  expect(onReconcile).toHaveBeenCalledTimes(1);
  expect(onSave).not.toHaveBeenCalled();
});

it("creates a group inline and selects it", () => {
  const onCreateGroup = vi.fn(() => "group-2");
  const onSave = vi.fn();
  render(
    <AccountEditor
      account={account}
      today={TODAY}
      groups={groups}
      onCancel={noop}
      onSave={onSave}
      onArchive={noop}
      onReconcile={noop}
      onCreateGroup={onCreateGroup}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "+ New group" }));
  fireEvent.change(screen.getAllByLabelText("Name")[1] as HTMLElement, {
    target: { value: "New group" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add group" }));

  expect(onCreateGroup).toHaveBeenCalledWith("New group");
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onSave).toHaveBeenCalledWith({ groupId: "group-2" });
});

it("renders a field error on name", () => {
  render(
    <AccountEditor
      account={account}
      today={TODAY}
      groups={groups}
      fieldErrors={{ byField: { name: ["too short"] }, formLevel: [] }}
      onCancel={noop}
      onSave={noop}
      onArchive={noop}
      onReconcile={noop}
      onCreateGroup={noopCreateGroup}
    />,
  );
  expect(screen.getByText("too short")).toBeDefined();
});

it("renders a form-level refusal, such as a stale version", () => {
  render(
    <AccountEditor
      account={account}
      today={TODAY}
      groups={groups}
      fieldErrors={{ byField: {}, formLevel: ["version: this account changed elsewhere"] }}
      onCancel={noop}
      onSave={noop}
      onArchive={noop}
      onReconcile={noop}
      onCreateGroup={noopCreateGroup}
    />,
  );
  const alert = screen.getByRole("alert");
  expect(alert.textContent).toContain("version: this account changed elsewhere");
});
