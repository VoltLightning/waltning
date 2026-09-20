import { accountingDate, addDays, daysBetween } from "@waltning/core/date";
import * as money from "@waltning/core/money";
import { describe, expect, it, vi } from "vitest";
import type { CreateCategoryDraft } from "../create-phone-ledger/create-phone-ledger.ts";
import { DEMO_ACCOUNTS, DEMO_CATEGORIES, demoRates, demoTransactions } from "./demo-plan.ts";
import { type DemoTarget, loadDemo, rateWindows } from "./load-demo.ts";

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
    convertCategory: vi.fn(() => ({ id: id() })),
    setManualRate: vi.fn(() => ({ written: 1 })),
    existingCategories: [],
    // A device that has never synced, which bootstraps `currencies.ts`'s own
    // default rather than the plan's reference currency. That mismatch is the
    // whole reason the loader reads this rather than stating it.
    pivot: "USD",
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

/**
 * **The defect a device found and no test had.** `create_category` always
 * writes a leaf, so a group is a leaf that was converted — and hanging a child
 * off an unconverted one is refused by `TAXONOMY.md` R1. The executor refuses
 * it by *throwing*, which escaped the loader entirely and put a red box over
 * the app on the first press of Load demo data.
 */
describe("groups, and refusals that arrive by throwing", () => {
  it("converts every group before hanging anything under it", () => {
    const t = target();
    loadDemo(t, TODAY, 1);

    const created = vi.mocked(t.createCategory).mock.calls.map(([draft]) => draft);
    const converted = vi.mocked(t.convertCategory).mock.calls.map(([draft]) => draft.id);

    const roots = created.filter((draft) => draft.parentId === null);
    expect(roots.length, "the demo has groups").toBeGreaterThan(0);
    expect(converted.length, "and each one is converted").toBe(roots.length);

    // Every child names a parent that was converted, never a bare leaf.
    for (const child of created.filter((draft) => draft.parentId !== null)) {
      expect(converted, `parent of ${child.name}`).toContain(child.parentId);
    }
  });

  it("counts a thrown refusal instead of letting it escape", () => {
    const t = target({
      createTransaction: vi.fn(() => {
        throw new Error("create_transaction: the replica refused this row");
      }),
    });

    // The whole point: this must not throw.
    const outcome = loadDemo(t, TODAY, 1);
    expect(outcome.transactions).toBe(0);
    expect(outcome.refused, "every row counted, none escaped").toBeGreaterThan(0);
  });

  it("does not hang children off a group whose conversion was refused", () => {
    const t = target({
      convertCategory: vi.fn(() => {
        throw new Error("convert_leaf_group: refused");
      }),
    });
    loadDemo(t, TODAY, 1);

    const created = vi.mocked(t.createCategory).mock.calls.map(([draft]) => draft);
    expect(
      created.every((draft) => draft.parentId === null),
      "no child was attempted",
    ).toBe(true);
  });
});

/**
 * **What a device found that no test had.** A currency with no rate is not
 * `capturable`, and the controller declines a transaction in it *before* the
 * write — the honest refusal, since a row it cannot value would land in no
 * total. On a phone that has never synced there are no rates at all, so the
 * USD and EUR accounts took every row with them: 600-odd refusals and a ledger
 * holding nothing but the PLN ones.
 */
describe("currencies the ledger does not keep its books in", () => {
  it("sets a rate for each of them, spanning every date the plan names", () => {
    const t = target();
    loadDemo(t, TODAY, 26);

    const calls = vi.mocked(t.setManualRate).mock.calls.map(([draft]) => draft);
    expect(
      [...new Set(calls.map((draft) => draft.quote))].sort(),
      "every non-pivot currency",
    ).toEqual(["EUR", "PLN"]);

    const dates = demoTransactions(TODAY, 26)
      .map((row) => row.date)
      .sort();
    const oldest = dates[0] ?? "";
    const newest = dates.at(-1) ?? "";

    /*
      **Coverage, not one call.** `set_manual_rate` caps a range at 366 days
      (L11 — it writes one row per day), and the plan is 26 months, so the span
      arrives as several windows per currency. What has to hold is that the
      windows *together* leave no day unpriced: the earlier spelling of this
      test asserted one call each, which is a fact about the implementation and
      was the reason a refused rate looked like 532 unrelated transaction
      refusals rather than like a rate that was never written.
    */
    for (const quote of ["EUR", "PLN"]) {
      const windows = calls
        .filter((draft) => draft.quote === quote)
        .sort((a, b) => a.from.localeCompare(b.from));
      expect(windows.length, `${quote} has windows`).toBeGreaterThan(0);
      expect(windows[0]?.from.localeCompare(oldest), "covers the oldest row").toBeLessThanOrEqual(
        0,
      );
      expect(windows.at(-1)?.to.localeCompare(newest), "and the newest").toBeGreaterThanOrEqual(0);
      for (const draft of windows) {
        expect(draft.base, "quoted against the device's own pivot").toBe("USD");
        expect(
          daysBetween(accountingDate(draft.from), accountingDate(draft.to)) + 1,
          "within the range the operation accepts",
        ).toBeLessThanOrEqual(366);
      }
      for (let i = 1; i < windows.length; i += 1) {
        const previous = windows[i - 1];
        const current = windows[i];
        if (previous === undefined || current === undefined) continue;
        expect(current.from, "no day between two windows").toBe(
          addDays(accountingDate(previous.to), 1),
        );
      }
    }
  });

  /**
   * Order is the whole fix: a rate written *after* the rows it values arrives
   * too late, and every one of them has already been declined.
   */
  it("writes them before the first transaction", () => {
    const order: string[] = [];
    const t = target({
      setManualRate: vi.fn(() => {
        order.push("rate");
        return { written: 1 };
      }),
      createTransaction: vi.fn(() => {
        order.push("transaction");
        return { id: "t" };
      }),
    });
    loadDemo(t, TODAY, 1);

    expect(order.indexOf("transaction"), "a transaction was attempted").toBeGreaterThan(-1);
    expect(order.lastIndexOf("rate"), "every rate precedes it").toBeLessThan(
      order.indexOf("transaction"),
    );
  });
});

