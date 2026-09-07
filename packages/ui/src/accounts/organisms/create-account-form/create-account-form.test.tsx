/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { currencyCode } from "@waltning/core/money";
import { expect, it, vi } from "vitest";
import {
  type CreateAccountCurrency,
  CreateAccountForm,
  type CreateAccountGroup,
} from "./create-account-form";

const currencies: readonly CreateAccountCurrency[] = [
  { code: currencyCode("PLN"), name: "Polish Złoty", symbol: "zł" },
  { code: currencyCode("BYN"), name: "Belarusian Ruble", symbol: "Br" },
];

const groups: readonly CreateAccountGroup[] = [{ id: "group-1", name: "Household" }];

const TODAY = "2026-09-03";

/** The minimal draft — every field but name and currency at its default. */
const minimal = {
  kind: "other",
  ownership: "own",
  isBusiness: false,
  openingBalance: "0",
  openingDate: null,
  memo: "",
  groupId: null,
};

it("offers every currency the ledger holds and rejects a whitespace-only name", () => {
  render(
    <CreateAccountForm
      currencies={currencies}
      today={TODAY}
      groups={[]}
      onCancel={vi.fn()}
      onSave={vi.fn()}
    />,
  );
  expect(screen.getByText(/PLN/)).toBeDefined();
  expect(screen.getByText(/BYN/)).toBeDefined();
  const save = screen.getByRole("button", { name: "Save" });
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "   " } });
  expect(save.getAttribute("aria-disabled")).toBe("true");
});

it("trims the name and saves it with the chosen currency, through the shared defaults", () => {
  const onSave = vi.fn();
  render(
    <CreateAccountForm
      currencies={currencies}
      today={TODAY}
      groups={[]}
      onCancel={vi.fn()}
      onSave={onSave}
    />,
  );
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  Bank A  " } });
  fireEvent.click(screen.getByRole("radio", { name: /BYN/ }));
  screen.getByRole("button", { name: "Save" }).click();
  expect(onSave).toHaveBeenCalledWith({ ...minimal, name: "Bank A", currency: "BYN" });
});

/**
 * The first row, not the pivot. USD is the hub rates are quoted against and
 * nothing about that makes it the currency someone is opening an account in —
 * a form that preselects it tells a person banking in złoty they are the
 * exception. Here the reference set is not even in the list.
 */
it("preselects the first currency it was given, not a hardcoded one", () => {
  const onSave = vi.fn();
  render(
    <CreateAccountForm
      currencies={currencies}
      today={TODAY}
      groups={[]}
      onCancel={vi.fn()}
      onSave={onSave}
    />,
  );
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bank A" } });
  screen.getByRole("button", { name: "Save" }).click();
  expect(onSave).toHaveBeenCalledWith({ ...minimal, name: "Bank A", currency: "PLN" });
});

it("prevents a name longer than the shared 120-character contract", () => {
  render(
    <CreateAccountForm
      currencies={currencies}
      today={TODAY}
      groups={[]}
      onCancel={vi.fn()}
      onSave={vi.fn()}
    />,
  );
  expect(screen.getByLabelText("Name").getAttribute("maxlength")).toBe("120");
});

/**
 * Reachable during a reset, when the replica has been deleted and not yet
 * rebuilt. A dead Save button explains itself; a crash does not.
 */
