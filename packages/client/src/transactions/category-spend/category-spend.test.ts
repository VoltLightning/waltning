import { currencyCode, toMoney } from "@waltning/core/money";
import { expect, it } from "vitest";
import { categorySpend } from "./category-spend.ts";

const EUR = currencyCode("EUR");
const PLN = currencyCode("PLN");
const TREE = [
  { id: "food", parentId: null, depth: 0, isLeaf: false },
  { id: "groceries", parentId: "food", depth: 1, isLeaf: true },
  { id: "eating-out", parentId: "food", depth: 1, isLeaf: true },
  { id: "rent", parentId: null, depth: 0, isLeaf: true },
];

function row(categoryId: string | null, amount: string, currency = EUR) {
  return { categoryId, amount: toMoney(amount), currency, decimals: 2 };
}

it("sums a group from its children and sizes each leaf against the largest", () => {
  const { spent, share } = categorySpend(
    [row("groceries", "-60"), row("eating-out", "-40"), row("rent", "-120")],
    TREE,
    EUR,
  );
  expect(spent.get("food")).toBe(toMoney("100"));
  expect(spent.get("rent")).toBe(toMoney("120"));
  expect(share.get("rent")).toBe(1);
  expect(share.get("groceries")).toBe(0.5);
  expect(share.has("food")).toBe(false);
});

/** One currency, never converted: another's spend is left out, not guessed. */
it("leaves out spend in any other currency", () => {
  const { spent } = categorySpend([row("groceries", "-60"), row("rent", "-500", PLN)], TREE, EUR);
  expect(spent.has("rent")).toBe(false);
  expect(spent.get("food")).toBe(toMoney("60"));
});