describe("rateWindows", () => {
  it("never asks for a range the operation refuses", () => {
    // L11 caps a manual rate range at 366 days because the operation writes
    // one row per day. The demo is 26 months, so one call for the whole span
    // was refused — and the refusal presented as **532 transactions refused
    // for `needsRate`**, one cause wearing five hundred unrelated symptoms.
    const windows = rateWindows("2024-07-01", "2026-09-20");
    expect(windows.length).toBeGreaterThan(1);
    for (const range of windows) {
      expect(
        daysBetween(accountingDate(range.from), accountingDate(range.to)) + 1,
      ).toBeLessThanOrEqual(366);
    }
  });

  it("covers the span exactly, with no gap and no overlap", () => {
    const windows = rateWindows("2024-07-01", "2026-09-20");
    expect(windows[0]?.from).toBe("2024-07-01");
    expect(windows.at(-1)?.to).toBe("2026-09-20");
    for (let i = 1; i < windows.length; i += 1) {
      const previous = windows[i - 1];
      const current = windows[i];
      if (previous === undefined || current === undefined) continue;
      // The day after the last one, which is what leaves no day unpriced.
      expect(current.from).toBe(addDays(accountingDate(previous.to), 1));
    }
  });

  it("is one window for a span that fits", () => {
    expect(rateWindows("2026-01-01", "2026-03-01")).toEqual([
      { from: "2026-01-01", to: "2026-03-01" },
    ]);
  });

  it("is one window for a single day", () => {
    expect(rateWindows("2026-01-01", "2026-01-01")).toEqual([
      { from: "2026-01-01", to: "2026-01-01" },
    ]);
  });
});

describe("demoRates", () => {
  it("quotes every other demo currency against whatever the pivot is", () => {
    // A phone that has never synced bootstraps `currencies.ts`'s default,
    // which is USD — the plan was written around PLN, and `set_manual_rate`
    // refuses any base that is not the pivot.
    expect(
      demoRates("USD")
        .map((r) => r.quote)
        .sort(),
    ).toEqual(["EUR", "PLN"]);
    expect(
      demoRates("PLN")
        .map((r) => r.quote)
        .sort(),
    ).toEqual(["EUR", "USD"]);
  });

  it("states how many of the quote one pivot buys, not the reciprocal", () => {
    // **`UnitsPerPivot` — the figure `fx_rates.rate` stores and the executor
    // divides by.** With the books in USD one pivot buys 4.05 PLN, so the
    // USD/PLN rate is 4.05. The first version returned 0.24691358 here, which
    // is just as plausible a USD/PLN figure, valued every foreign row 16.4x
    // out, and was pinned green by this very test.
    expect(demoRates("USD").find((r) => r.quote === "PLN")?.rate).toBe("4.050000000000");
    // One PLN buys 0.2469… USD, the same pair the other way up.
    expect(demoRates("PLN").find((r) => r.quote === "USD")?.rate).toBe("0.246913580247");
    // One USD buys 4.05/4.32 of a EUR.
    expect(demoRates("USD").find((r) => r.quote === "EUR")?.rate).toBe("0.937500000000");
  });

  it("round-trips a figure through the rate it writes", () => {
    // The check that would have caught the inversion without knowing which way
    // round the field is: value an amount and value it back.
    const rate = demoRates("USD").find((r) => r.quote === "PLN")?.rate;
    expect(rate).toBeDefined();
    if (rate === undefined) return;
    // 204.30 PLN, divided by "PLN per USD", is ~50.44 USD — not 827.
    const usd = money.toPivotByDivision(money.toMoney("204.30"), rate);
    expect(Number(usd)).toBeCloseTo(50.444, 2);
  });

  it("asks for nothing when the pivot is a currency the plan does not price", () => {
    // Inventing a rate would be a ledger whose figures mean nothing.
    expect(demoRates("JPY")).toEqual([]);
  });
});
