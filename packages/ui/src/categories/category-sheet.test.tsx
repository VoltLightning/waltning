/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CategorySheet, type CategoryTreeNode } from "./category-sheet";

const FOOD: CategoryTreeNode = {
  id: "food",
  parentId: null,
  name: "Food",
  kind: "expense",
  isLeaf: false,
};
const GROCERIES: CategoryTreeNode = {
  id: "groceries",
  parentId: "food",
  name: "Groceries",
  kind: "expense",
  isLeaf: true,
};
const EATING_OUT: CategoryTreeNode = {
  id: "eating-out",
  parentId: "food",
  name: "Eating out",
  kind: "expense",
  isLeaf: true,
};
const TRANSPORT: CategoryTreeNode = {
  id: "transport",
  parentId: null,
  name: "Transport",
  kind: "expense",
  isLeaf: false,
};
const FUEL: CategoryTreeNode = {
  id: "fuel",
  parentId: "transport",
  name: "Fuel",
  kind: "expense",
  isLeaf: true,
};
const UNCATEGORIZED: CategoryTreeNode = {
  id: "uncategorized",
  parentId: null,
  name: "Uncategorized",
  kind: "expense",
  isLeaf: true,
};
const SALARY: CategoryTreeNode = {
  id: "salary",
  parentId: null,
  name: "Salary",
  kind: "income",
  isLeaf: true,
};

const TREE = [FOOD, GROCERIES, EATING_OUT, TRANSPORT, FUEL, UNCATEGORIZED, SALARY];

it("shows every leaf across groups when browsing, and none of the other kind", () => {
  render(<CategorySheet visible kind="expense" tree={TREE} onPick={vi.fn()} onDismiss={vi.fn()} />);
  expect(screen.getByRole("radio", { name: "Groceries" })).toBeDefined();
  expect(screen.getByRole("radio", { name: "Eating out" })).toBeDefined();
  expect(screen.getByRole("radio", { name: "Fuel" })).toBeDefined();
  expect(screen.queryByText("Salary")).toBeNull();
});

