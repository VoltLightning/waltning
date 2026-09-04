/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CategoryTree, type CategoryTreeNode } from "./category-tree";

const FOOD_GROUP: CategoryTreeNode = {
  id: "food",
  parentId: null,
  name: "Food",
  kind: "expense",
  isLeaf: false,
  archived: false,
  depth: 0,
  usageCount: 0,
};

const GROCERIES: CategoryTreeNode = {
  id: "groceries",
  parentId: "food",
  name: "Groceries",
  kind: "expense",
  isLeaf: true,
  archived: false,
  depth: 1,
  usageCount: 12,
};

const UNUSED_LEAF: CategoryTreeNode = {
  id: "eating-out",
  parentId: "food",
  name: "Eating out",
  kind: "expense",
  isLeaf: true,
  archived: false,
  depth: 1,
  usageCount: 0,
};

const ARCHIVED_LEAF: CategoryTreeNode = {
  id: "old-leaf",
  parentId: "food",
  name: "Old leaf",
  kind: "expense",
  isLeaf: true,
  archived: true,
  depth: 1,
  usageCount: 3,
};

it("renders a group without usage tags and a leaf with its usage count", () => {
  render(<CategoryTree nodes={[FOOD_GROUP, GROCERIES]} onOpenActions={vi.fn()} />);

  expect(screen.getByText("Food")).toBeDefined();
  expect(screen.getByText("Groceries")).toBeDefined();
  expect(screen.getByText("12 transactions")).toBeDefined();
});

it("tags an unused leaf and an archived one", () => {
  render(<CategoryTree nodes={[UNUSED_LEAF, ARCHIVED_LEAF]} onOpenActions={vi.fn()} />);

  expect(screen.getByText("Unused")).toBeDefined();
  expect(screen.getByText("Archived")).toBeDefined();
});

it("opens the actions sheet for the tapped category, naming it accessibly", () => {
  const onOpenActions = vi.fn();
  render(<CategoryTree nodes={[GROCERIES]} onOpenActions={onOpenActions} />);

  fireEvent.click(screen.getByRole("button", { name: "Groceries actions" }));
  expect(onOpenActions).toHaveBeenCalledWith("groceries");
});
