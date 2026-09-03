import { id } from "@waltning/core/id";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ledgerSchema } from "../schema-map.ts";
import { type ScratchStores, scratchStores } from "../test/stores.ts";
import { readCategoryTree } from "./read-category-tree.ts";

const { categories } = ledgerSchema;

const FOOD = id<"categories">("11111111-1111-4111-8111-111111111111");
const GROCERIES = id<"categories">("22222222-2222-4222-8222-222222222222");
const EATING_OUT = id<"categories">("33333333-3333-4333-8333-333333333333");
const SALARY = id<"categories">("44444444-4444-4444-8444-444444444444");
const ARCHIVED = id<"categories">("55555555-5555-4555-8555-555555555555");

let stores: ScratchStores;

beforeEach(() => {
  stores = scratchStores();
  stores.ledger.replica.db
    .insert(categories)
    .values([
      { id: FOOD, name: "Food", kind: "expense", isLeaf: false, sort: 0 },
      { id: GROCERIES, name: "Groceries", kind: "expense", parentId: FOOD, sort: 0 },
      { id: EATING_OUT, name: "Eating out", kind: "expense", parentId: FOOD, sort: 1 },
      { id: SALARY, name: "Salary", kind: "income", isEarnings: true, sort: 1 },
      { id: ARCHIVED, name: "Old category", kind: "expense", archived: true, sort: 2 },
    ])
    .run();
});

afterEach(() => stores.close());

describe("readCategoryTree", () => {
  it("walks the tree depth-first, a parent immediately before its children", () => {
    const result = readCategoryTree(stores.ledger.replica.db);

    expect(result.map((category) => [category.name, category.depth])).toEqual([
      ["Food", 0],
      ["Groceries", 1],
      ["Eating out", 1],
      ["Salary", 0],
      ["Old category", 0],
    ]);
  });

  it("carries kind, isLeaf, isEarnings and archived through untouched", () => {
    const result = readCategoryTree(stores.ledger.replica.db);

    const food = result.find((category) => category.id === FOOD);
    expect(food).toMatchObject({ kind: "expense", isLeaf: false, parentId: null });

    const groceries = result.find((category) => category.id === GROCERIES);
    expect(groceries).toMatchObject({ kind: "expense", isLeaf: true, parentId: FOOD });

    const salary = result.find((category) => category.id === SALARY);
    expect(salary).toMatchObject({ kind: "income", isEarnings: true });

    const archived = result.find((category) => category.id === ARCHIVED);
    expect(archived).toMatchObject({ archived: true });
  });
});
