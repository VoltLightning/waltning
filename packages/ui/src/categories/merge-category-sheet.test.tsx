/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MergeCategorySheet } from "./merge-category-sheet";

const CANDIDATES = [
  { id: "groceries", name: "Groceries" },
  { id: "takeout", name: "Takeout" },
];

it("shows the preview only once a winner is picked, then confirms through the dialog", () => {
  const onConfirm = vi.fn();
  render(
    <MergeCategorySheet
      visible
      loserName="Eating out"
      candidates={CANDIDATES}
      counts={{ transactions: 12, lines: 3, rules: 1 }}
      onConfirm={onConfirm}
      onDismiss={vi.fn()}
    />,
  );

  expect(screen.queryByText("Eating out → Groceries")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: /Merge into/ }));
  fireEvent.click(screen.getByRole("radio", { name: "Groceries" }));
  expect(screen.getByText("Eating out → Groceries")).toBeDefined();

  fireEvent.click(screen.getAllByRole("button", { name: "Merge" })[0] as HTMLElement);
  expect(screen.getByText("This can't be undone in one step")).toBeDefined();
  expect(onConfirm).not.toHaveBeenCalled();

  fireEvent.click(screen.getAllByRole("button", { name: "Merge" }).slice(-1)[0] as HTMLElement);
  expect(onConfirm).toHaveBeenCalledWith("groceries");
});

it("cancelling the confirm dialog does not merge", () => {
  const onConfirm = vi.fn();
  render(
    <MergeCategorySheet
      visible
      loserName="Eating out"
      candidates={CANDIDATES}
      counts={{ transactions: 12, lines: 3, rules: 1 }}
      onConfirm={onConfirm}
      onDismiss={vi.fn()}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /Merge into/ }));
  fireEvent.click(screen.getByRole("radio", { name: "Takeout" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Merge" })[0] as HTMLElement);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

  expect(screen.queryByText("This can't be undone in one step")).toBeNull();
  expect(onConfirm).not.toHaveBeenCalled();
});

it("pre-selects the winner the collision finder seeded", () => {
  render(
    <MergeCategorySheet
      visible
      loserName="Grocery"
      candidates={CANDIDATES}
      counts={{ transactions: 3, lines: 0, rules: 0 }}
      initialWinnerId="groceries"
      onConfirm={vi.fn()}
      onDismiss={vi.fn()}
    />,
  );

  expect(screen.getByText("Grocery → Groceries")).toBeDefined();
});

it("shows a refusal inline — merging onto a group, or across kinds", () => {
  render(
    <MergeCategorySheet
      visible
      loserName="Salary"
      candidates={CANDIDATES}
      counts={{ transactions: 0, lines: 0, rules: 0 }}
      error='"Groceries" is expense, "Salary" is income — refused across kinds'
      onConfirm={vi.fn()}
      onDismiss={vi.fn()}
    />,
  );

  expect(
    screen.getByText('"Groceries" is expense, "Salary" is income — refused across kinds'),
  ).toBeDefined();
});
