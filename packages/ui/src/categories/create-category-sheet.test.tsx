/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CreateCategorySheet } from "./create-category-sheet";

const GROUPS = [
  { id: "food", name: "Food", kind: "expense" as const },
  { id: "work", name: "Work", kind: "income" as const },
];

it("saves a leaf under the group that was chosen", () => {
  const onSave = vi.fn();
  render(<CreateCategorySheet visible groups={GROUPS} onSave={onSave} onDismiss={vi.fn()} />);

  fireEvent.change(screen.getByLabelText("Name"), { target: { value: " Groceries " } });
  fireEvent.click(screen.getByRole("button", { name: "Group" }));
  fireEvent.click(screen.getByRole("radio", { name: "Food" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(onSave).toHaveBeenCalledWith({
    name: "Groceries",
    kind: "expense",
    parentId: "food",
  });
});

/** R1: an empty taxonomy has no group to create the first category under. */
it("saves a top-level category when no parent is chosen", () => {
  const onSave = vi.fn();
  render(<CreateCategorySheet visible groups={[]} onSave={onSave} onDismiss={vi.fn()} />);

  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Food" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(onSave).toHaveBeenCalledWith({ name: "Food", kind: "expense", parentId: null });
});

/**
 * A `Select` at rest shows the same placeholder holding three options or
 * none, so an empty taxonomy was handed a control that could not answer.
 */
it("drops the parent picker where there is nothing to pick, and says where it lands", () => {
  render(<CreateCategorySheet visible groups={[]} onSave={vi.fn()} onDismiss={vi.fn()} />);
  expect(screen.queryByRole("button", { name: "Group" })).toBeNull();
  expect(screen.getByText("No groups yet — this will be a top-level category.")).toBeDefined();
});

/** The other side of it: a kind whose own half of the taxonomy is empty. */
it("drops the picker when the chosen kind has no groups", () => {
  render(
    <CreateCategorySheet
      visible
      groups={[{ id: "food", name: "Food", kind: "expense" }]}
      onSave={vi.fn()}
      onDismiss={vi.fn()}
    />,
  );
  expect(screen.getByRole("button", { name: "Group" })).toBeDefined();
  fireEvent.click(screen.getByRole("radio", { name: "Income" }));
  expect(screen.queryByRole("button", { name: "Group" })).toBeNull();
  expect(screen.getByText("No groups yet — this will be a top-level category.")).toBeDefined();
});

/** A group of the other kind is not a legal parent — the pick does not survive the switch. */
it("offers only the chosen kind's groups, and drops a parent on the switch", () => {
  const onSave = vi.fn();
  render(<CreateCategorySheet visible groups={GROUPS} onSave={onSave} onDismiss={vi.fn()} />);

  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bonus" } });
  fireEvent.click(screen.getByRole("button", { name: "Group" }));
  fireEvent.click(screen.getByRole("radio", { name: "Food" }));
  fireEvent.click(screen.getByRole("radio", { name: "Income" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(onSave).toHaveBeenCalledWith({ name: "Bonus", kind: "income", parentId: null });
});

it("cannot save an empty name", () => {
  const onSave = vi.fn();
  render(<CreateCategorySheet visible groups={[]} onSave={onSave} onDismiss={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onSave).not.toHaveBeenCalled();
});

it("shows the refusal on the field it is about", () => {
  render(
    <CreateCategorySheet
      visible
      groups={GROUPS}
      error={'"Groceries" already exists here'}
      onSave={vi.fn()}
      onDismiss={vi.fn()}
    />,
  );
  expect(screen.getByText('"Groceries" already exists here')).toBeDefined();
});