/** S06 §9: search covers every leaf, ignoring whichever group is filtered. */
it("finds a leaf by search regardless of which group chip is selected", () => {
  render(<CategorySheet visible kind="expense" tree={TREE} onPick={vi.fn()} onDismiss={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Transport" }));
  expect(screen.queryByRole("radio", { name: "Groceries" })).toBeNull();

  fireEvent.change(screen.getByLabelText("Search…"), { target: { value: "groc" } });
  expect(screen.getByRole("radio", { name: "Groceries" })).toBeDefined();
  expect(screen.queryByRole("radio", { name: "Fuel" })).toBeNull();
  // Group chips fold away while searching — narrowing by group is moot once
  // the query already spans every leaf.
  expect(screen.queryByRole("button", { name: "Transport" })).toBeNull();
});

/** Group chips narrow; they never select (`TAXONOMY.md` R1) — tapping the chosen one again clears it. */
it("a group chip narrows to its own leaves and toggles off on a second tap", () => {
  render(<CategorySheet visible kind="expense" tree={TREE} onPick={vi.fn()} onDismiss={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Food" }));
  expect(screen.getByRole("radio", { name: "Groceries" })).toBeDefined();
  expect(screen.queryByRole("radio", { name: "Fuel" })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Food" }));
  expect(screen.getByRole("radio", { name: "Fuel" })).toBeDefined();
});

it("renders D2's proposal with a confidence tag, and the §14 marker below 0.85", () => {
  render(
    <CategorySheet
      visible
      kind="expense"
      tree={TREE}
      proposal={{ categoryId: "groceries", confidence: 0.6, basis: "neighbours", neighbours: [] }}
      onPick={vi.fn()}
      onDismiss={vi.fn()}
    />,
  );
  expect(screen.getByText("Suggested")).toBeDefined();
  expect(screen.getAllByText("Groceries").length).toBeGreaterThanOrEqual(2);
  expect(screen.getByText("60%")).toBeDefined();
  expect(screen.getByText("Low confidence — check before using.")).toBeDefined();
});

it("hides the low-confidence marker at or above 0.85", () => {
  render(
    <CategorySheet
      visible
      kind="expense"
      tree={TREE}
      proposal={{ categoryId: "groceries", confidence: 0.9, basis: "exact", neighbours: [] }}
      onPick={vi.fn()}
      onDismiss={vi.fn()}
    />,
  );
  expect(screen.queryByText("Low confidence — check before using.")).toBeNull();
});

/** §6: no search match offers *Create "…"* scoped to the chosen group — never at top level. */
it("offers no create action on a top-level search miss", () => {
  render(
    <CategorySheet
      visible
      kind="expense"
      tree={TREE}
      onCreate={vi.fn()}
      onPick={vi.fn()}
      onDismiss={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("Search…"), { target: { value: "zzz" } });
  expect(screen.getByText("Nothing matches.")).toBeDefined();
  expect(screen.queryByRole("button", { name: /Create/ })).toBeNull();
});

it("offers Create scoped to the chosen group on a search miss inside it", () => {
  const onCreate = vi.fn(() => ({ id: "new-id" }));
  const onPick = vi.fn();
  render(
    <CategorySheet
      visible
      kind="expense"
      tree={TREE}
      onCreate={onCreate}
      onPick={onPick}
      onDismiss={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Food" }));
  fireEvent.change(screen.getByLabelText("Search…"), { target: { value: "Snacks" } });
  fireEvent.click(screen.getByRole("button", { name: 'Create "Snacks"' }));

  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onCreate).toHaveBeenCalledWith({ name: "Snacks", kind: "expense", parentId: "food" });
  expect(onPick).toHaveBeenCalledWith("new-id");
});

/** `+ New`, group already narrowed — the row locks to it rather than re-asking (S06 §6). */
it("creates a leaf under the chip-narrowed group from the pinned + New button", () => {
  const onCreate = vi.fn(() => ({ id: "new-id" }));
  const onPick = vi.fn();
  render(
    <CategorySheet
      visible
      kind="expense"
      tree={TREE}
      onCreate={onCreate}
      onPick={onPick}
      onDismiss={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Transport" }));
  fireEvent.click(screen.getByRole("button", { name: "New" }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Parking" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(onCreate).toHaveBeenCalledWith({
    name: "Parking",
    kind: "expense",
    parentId: "transport",
  });
  expect(onPick).toHaveBeenCalledWith("new-id");
});

/** No group chosen — the row asks first, and Save stays refused until one is picked. */
it("asks for a group from + New with none chosen, and blocks Save until one is", () => {
  const onCreate = vi.fn(() => ({ id: "new-id" }));
  render(
    <CategorySheet
      visible
      kind="expense"
      tree={TREE}
      onCreate={onCreate}
      onPick={vi.fn()}
      onDismiss={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "New" }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Parking" } });
  expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-disabled")).toBe("true");

  // Two "Transport" chips exist while creating with no group chosen: the
  // sheet's own filter row, and the create row's group chooser beneath it —
  // the second is the one this step means to press.
  const transportChips = screen.getAllByRole("button", { name: "Transport" });
  fireEvent.click(transportChips[transportChips.length - 1] as HTMLElement);
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onCreate).toHaveBeenCalledWith({
    name: "Parking",
    kind: "expense",
    parentId: "transport",
  });
});

/** S06 §6: the refusal names the existing sibling, lands on the field, and does not pick. */
it("shows a name collision under the field and never calls onPick", () => {
  const onCreate = vi.fn(() => ({ error: '"Groceries" already exists here' }));
  const onPick = vi.fn();
  render(
    <CategorySheet
      visible
      kind="expense"
      tree={TREE}
      onCreate={onCreate}
      onPick={onPick}
      onDismiss={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Food" }));
  fireEvent.click(screen.getByRole("button", { name: "New" }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Groceries" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(screen.getByText('"Groceries" already exists here')).toBeDefined();
  expect(onPick).not.toHaveBeenCalled();
});

it("disables + New when the caller offers no onCreate", () => {
  render(<CategorySheet visible kind="expense" tree={TREE} onPick={vi.fn()} onDismiss={vi.fn()} />);
  expect(screen.getByRole("button", { name: "New" }).getAttribute("aria-disabled")).toBe("true");
});

/** S06 §4: creating in place is an ordinary part of the sheet, not an opt-in — enabled the moment a handler exists. */
it("enables + New the moment the caller offers onCreate, while just browsing", () => {
  render(
    <CategorySheet
      visible
      kind="expense"
      tree={TREE}
      onCreate={vi.fn()}
      onPick={vi.fn()}
      onDismiss={vi.fn()}
    />,
  );
  expect(screen.getByRole("button", { name: "New" }).getAttribute("aria-disabled")).toBeNull();
});

/** S06 §9.2: present, subordinate — last, muted, and still one tap away. */
it("renders Uncategorized at the bottom and picks it on a tap", () => {
  const onPick = vi.fn();
  render(<CategorySheet visible kind="expense" tree={TREE} onPick={onPick} onDismiss={vi.fn()} />);
  fireEvent.click(screen.getByRole("radio", { name: "Uncategorized" }));
  expect(onPick).toHaveBeenCalledWith("uncategorized");
});

/** `Uncategorized` sits outside the leaf grid — `Use` still has to name it. */
it("names Uncategorized in the Use button once it is picked", () => {
  render(<CategorySheet visible kind="expense" tree={TREE} onPick={vi.fn()} onDismiss={vi.fn()} />);
  fireEvent.click(screen.getByRole("radio", { name: "Uncategorized" }));
  expect(screen.getByRole("button", { name: 'Use "Uncategorized"' })).toBeDefined();
});

/** The placeholder already carries the label — a second, identical kicker line is noise. */
it("gives the search field no visible label, only an accessible one", () => {
  render(<CategorySheet visible kind="expense" tree={TREE} onPick={vi.fn()} onDismiss={vi.fn()} />);
  expect(screen.getByLabelText("Search…")).toBeDefined();
  expect(screen.queryByText("Search…")).toBeNull();
});

/** §7: one tap picks immediately; `Use ‹leaf›` is the double-check path. */
it("picks immediately on a tap, and Use re-fires the same pick", () => {
  const onPick = vi.fn();
  render(<CategorySheet visible kind="expense" tree={TREE} onPick={onPick} onDismiss={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Use" }).getAttribute("aria-disabled")).toBe("true");

  fireEvent.click(screen.getByRole("radio", { name: "Fuel" }));
  expect(onPick).toHaveBeenCalledTimes(1);
  expect(onPick).toHaveBeenLastCalledWith("fuel");

  fireEvent.click(screen.getByRole("button", { name: 'Use "Fuel"' }));
  expect(onPick).toHaveBeenCalledTimes(2);
  expect(onPick).toHaveBeenLastCalledWith("fuel");
});

it("dismisses from the sheet's own close control", () => {
  const onDismiss = vi.fn();
  render(
    <CategorySheet visible kind="expense" tree={TREE} onPick={vi.fn()} onDismiss={onDismiss} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(onDismiss).toHaveBeenCalledTimes(1);
});

/**
 * §6's other empty — a tree with nothing in it, which is what a fresh ledger
 * is. *Search 0 categories* counts something nobody has, and *Nothing
 * matches* blames a query for an absence that predates it; both read as a
 * broken sheet rather than an empty one.
 */
it("names an empty tree as empty, never as a filter that matched nothing (S06 §6)", () => {
  render(
    <CategorySheet
      visible
      kind="expense"
      tree={[]}
      onPick={vi.fn()}
      onCreate={vi.fn()}
      onDismiss={vi.fn()}
    />,
  );
  expect(screen.getByText("No categories yet")).toBeDefined();
  expect(screen.queryByText("Nothing matches.")).toBeNull();
  expect(screen.getByPlaceholderText("Search categories")).toBeDefined();
  expect(screen.queryByPlaceholderText("Search 0 categories")).toBeNull();
  expect(screen.getByRole("button", { name: "Create a category" })).toBeDefined();
});

/**
 * **A groupless tree is not a dead end.** `create_category`'s `parentId` is
 * nullable and R1 says nothing about parents — the seeded taxonomy holds a
 * top-level leaf itself — so the first category of an empty ledger is
 * created at the top level, the same write S19's own create sheet makes. The
 * row says where it will land instead of showing a chooser with nothing in
 * it.
 */
it("creates a top-level category when no group exists (S06 §6, R1)", () => {
  const onCreate = vi.fn(() => ({ id: "cat-new" }));
  render(
    <CategorySheet
      visible
      kind="expense"
      tree={[]}
      onPick={vi.fn()}
      onCreate={onCreate}
      onDismiss={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Create a category" }));
  expect(screen.getByText("No groups yet — this will be a top-level category.")).toBeDefined();
  expect(screen.queryByText("Choose a group")).toBeNull();

  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Coffee" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onCreate).toHaveBeenCalledWith({ name: "Coffee", kind: "expense", parentId: null });
});

/** With groups on the tree the capture sheet still asks which one (§6). */
it("still asks for a group when the tree has them", () => {
  const onCreate = vi.fn(() => ({ id: "cat-new" }));
  render(
    <CategorySheet
      visible
      kind="expense"
      tree={[FOOD, TRANSPORT]}
      onPick={vi.fn()}
      onCreate={onCreate}
      onDismiss={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Create a category" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Coffee" } });
  expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-disabled")).toBe("true");
});

/**
 * L12 — a query typed into an empty sheet is what the person wants the
 * category called. The filtered empty already prefills it; this one threw it
 * away and opened a blank name field.
 */
it("carries a typed query into the create row it offers", () => {
  render(
    <CategorySheet
      visible
      kind="expense"
      tree={[]}
      onPick={vi.fn()}
      onCreate={vi.fn()}
      onDismiss={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByPlaceholderText("Search categories"), {
    target: { value: "Coffee" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create a category" }));
  expect((screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement).value).toBe("Coffee");
});

/** With groups on the tree, the same empty state opens a create locked to one. */
it("offers create on an empty tree that has groups", () => {
  render(
    <CategorySheet
      visible
      kind="expense"
      tree={[FOOD, TRANSPORT]}
      onPick={vi.fn()}
      onCreate={vi.fn()}
      onDismiss={vi.fn()}
    />,
  );
  // The group chip first, so the create row opens locked to it — the
  // ordinary path, and the one that keeps this assertion about Save rather
  // than about which of two identically-named chips was tapped.
  fireEvent.click(screen.getByRole("button", { name: "Food" }));
  fireEvent.click(screen.getByRole("button", { name: "Create a category" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
    target: { value: "Groceries" },
  });
  expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-disabled")).not.toBe(
    "true",
  );
});

/**
 * L3 — the seeded shape of a fresh expense tree is `Uncategorized` and
 * nothing else, so a predicate that counted it as content handed exactly
 * that ledger the two strings this state exists to remove.
 */
it("treats a tree holding only Uncategorized as empty (S06 §9.2)", () => {
  render(
    <CategorySheet
      visible
      kind="expense"
      tree={[UNCATEGORIZED]}
      onPick={vi.fn()}
      onCreate={vi.fn()}
      onDismiss={vi.fn()}
    />,
  );
  expect(screen.getByText("No categories yet")).toBeDefined();
  expect(screen.queryByText("Nothing matches.")).toBeNull();
  expect(screen.queryByPlaceholderText("Search 0 categories")).toBeNull();
  // The row itself still stands — it is the honest blank, not a category.
  expect(screen.getByRole("radio", { name: /Uncategorized/ })).toBeDefined();
});
