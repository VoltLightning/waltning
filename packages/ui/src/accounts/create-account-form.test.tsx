/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { currencyCode } from "@waltning/core/money";
import { expect, it, vi } from "vitest";
import { type CreateAccountCurrency, CreateAccountForm } from "./create-account-form";

const currencies: readonly CreateAccountCurrency[] = [
  { code: currencyCode("PLN"), name: "Polish Złoty" },
  { code: currencyCode("BYN"), name: "Belarusian Ruble" },
];

it("offers every currency the ledger holds and rejects a whitespace-only name", () => {
  render(<CreateAccountForm currencies={currencies} onCancel={vi.fn()} onSave={vi.fn()} />);
  expect(screen.getByText(/PLN/)).toBeDefined();
  expect(screen.getByText("BYN")).toBeDefined();
  const save = screen.getByRole("button", { name: "Save" });
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "   " } });
  expect(save.getAttribute("aria-disabled")).toBe("true");
});

it("trims the name and saves it with the chosen currency", () => {
  const onSave = vi.fn();
  render(<CreateAccountForm currencies={currencies} onCancel={vi.fn()} onSave={onSave} />);
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  Bank A  " } });
  fireEvent.click(screen.getByRole("button", { name: /BYN/ }));
  screen.getByRole("button", { name: "Save" }).click();
  expect(onSave).toHaveBeenCalledWith({ name: "Bank A", currency: "BYN" });
});

/**
 * The first row, not the pivot. USD is the hub rates are quoted against and
 * nothing about that makes it the currency someone is opening an account in —
 * a form that preselects it tells a person banking in złoty they are the
 * exception. Here the reference set is not even in the list.
 */
it("preselects the first currency it was given, not a hardcoded one", () => {
  const onSave = vi.fn();
  render(<CreateAccountForm currencies={currencies} onCancel={vi.fn()} onSave={onSave} />);
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bank A" } });
  screen.getByRole("button", { name: "Save" }).click();
  expect(onSave).toHaveBeenCalledWith({ name: "Bank A", currency: "PLN" });
});

it("prevents a name longer than the shared 120-character contract", () => {
  render(<CreateAccountForm currencies={currencies} onCancel={vi.fn()} onSave={vi.fn()} />);
  expect(screen.getByLabelText("Name").getAttribute("maxlength")).toBe("120");
});

/**
 * Reachable during a reset, when the replica has been deleted and not yet
 * rebuilt. A dead Save button explains itself; a crash does not.
 */
it("stays rendered with no currencies, and cannot save", () => {
  render(<CreateAccountForm currencies={[]} onCancel={vi.fn()} onSave={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bank A" } });
  expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-disabled")).toBe("true");
});
