/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import * as money from "@waltning/core/money";
import { expect, it, vi } from "vitest";
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
 */
it("shows the opening balance at the currency's own scale", () => {
  render(
    <AccountEditor
      account={{ ...account, openingBalance: money.toMoney("0") }}
      today={TODAY}
      groups={groups}
      onCancel={noop}
      onSave={noop}
      onArchive={noop}
      onReconcile={noop}
      onCreateGroup={noopCreateGroup}
    />,
  );
  expect((screen.getByLabelText("Opening balance") as HTMLInputElement).value).toBe("0.00");
});

it("shows a two-decimal figure whole, and a zero-decimal currency with none", () => {
  const { unmount } = render(
    <AccountEditor
      account={{ ...account, openingBalance: money.toMoney("12.5") }}
      today={TODAY}
      groups={groups}
      onCancel={noop}
      onSave={noop}
      onArchive={noop}
      onReconcile={noop}
      onCreateGroup={noopCreateGroup}
    />,
  );
  expect((screen.getByLabelText("Opening balance") as HTMLInputElement).value).toBe("12.50");
  unmount();

  render(
    <AccountEditor
      account={{ ...account, currency: "JPY", decimals: 0, openingBalance: money.toMoney("1200") }}
      today={TODAY}
      groups={groups}
      onCancel={noop}
      onSave={noop}
      onArchive={noop}
      onReconcile={noop}
      onCreateGroup={noopCreateGroup}
    />,
  );
  expect((screen.getByLabelText("Opening balance") as HTMLInputElement).value).toBe("1200");
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
