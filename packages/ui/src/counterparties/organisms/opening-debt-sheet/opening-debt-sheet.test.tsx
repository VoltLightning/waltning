/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { toMoney } from "@waltning/core/money";
import { expect, it, vi } from "vitest";
import { pickDate } from "../../../primitives/atoms/date-field/date-field.test-support.ts";
import { OpeningDebtSheet, type OpeningDebtSheetProps } from "./opening-debt-sheet";

const TODAY = "2026-09-03";
const CURRENCIES = [
  { code: "PLN", decimals: 2 },
  { code: "EUR", decimals: 2 },
];

function noop() {
  return undefined;
}

function sheet(over: Partial<OpeningDebtSheetProps> = {}) {
  return (
    <OpeningDebtSheet
      visible
      counterpartyName="Nina"
      currencies={CURRENCIES}
      existingDebts={[]}
      balances={[]}
      today={TODAY}
      onDismiss={noop}
      onSave={noop}
      onDelete={noop}
      {...over}
    />
  );
}

it("renders nothing while not visible", () => {
  render(sheet({ visible: false }));
  expect(screen.queryByText("Existing debt: Nina")).toBeNull();
});

it("asks for direction, currency, amount and date — and no account, no category", () => {
  render(sheet());
  expect(screen.getByText("Existing debt: Nina")).toBeDefined();
  expect(screen.getByText("Who owes whom")).toBeDefined();
  expect(screen.getByText("They owe you")).toBeDefined();
  expect(screen.getByText("You owe them")).toBeDefined();
  expect(screen.getByLabelText("Amount")).toBeDefined();
  expect(screen.getByText("Date of the debt")).toBeDefined();
  expect(screen.queryByText("Category")).toBeNull();
  expect(screen.queryByText("Account")).toBeNull();
  expect(screen.queryByRole("button", { name: "Delete this debt" })).toBeNull();
});

it("refuses a Save before a figure is typed and hands nothing on", () => {
  const onSave = vi.fn();
  render(sheet({ onSave }));
  fireEvent.click(screen.getByRole("button", { name: "Save debt" }));
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByText("Required")).toBeDefined();
});

it("saves the direction, the figure, the first currency and today by default", () => {
  const onSave = vi.fn();
  render(sheet({ onSave }));
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
  render(sheet({ onSave }));
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

it("refuses a date later than today and says why", () => {
  const onSave = vi.fn();
  render(sheet({ onSave, initial: { amount: "10", date: "2026-09-10" } }));
  fireEvent.click(screen.getByRole("button", { name: "Save debt" }));
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByText("An existing debt dates from today or earlier.")).toBeDefined();
});

it("lets a day be picked, and saves it", () => {
  const onSave = vi.fn();
  render(sheet({ onSave, initial: { amount: "10" } }));
  pickDate("Date of the debt", "2026-08-15");
  fireEvent.click(screen.getByRole("button", { name: "Save debt" }));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ date: "2026-08-15" }));
});

const EXISTING = {
  id: "55555555-5555-4555-8555-555555555555",
  currency: "PLN",
  direction: "theyOwe" as const,
  amount: toMoney("200"),
  repaid: toMoney("150"),
};

it("prefills a debt being corrected, says saving replaces it, and shows what was repaid", () => {
  const onSave = vi.fn();
  render(
    sheet({
      onSave,
      existingDebts: [EXISTING],
      balances: [{ currency: "PLN", balance: toMoney("50") }],
      initial: { direction: "theyOwe", currency: "PLN", amount: "200.00", date: "2026-01-02" },
    }),
  );
  expect(screen.getByText("This replaces the existing debt in PLN.")).toBeDefined();
  expect(screen.getByText("Already repaid")).toBeDefined();
  expect(screen.getByText("150.00")).toBeDefined();
  // 50 left under a 200 figure, 200 again: the same balance, so no warning.
  expect(screen.queryByText(/saving turns the debt around/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Save debt" }));

  expect(onSave).toHaveBeenCalledWith({
    direction: "theyOwe",
    amount: "200.00",
    currency: "PLN",
    date: "2026-01-02",
  });
});

it("warns before a save turns the debt around: more repaid than the new figure", () => {
  render(
    sheet({
      existingDebts: [EXISTING],
      balances: [{ currency: "PLN", balance: toMoney("50") }],
      initial: { direction: "theyOwe", currency: "PLN", amount: "200.00", date: "2026-01-02" },
    }),
  );
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "100" } });

  // 50 − 200 + 100 = −50: they have now repaid 50 more than the debt.
  expect(screen.getByText("Balance after saving")).toBeDefined();
  expect(screen.getByText("you owe them")).toBeDefined();
  expect(
    screen.getByText(
      "More has already been repaid than this amount, so saving turns the debt around.",
    ),
  ).toBeDefined();
});

it("offers Delete for a currency that holds a debt, handing the debt's id on", () => {
  const onDelete = vi.fn();
  render(
    sheet({
      onDelete,
      existingDebts: [EXISTING],
      initial: { currency: "PLN", amount: "200.00" },
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Delete this debt" }));
  expect(onDelete).toHaveBeenCalledWith(EXISTING.id);
});

it("draws a refusal the write made on the amount field", () => {
  render(
    sheet({
      fieldErrors: { byField: { amount: ["PLN holds 2 decimal places."] }, formLevel: [] },
    }),
  );
  expect(screen.getByText("PLN holds 2 decimal places.")).toBeDefined();
});
