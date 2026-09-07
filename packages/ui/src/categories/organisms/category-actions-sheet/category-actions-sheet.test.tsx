/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CategoryActionsSheet } from "./category-actions-sheet";

it("renders nothing with no category chosen", () => {
  const { container } = render(
    <CategoryActionsSheet
      visible
      category={null}
      onRename={vi.fn()}
      onMove={vi.fn()}
      onConvert={vi.fn()}
      onMerge={vi.fn()}
      onArchive={vi.fn()}
      onDismiss={vi.fn()}
    />,
  );
  expect(container.firstChild).toBeNull();
});

it("offers Move and Merge for a leaf, and dispatches each action", () => {
  const onRename = vi.fn();
  const onMove = vi.fn();
  const onConvert = vi.fn();
  const onMerge = vi.fn();
  const onArchive = vi.fn();
  render(
    <CategoryActionsSheet
      visible
      category={{ id: "groceries", name: "Groceries", isLeaf: true }}
      onRename={onRename}
      onMove={onMove}
      onConvert={onConvert}
      onMerge={onMerge}
      onArchive={onArchive}
      onDismiss={vi.fn()}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Rename" }));
  fireEvent.click(screen.getByRole("button", { name: "Move" }));
  fireEvent.click(screen.getByRole("button", { name: "Convert to group" }));
  fireEvent.click(screen.getByRole("button", { name: "Merge" }));
  fireEvent.click(screen.getByRole("button", { name: "Archive" }));

  expect(onRename).toHaveBeenCalledTimes(1);
  expect(onMove).toHaveBeenCalledTimes(1);
  expect(onConvert).toHaveBeenCalledTimes(1);
  expect(onMerge).toHaveBeenCalledTimes(1);
  expect(onArchive).toHaveBeenCalledTimes(1);
});

/** `TAXONOMY.md` R1/R2 — a group has no Move or Merge; two levels only. */
it("hides Move and Merge for a group, and offers Convert to leaf", () => {
  render(
    <CategoryActionsSheet
      visible
      category={{ id: "food", name: "Food", isLeaf: false }}
      onRename={vi.fn()}
      onMove={vi.fn()}
      onConvert={vi.fn()}
      onMerge={vi.fn()}
      onArchive={vi.fn()}
      onDismiss={vi.fn()}
    />,
  );

  expect(screen.queryByRole("button", { name: "Move" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Merge" })).toBeNull();
  expect(screen.getByRole("button", { name: "Convert to leaf" })).toBeDefined();
});

it("shows a direct action's refusal inline", () => {
  render(
    <CategoryActionsSheet
      visible
      category={{ id: "food", name: "Food", isLeaf: false }}
      error='"Food" has 2 unarchived categories inside it'
      onRename={vi.fn()}
      onMove={vi.fn()}
      onConvert={vi.fn()}
      onMerge={vi.fn()}
      onArchive={vi.fn()}
      onDismiss={vi.fn()}
    />,
  );

  expect(screen.getByText('"Food" has 2 unarchived categories inside it')).toBeDefined();
});
