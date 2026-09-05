/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MoveCategorySheet } from "./move-category-sheet";

const GROUPS = [
  { id: "food", name: "Food" },
  { id: "household", name: "Household" },
];

it("saves the chosen group", () => {
  const onSave = vi.fn();
  render(
    <MoveCategorySheet
      visible
      categoryName="Groceries"
      groups={GROUPS}
      onSave={onSave}
      onDismiss={vi.fn()}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /Group · Groceries/ }));
  fireEvent.click(screen.getByRole("radio", { name: "Household" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(onSave).toHaveBeenCalledWith("household");
});

it("disables Save until a group is chosen", () => {
  render(
    <MoveCategorySheet
      visible
      categoryName="Groceries"
      groups={GROUPS}
      onSave={vi.fn()}
      onDismiss={vi.fn()}
    />,
  );

  expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-disabled")).toBe("true");
});

it("shows a cross-kind or cycle refusal inline", () => {
  render(
    <MoveCategorySheet
      visible
      categoryName="Salary"
      groups={GROUPS}
      error="Food belongs to the expense side — a category cannot move across kinds"
      onSave={vi.fn()}
      onDismiss={vi.fn()}
    />,
  );

  expect(
    screen.getByText("Food belongs to the expense side — a category cannot move across kinds"),
  ).toBeDefined();
});
