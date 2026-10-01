import { describe, expect, it } from "vitest";
import { usedFirst } from "./used-first.ts";

const node = (id: string, parentId: string | null, isLeaf: boolean, usageCount = 0) => ({
  id,
  parentId,
  isLeaf,
  usageCount,
});

describe("usedFirst", () => {
  it("puts the used categories of a group before its unused ones, keeping order inside each half", () => {
    const tree = [
      node("food", null, false),
      node("groceries", "food", true, 0),
      node("eating-out", "food", true, 4),
      node("delivery", "food", true, 0),
      node("alcohol", "food", true, 1),
    ];
    expect(usedFirst(tree).map((n) => n.id)).toEqual([
      "food",
      "eating-out",
      "alcohol",
      "groceries",
      "delivery",
    ]);
  });

  it("keeps the groups in their own order and each group's children under it", () => {
    const tree = [
      node("home", null, false),
      node("rent", "home", true, 0),
      node("garden", "home", true, 2),
      node("food", null, false),
      node("groceries", "food", true, 0),
      node("transport", null, false),
      node("taxi", "transport", true, 9),
    ];
    expect(usedFirst(tree).map((n) => n.id)).toEqual([
      "home",
      "garden",
      "rent",
      "food",
      "groceries",
      "transport",
      "taxi",
    ]);
  });

  it("leaves a tree where everything or nothing is used exactly as it was", () => {
    const tree = [node("g", null, false), node("a", "g", true), node("b", "g", true)];
    expect(usedFirst(tree)).toEqual(tree);
  });

  it("does not reorder root leaves", () => {
    const tree = [node("x", null, true, 0), node("y", null, true, 5)];
    expect(usedFirst(tree).map((n) => n.id)).toEqual(["x", "y"]);
  });
});
