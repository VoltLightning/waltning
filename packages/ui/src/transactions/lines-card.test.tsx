/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import * as money from "@waltning/core/money";
import { expect, it, vi } from "vitest";
import { LinesCard, type LinesCardLine } from "./lines-card";

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
    categoryId: "cat-household",
    categoryName: "Household",
  },
];

const TOTAL = money.toMoney("48.90");

it("shows every line as a chip, and the live sum checked against the total", () => {
  const onSave = vi.fn();
  render(<LinesCard lines={LINES} total={TOTAL} currency="PLN" onSave={onSave} />);

  expect(screen.getByRole("button", { name: /Groceries · 42.10/ })).toBeDefined();
  expect(screen.getByRole("button", { name: /Household supplies · 6.80/ })).toBeDefined();
  expect(screen.getByText("✓")).toBeDefined();
});

it("marks the sum unbalanced against a total the lines do not add up to", () => {
  const onSave = vi.fn();
  render(<LinesCard lines={LINES} total={money.toMoney("100")} currency="PLN" onSave={onSave} />);
  expect(screen.getByText("≠")).toBeDefined();
});

it("Save starts disabled — nothing has changed yet", () => {
  render(<LinesCard lines={LINES} total={TOTAL} currency="PLN" onSave={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
});

it("+ Add opens a fresh line, and Save sends the whole set with a new id", () => {
  const onSave = vi.fn();
  render(<LinesCard lines={LINES} total={TOTAL} currency="PLN" onSave={onSave} />);

  fireEvent.click(screen.getByRole("button", { name: "+ Add" }));
  fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Coffee" } });
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "3.50" } });

  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(onSave).toHaveBeenCalledTimes(1);
  const sent = onSave.mock.calls[0]?.[0] as readonly { description: string; amount: string }[];
  expect(sent).toHaveLength(3);
  expect(sent[2]).toMatchObject({ description: "Coffee", amount: "3.50" });
});

it("removing a line down to none is a legitimate save — no breakdown", () => {
  const onSave = vi.fn();
  render(
    <LinesCard
      lines={[LINES[0] as LinesCardLine]}
      total={money.toMoney("42.10")}
      currency="PLN"
      onSave={onSave}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /Groceries · 42.10/ }));
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(onSave).toHaveBeenCalledWith([]);
});

it("shows a form-level refusal from a sum mismatch the executor caught", () => {
  render(
    <LinesCard
      lines={LINES}
      total={TOTAL}
      currency="PLN"
      onSave={vi.fn()}
      fieldErrors={{ byField: {}, formLevel: ["lines sum to 10.00, the transaction is 48.90"] }}
    />,
  );
  expect(screen.getByRole("alert").textContent).toContain("lines sum to 10.00");
});
