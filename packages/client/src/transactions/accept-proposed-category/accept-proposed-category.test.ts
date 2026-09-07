import { describe, expect, it } from "vitest";
import { acceptProposedCategory } from "./accept-proposed-category.ts";

const FOOD = { id: "cat-food", kind: "expense" as const };
const SALARY = { id: "cat-salary", kind: "income" as const };
const CATEGORIES = [FOOD, SALARY];

describe("acceptProposedCategory", () => {
  it("accepts a confident proposal that names an offered category of the right kind", () => {
    const proposal = {
      categoryId: "cat-food",
      confidence: 1,
      basis: "exact" as const,
      neighbours: [],
    };
    expect(acceptProposedCategory(proposal, CATEGORIES, "expense")).toBe(true);
  });

  it("refuses no proposal at all", () => {
    expect(acceptProposedCategory(undefined, CATEGORIES, "expense")).toBe(false);
  });

  it("refuses a proposal below the display threshold", () => {
    const proposal = {
      categoryId: "cat-food",
      confidence: 0.5,
      basis: "neighbours" as const,
      neighbours: [],
    };
    expect(acceptProposedCategory(proposal, CATEGORIES, "expense")).toBe(false);
  });

  it("H1a — refuses a proposal naming an id absent from the offered categories (archived, or since deleted)", () => {
    const proposal = {
      categoryId: "cat-gym-archived",
      confidence: 1,
      basis: "exact" as const,
      neighbours: [],
    };
    expect(acceptProposedCategory(proposal, CATEGORIES, "expense")).toBe(false);
  });

  it("H1b — refuses a proposal whose category is the wrong kind for the transaction", () => {
    const proposal = {
      categoryId: "cat-salary",
      confidence: 1,
      basis: "exact" as const,
      neighbours: [],
    };
    expect(acceptProposedCategory(proposal, CATEGORIES, "expense")).toBe(false);
    expect(acceptProposedCategory(proposal, CATEGORIES, "income")).toBe(true);
  });
});