it("stays rendered with no currencies, and cannot save", () => {
  render(
    <CreateAccountForm
      currencies={[]}
      today={TODAY}
      groups={[]}
      onCancel={vi.fn()}
      onSave={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bank A" } });
  expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-disabled")).toBe("true");
});

/**
 * The collapsed default is what keeps B1's and the pre-existing tests' path
 * unchanged — every field `create_account` also takes exists, but not in the
 * DOM until asked for.
 */
it("collapses seven fields behind More details by default", () => {
  render(
    <CreateAccountForm
      currencies={currencies}
      today={TODAY}
      groups={groups}
      onCancel={vi.fn()}
      onSave={vi.fn()}
    />,
  );
  expect(screen.queryByLabelText("Kind")).toBeNull();
  expect(screen.queryByRole("radiogroup", { name: "Ownership" })).toBeNull();
  expect(screen.queryByLabelText("Business")).toBeNull();
  expect(screen.queryByLabelText("Opening balance")).toBeNull();
  expect(screen.queryByLabelText("Opening date")).toBeNull();
  expect(screen.queryByLabelText("Memo")).toBeNull();
  expect(screen.queryByLabelText("Group")).toBeNull();
});

it("switching ownership to shared forces business off and disables the toggle", () => {
  render(
    <CreateAccountForm
      currencies={currencies}
      today={TODAY}
      groups={groups}
      onCancel={vi.fn()}
      onSave={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "More details" }));

  fireEvent.click(screen.getByRole("switch", { name: "Business" }));
  expect(screen.getByRole("switch", { name: "Business" }).getAttribute("aria-checked")).toBe(
    "true",
  );

  fireEvent.click(screen.getByRole("radio", { name: "Shared" }));

  const toggle = screen.getByRole("switch", { name: "Business" });
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  expect(toggle.getAttribute("aria-disabled")).toBe("true");
});

it("an invalid opening date blocks Save with the field error", () => {
  render(
    <CreateAccountForm
      currencies={currencies}
      today={TODAY}
      groups={groups}
      onCancel={vi.fn()}
      onSave={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bank A" } });
  fireEvent.click(screen.getByRole("button", { name: "More details" }));

  fireEvent.change(screen.getByLabelText("Opening date"), { target: { value: "not-a-date" } });

  expect(screen.getByText("Enter a date as YYYY-MM-DD.")).toBeDefined();
  expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-disabled")).toBe("true");
});

it("reaches onSave with the whole draft once More details is filled in", () => {
  const onSave = vi.fn();
  render(
    <CreateAccountForm
      currencies={currencies}
      today={TODAY}
      groups={groups}
      onCancel={vi.fn()}
      onSave={onSave}
    />,
  );
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bank A" } });
  fireEvent.click(screen.getByRole("button", { name: "More details" }));

  // Already filled with the default ("other"), so its accessible name is
  // "field: value" (`common.fieldValue`) rather than the bare label.
  fireEvent.click(screen.getByRole("button", { name: "Kind: Other" }));
  fireEvent.click(screen.getByRole("radio", { name: "Investment" }));

  fireEvent.click(screen.getByRole("switch", { name: "Business" }));

  fireEvent.change(screen.getByLabelText("Opening balance"), { target: { value: "1234,56" } });
  fireEvent.change(screen.getByLabelText("Opening date"), { target: { value: "2026-01-15" } });
  fireEvent.change(screen.getByLabelText("Memo"), {
    target: { value: "Migrated from Money Manager" },
  });

  fireEvent.click(screen.getByRole("button", { name: "Group" }));
  fireEvent.click(screen.getByRole("radio", { name: "Household" }));

  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(onSave).toHaveBeenCalledWith({
    name: "Bank A",
    currency: "PLN",
    kind: "investment",
    ownership: "own",
    isBusiness: true,
    openingBalance: "1234.56",
    openingDate: "2026-01-15",
    memo: "Migrated from Money Manager",
    groupId: "group-1",
  });
});

it("renders two errors from one map on their own fields", () => {
  render(
    <CreateAccountForm
      currencies={currencies}
      today={TODAY}
      groups={groups}
      fieldErrors={{
        byField: { name: ["too short"], currency: ["not held by the ledger"] },
        formLevel: [],
      }}
      onCancel={vi.fn()}
      onSave={vi.fn()}
    />,
  );
  expect(screen.getByText("too short")).toBeDefined();
  expect(screen.getByText("not held by the ledger")).toBeDefined();
});

it("renders an unknown path at form level, under an alert", () => {
  render(
    <CreateAccountForm
      currencies={currencies}
      today={TODAY}
      groups={groups}
      fieldErrors={{ byField: {}, formLevel: ["externalId: already used"] }}
      onCancel={vi.fn()}
      onSave={vi.fn()}
    />,
  );
  const alert = screen.getByRole("alert");
  expect(alert.textContent).toContain("Couldn't save");
  expect(alert.textContent).toContain("externalId: already used");
});

it("renders nothing extra with no fieldErrors prop", () => {
  render(
    <CreateAccountForm
      currencies={currencies}
      today={TODAY}
      groups={groups}
      onCancel={vi.fn()}
      onSave={vi.fn()}
    />,
  );
  expect(screen.queryByRole("alert")).toBeNull();
});

/**
 * §14.6 — holding a currency and capturing in it are two capabilities. The
 * account still opens; the form says what the missing rate costs and offers
 * the one screen that fixes it.
 */
it("names a currency with no rate, and offers S18 with it", () => {
  const onSetRate = vi.fn();
  render(
    <CreateAccountForm
      currencies={[
        { code: currencyCode("BYN"), name: "Belarusian Ruble", symbol: "Br", capturable: false },
        { code: currencyCode("PLN"), name: "Polish Złoty", symbol: "zł", capturable: true },
      ]}
      today={TODAY}
      groups={[]}
      onCancel={vi.fn()}
      onSave={vi.fn()}
      onSetRate={onSetRate}
    />,
  );

  expect(screen.getByText(/BYN has no exchange rate yet/)).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Set a BYN rate" }));
  expect(onSetRate).toHaveBeenCalledWith("BYN");

  // Choosing one that can be valued takes the note away — and Save was never
  // blocked by it in the first place.
  fireEvent.click(screen.getByRole("radio", { name: "PLN — Polish Złoty" }));
  expect(screen.queryByText(/has no exchange rate yet/)).toBeNull();
});

/** A caller that never resolved the question is not claiming a currency is unusable. */
it("says nothing about rates when no currency declares capturable", () => {
  render(
    <CreateAccountForm
      currencies={currencies}
      today={TODAY}
      groups={[]}
      onCancel={vi.fn()}
      onSave={vi.fn()}
    />,
  );
  expect(screen.queryByText(/has no exchange rate yet/)).toBeNull();
});
