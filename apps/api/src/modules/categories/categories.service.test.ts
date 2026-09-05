/**
 * `get_category_tree`, server side — mirrors `@waltning/ledger`'s
 * `readCategoryTree` (`operations.md`, S06/S19's whole taxonomy).
 */

import { id } from "@waltning/core/id";
import { categories } from "@waltning/db/schema";
import { type Scratch, scratchDatabase } from "@waltning/db/test/scratch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listCategoryTree } from "./categories.service.ts";

let s: Scratch;

const FOOD = id<"categories">("11111111-1111-1111-1111-000000000001");
const GROCERIES = id<"categories">("11111111-1111-1111-1111-000000000002");
const ARCHIVED = id<"categories">("11111111-1111-1111-1111-000000000003");

beforeAll(async () => {
  s = await scratchDatabase("category-tree");
  await s.db.insert(categories).values([
    { id: FOOD, name: "Food", kind: "expense", isLeaf: false, sort: 0 },
    { id: GROCERIES, parentId: FOOD, name: "Groceries", kind: "expense", isLeaf: true, sort: 0 },
    { id: ARCHIVED, name: "Old", kind: "expense", isLeaf: true, archived: true, sort: 1 },
  ]);
}, 60_000);

afterAll(async () => {
  await s?.drop();
});

describe("listCategoryTree", () => {
  it("walks depth-first, a leaf one level under its group", async () => {
    const rows = await listCategoryTree(s.db, false);
    expect(rows.map((r) => [r.name, r.depth])).toEqual([
      ["Food", 0],
      ["Groceries", 1],
    ]);
  });

  it("excludes archived rows unless asked", async () => {
    const withoutArchived = await listCategoryTree(s.db, false);
    expect(withoutArchived.map((r) => r.name)).not.toContain("Old");

    const withArchived = await listCategoryTree(s.db, true);
    expect(withArchived.map((r) => r.name)).toContain("Old");
  });
});
