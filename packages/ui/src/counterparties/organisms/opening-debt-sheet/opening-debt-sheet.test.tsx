/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { OpeningDebtSheet } from "./opening-debt-sheet";

const TODAY = "2026-09-03";
const CURRENCIES = [{ code: "PLN" }, { code: "EUR" }];

function noop() {
  return undefined;
}

it("renders nothing while not visible", () => {
  render(
    <OpeningDebtSheet
      visible={false}
      counterpartyName="Nina"
      currencies={CURRENCIES}
      existingCurrencies={[]}
      today={TODAY}
      onDismiss={noop}
      onSave={noop}
    />,
  );
  expect(screen.queryByText("Existing debt with Nina")).toBeNull();
});

it("asks for direction, currency, amount and date — and no account, no category", () => {
  render(
    <OpeningDebtSheet
      visible
      counterpartyName="Nina"
      currencies={CURRENCIES}
      existingCurrencies={[]}
      today={TODAY}
      onDismiss={noop}
      onSave={noop}
    />,
  );
  expect(screen.getByText("Existing debt with Nina")).toBeDefined();
  expect(screen.getByText("Who owes whom")).toBeDefined();
  expect(screen.getByText("They owe you")).toBeDefined();
  expect(screen.getByText("You owe them")).toBeDefined();
  expect(screen.getByLabelText("Amount")).toBeDefined();
  expect(screen.getByText("Date of the debt")).toBeDefined();
  expect(screen.queryByText("Category")).toBeNull();
  expect(screen.queryByText("Account")).toBeNull();
});

it("refuses a Save before a figure is typed and hands nothing on", () => {
  const onSave = vi.fn();
  render(
    <OpeningDebtSheet
      visible
      counterpartyName="Nina"
      currencies={CURRENCIES}
      existingCurrencies={[]}
      today={TODAY}
      onDismiss={noop}
      onSave={onSave}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save debt" }));
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByText("Required")).toBeDefined();
});

it("saves the direction, the figure, the first currency and today by default", () => {
  const onSave = vi.fn();
  render(
    <OpeningDebtSheet
      visible
      counterpartyName="Nina"
      currencies={CURRENCIES}
      existingCurrencies={[]}
      today={TODAY}
      onDismiss={noop}
      onSave={onSave}
    />,
  );
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "200" } });
  fireEvent.click(screen.getByRole("button", { name: "Save debt" }));

  expect(onSave).toHaveBeenCalledWith({
    direction: "theyOwe",
    amount: "200",
    currency: "PLN",
    date: TODAY,
  });
});

it("saves the other direction when it is chosen", () => {
  const onSave = vi.fn();
  render(
    <OpeningDebtSheet
      visible
      counterpartyName="Nina"
      currencies={CURRENCIES}
      existingCurrencies={[]}
      today={TODAY}
      onDismiss={noop}
      onSave={onSave}
    />,
  );
  fireEvent.click(screen.getByText("You owe them"));
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "80,50" } });
  fireEvent.click(screen.getByRole("button", { name: "Save debt" }));

  expect(onSave).toHaveBeenCalledWith({
    direction: "youOwe",
    amount: "80.50",
    currency: "PLN",
    date: TODAY,
  });
});

it("prefills a debt being corrected, and says saving replaces it", () => {
  const onSave = vi.fn();
  render(
    <OpeningDebtSheet
      visible
      counterpartyName="Nina"
      currencies={CURRENCIES}
      existingCurrencies={["EUR"]}
      initial={{ direction: "youOwe", currency: "EUR", amount: "12.00", date: "2026-01-02" }}
      today={TODAY}
      onDismiss={noop}
      onSave={onSave}
    />,
  );
  expect(screen.getByText("This replaces the existing debt in EUR.")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Save debt" }));

  expect(onSave).toHaveBeenCalledWith({
    direction: "youOwe",
    amount: "12.00",
    currency: "EUR",
    date: "2026-01-02",
  });
});

it("draws a refusal the write made on the amount field", () => {
  render(
    <OpeningDebtSheet
      visible
      counterpartyName="Nina"
      currencies={CURRENCIES}
      existingCurrencies={[]}
      today={TODAY}
      fieldErrors={{ byField: { amount: ["PLN holds 2 decimal places."] }, formLevel: [] }}
      onDismiss={noop}
      onSave={noop}
    />,
  );
  expect(screen.getByText("PLN holds 2 decimal places.")).toBeDefined();
});
