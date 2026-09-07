/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { RenameCategorySheet } from "./rename-category-sheet";

it("saves the edited name", () => {
  const onSave = vi.fn();
  render(
    <RenameCategorySheet visible categoryName="Groceries" onSave={onSave} onDismiss={vi.fn()} />,
  );

  const field = screen.getByLabelText("Name") as HTMLInputElement;
  expect(field.value).toBe("Groceries");
  fireEvent.change(field, { target: { value: "Groceries & household" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(onSave).toHaveBeenCalledWith("Groceries & household");
});

it("shows the sibling-collision refusal on the field", () => {
  render(
    <RenameCategorySheet
      visible
      categoryName="Eating out"
      error='"Groceries" already exists here'
      onSave={vi.fn()}
      onDismiss={vi.fn()}
    />,
  );

  expect(screen.getByText('"Groceries" already exists here')).toBeDefined();
});

it("re-seeds the field when a different category opens", () => {
  const { rerender } = render(
    <RenameCategorySheet visible categoryName="Groceries" onSave={vi.fn()} onDismiss={vi.fn()} />,
  );
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "edited" } });

  rerender(
    <RenameCategorySheet
      visible={false}
      categoryName="Groceries"
      onSave={vi.fn()}
      onDismiss={vi.fn()}
    />,
  );
  rerender(
    <RenameCategorySheet visible categoryName="Eating out" onSave={vi.fn()} onDismiss={vi.fn()} />,
  );

  expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Eating out");
});
