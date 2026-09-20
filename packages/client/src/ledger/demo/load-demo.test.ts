import { describe, expect, it, vi } from "vitest";
import type { CreateCategoryDraft } from "../create-phone-ledger/create-phone-ledger.ts";
import { DEMO_ACCOUNTS, DEMO_CATEGORIES, demoTransactions } from "./demo-plan.ts";
import { type DemoTarget, loadDemo } from "./load-demo.ts";

const TODAY = "2026-09-18";

function target(overrides: Partial<DemoTarget> = {}): DemoTarget {
  let next = 0;
  const id = () => {
    next += 1;
    return `id-${next}`;
  };
  return {
    createAccount: vi.fn(() => ({ id: id() })),
    createCategory: vi.fn(() => ({ id: id() })),
    createTransaction: vi.fn(() => ({ id: id() })),
    existingCategories: [],
    ...overrides,
  };
}

describe("the plan", () => {
  it("walks whole months back, and nothing past today", () => {
    const rows = demoTransactions(TODAY, 26);
    const dates = rows.map((r) => r.date).sort();
    expect(dates[0]?.slice(0, 7), "26 months back from September 2026").toBe("2024-08");
    expect(dates.at(-1)?.localeCompare(TODAY), "nothing in the future").toBeLessThanOrEqual(0);
  });

  it("leaves the current month partial", () => {
    const inThisMonth = demoTransactions(TODAY, 1).map((r) => Number(r.date.slice(8)));
    expect(Math.max(...inThisMonth), "no day after the 18th").toBeLessThanOrEqual(18);
  });

  /**
   * The amounts have to differ month to month or every chart is a flat line —
   * and they have to be *stable*, or the same demo describes a different
   * ledger every time it is loaded.
   */
  it("varies amounts between months and repeats them exactly", () => {
    const first = demoTransactions(TODAY, 26);
    const second = demoTransactions(TODAY, 26);
    expect(first).toEqual(second);

    const rents = first.filter((r) => r.payee === "Landlord").map((r) => r.amount);
    expect(new Set(rents).size, "rent is not the same figure every month").toBeGreaterThan(3);
  });

  it("skips a day the month does not have", () => {
    // The 29th and 30th are in the patterns; February 2025 has 28 days.
    const february = demoTransactions("2025-02-28", 1).map((r) => Number(r.date.slice(8)));
    expect(Math.max(...february)).toBeLessThanOrEqual(28);
  });
});

describe("loading it", () => {
  it("creates the accounts, the taxonomy and every transaction", () => {
    const t = target();
    const outcome = loadDemo(t, TODAY, 3);

    expect(outcome.accounts).toBe(DEMO_ACCOUNTS.length);
    expect(outcome.categories).toBe(DEMO_CATEGORIES.length);
    expect(outcome.transactions).toBe(demoTransactions(TODAY, 3).length);
    expect(outcome.refused, "a healthy run refuses nothing").toBe(0);
  });

  /**
   * A device that has synced already has the real taxonomy. Creating a second
   * `Groceries` beside it would be the fixture seeding a competing tree —
   * which is the thing `packages/db`'s fixture refuses to do for the same
   * reason.
   */
  it("reuses a category the device already has rather than creating a twin", () => {
    const t = target({ existingCategories: [{ id: "real-groceries", name: "Groceries" }] });
    loadDemo(t, TODAY, 1);

    const created = vi.mocked(t.createCategory).mock.calls.map(([draft]) => draft.name);
    expect(created, "Groceries is not created again").not.toContain("Groceries");

    const used = vi.mocked(t.createTransaction).mock.calls.map(([draft]) => draft.categoryId);
    expect(used, "and the device's own id is what the rows point at").toContain("real-groceries");
  });

  /** Nothing here deletes: clearing a ledger is `reset()`, behind its own confirmation. */
  it("is additive", () => {
    const t = target();
    loadDemo(t, TODAY, 1);
    expect(Object.keys(t)).not.toContain("reset");
  });

  it("counts refusals instead of stopping on one", () => {
    let calls = 0;
    const t = target({
      createTransaction: vi.fn(() => {
        calls += 1;
        return calls === 2
          ? { fieldErrors: [{ path: "amount", message: "no" }] }
          : { id: `t-${calls}` };
      }),
    });
    const outcome = loadDemo(t, TODAY, 1);

    expect(outcome.refused, "the one refusal is reported").toBe(1);
    expect(outcome.transactions, "and the rest still landed").toBe(calls - 1);
  });

  it("refuses a leaf whose group was refused rather than rooting it", () => {
    const t = target({
      createCategory: vi.fn((draft: CreateCategoryDraft) =>
        draft.parentId === null && draft.name === "Food"
          ? { fieldErrors: [{ path: "name", message: "no" }] }
          : { id: `c-${draft.name}` },
      ),
    });
    const outcome = loadDemo(t, TODAY, 1);

    const created = vi.mocked(t.createCategory).mock.calls.map(([draft]) => draft.name);
    expect(created, "Groceries is never created at the root").not.toContain("Groceries");
    expect(outcome.refused, "the group and both its leaves").toBeGreaterThanOrEqual(3);
  });
});
