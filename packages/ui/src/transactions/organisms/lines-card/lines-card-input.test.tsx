/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as money from "@waltning/core/money";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n/provider";
import { LinesCard, type LinesCardLine } from "./lines-card";

afterEach(cleanup);

const LINES: readonly LinesCardLine[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    description: "Groceries",
    amount: money.toMoney("42.10"),
    categoryId: null,
    categoryName: null,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    description: "Household supplies",
    amount: money.toMoney("6.80"),
    categoryId: null,
    categoryName: null,
  },
];

/**
 * The field is the text a person typed, not a function of the figure it
 * parses to: digits appear as they are typed, backspace reaches empty, and
 * empty is "no amount yet" — not zero, not the previous figure.
 */
it("a new line's amount field shows what is typed, takes `,` and `.`, and clears to empty", () => {
  render(<LinesCard lines={[]} total={money.toMoney("12.50")} currency="PLN" onSave={vi.fn()} />);

  fireEvent.click(screen.getByRole("button", { name: "+ Add" }));
  const field = screen.getByLabelText("Amount") as HTMLInputElement;
  expect(field.value).toBe("");

  fireEvent.change(field, { target: { value: "5" } });
  expect(field.value).toBe("5");
  fireEvent.change(field, { target: { value: "5," } });
  expect(field.value).toBe("5,");
  fireEvent.change(field, { target: { value: "5,5" } });
  expect(field.value).toBe("5,5");
  expect(screen.getAllByText("5.50").length).toBeGreaterThan(0);

  fireEvent.change(field, { target: { value: "5" } });
  fireEvent.change(field, { target: { value: "" } });
  expect(field.value).toBe("");
  // No amount yet: not a stale 5, and not a typed zero either.
  expect(screen.queryByText("5.00")).toBeNull();
  expect(screen.getByText("≠")).toBeDefined();

  fireEvent.change(field, { target: { value: "12.5" } });
  expect(field.value).toBe("12.5");
  expect(screen.getByText("✓")).toBeDefined();
});

it("an existing line opens seeded in the currency's decimals, not its eight stored ones", () => {
  render(
    <LinesCard lines={LINES} total={money.toMoney("48.90")} currency="PLN" onSave={vi.fn()} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Groceries" }));
  expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toBe("42.10");
});

it("is seeded with the locale's decimal mark", () => {
  render(
    <I18nProvider locale="de">
      <LinesCard lines={LINES} total={money.toMoney("48.90")} currency="PLN" onSave={vi.fn()} />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Groceries" }));
  expect((screen.getByLabelText("Betrag") as HTMLInputElement).value).toBe("42,10");
});

it("Save sends the parsed decimal string, whichever separator was typed", () => {
  const onSave = vi.fn();
  render(<LinesCard lines={[]} total={money.toMoney("3.50")} currency="PLN" onSave={onSave} />);
  fireEvent.click(screen.getByRole("button", { name: "+ Add" }));
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "3,5" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onSave.mock.calls[0]?.[0]).toMatchObject([{ amount: "3.5" }]);
});

it("a line with no amount yet cannot be saved, even when the others already add up", () => {
  const onSave = vi.fn();
  render(<LinesCard lines={LINES} total={money.toMoney("48.90")} currency="PLN" onSave={onSave} />);
  fireEvent.click(screen.getByRole("button", { name: "+ Add" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onSave).not.toHaveBeenCalled();
});
