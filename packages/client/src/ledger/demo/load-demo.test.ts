import { accountingDate, addDays, daysBetween } from "@waltning/core/date";
import * as money from "@waltning/core/money";
import { describe, expect, it, vi } from "vitest";
import type { CreateCategoryDraft } from "../create-phone-ledger/create-phone-ledger.ts";
import {
  DEMO_ACCOUNTS,
  DEMO_CATEGORIES,
  DEMO_COUNTERPARTIES,
  DEMO_DEBTS,
  demoRates,
  demoTransactions,
} from "./demo-plan.ts";
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
    createCounterparty: vi.fn(() => ({ id: id() })),
    settleDebt: vi.fn(() => ({ id: id() })),
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
  it("walks whole months back, and nothing past today", async () => {
    const rows = demoTransactions(TODAY, 26);
    const dates = rows.map((r) => r.date).sort();
    expect(dates[0]?.slice(0, 7), "26 months back from September 2026").toBe("2024-08");
    expect(dates.at(-1)?.localeCompare(TODAY), "nothing in the future").toBeLessThanOrEqual(0);
  });

  it("leaves the current month partial", async () => {
    const inThisMonth = demoTransactions(TODAY, 1).map((r) => Number(r.date.slice(8)));
    expect(Math.max(...inThisMonth), "no day after the 18th").toBeLessThanOrEqual(18);
  });

  /**
   * The amounts have to differ month to month or every chart is a flat line —
   * and they have to be *stable*, or the same demo describes a different
   * ledger every time it is loaded.
   */
  it("varies amounts between months and repeats them exactly", async () => {
    const first = demoTransactions(TODAY, 26);
    const second = demoTransactions(TODAY, 26);
    expect(first).toEqual(second);

    const rents = first.filter((r) => r.enteredName === "Landlord").map((r) => r.amount);
    expect(new Set(rents).size, "rent is not the same figure every month").toBeGreaterThan(3);
  });

  it("skips a day the month does not have", async () => {
    // The 29th and 30th are in the patterns; February 2025 has 28 days.
    const february = demoTransactions("2025-02-28", 1).map((r) => Number(r.date.slice(8)));
    expect(Math.max(...february)).toBeLessThanOrEqual(28);
  });
});

describe("loading it", () => {
  it("creates the accounts, the taxonomy and every transaction", async () => {
    const t = target();
    const outcome = await loadDemo(t, TODAY, 3);

    expect(outcome.accounts).toBe(DEMO_ACCOUNTS.length);
    expect(outcome.categories).toBe(DEMO_CATEGORIES.length);
    // The patterns, plus one row per debt, the settlement that clears one,
    // and the transfer that funds the unallocated pot (J08 §3).
    expect(outcome.transactions).toBe(demoTransactions(TODAY, 3).length + DEMO_DEBTS.length + 2);
    expect(outcome.refused, "a healthy run refuses nothing").toBe(0);
  });

  /**
   * A device that has synced already has the real taxonomy. Creating a second
   * `Groceries` beside it would be the fixture seeding a competing tree —
   * which is the thing `packages/db`'s fixture refuses to do for the same
   * reason.
   */
  it("reuses a category the device already has rather than creating a twin", async () => {
    const t = target({ existingCategories: [{ id: "real-groceries", name: "Groceries" }] });
    await loadDemo(t, TODAY, 1);

    const created = vi.mocked(t.createCategory).mock.calls.map(([draft]) => draft.name);
    expect(created, "Groceries is not created again").not.toContain("Groceries");

    const used = vi.mocked(t.createTransaction).mock.calls.map(([draft]) => draft.categoryId);
    expect(used, "and the device's own id is what the rows point at").toContain("real-groceries");
  });

  /**
   * The taxonomy ships with the app now, so every device has it before this
   * loader ever runs — and what it holds is not only leaves.
   *
   * **Found on a device.** `existingCategories` was handed the capturable
   * *leaves*, so the loader could not see that *Food*, *Home*, *Transport*
   * and *Subscriptions* already existed as groups; it tried to create all
   * four, the ledger refused each, and the screen reported *4 refused* on an
   * otherwise healthy run.
   */
  it("reuses groups the device already has, not only leaves", async () => {
    const shipped = [...new Set(DEMO_CATEGORIES.map((c) => c.group).filter((g) => g !== null))].map(
      (name, index) => ({ id: `shipped-${index}`, name: name as string }),
    );
    const t = target({ existingCategories: shipped });
    const outcome = await loadDemo(t, TODAY, 1);

    const created = vi.mocked(t.createCategory).mock.calls.map(([draft]) => draft.name);
    for (const group of shipped) expect(created).not.toContain(group.name);
    expect(outcome.refused, "a group it can already see is not a refusal").toBe(0);
  });

  /** Nothing here deletes: clearing a ledger is `reset()`, behind its own confirmation. */
  it("is additive", async () => {
    const t = target();
    await loadDemo(t, TODAY, 1);
    expect(Object.keys(t)).not.toContain("reset");
  });

  it("counts refusals instead of stopping on one", async () => {
    let calls = 0;
    const t = target({
      createTransaction: vi.fn(() => {
        calls += 1;
        return calls === 2
          ? { fieldErrors: [{ path: "amount", message: "no" }] }
          : { id: `t-${calls}` };
      }),
    });
    const outcome = await loadDemo(t, TODAY, 1);

    expect(outcome.refused, "the one refusal is reported").toBe(1);
    expect(outcome.transactions, "and the rest still landed").toBe(
      calls - 1 + vi.mocked(t.settleDebt).mock.calls.length,
    );
  });

  it("refuses a leaf whose group was refused rather than rooting it", async () => {
    const t = target({
      createCategory: vi.fn((draft: CreateCategoryDraft) =>
        draft.parentId === null && draft.name === "Food"
          ? { fieldErrors: [{ path: "name", message: "no" }] }
          : { id: `c-${draft.name}` },
      ),
    });
    const outcome = await loadDemo(t, TODAY, 1);

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
  it("converts every group before hanging anything under it", async () => {
    const t = target();
    await loadDemo(t, TODAY, 1);

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

  it("counts a thrown refusal instead of letting it escape", async () => {
    const t = target({
      createTransaction: vi.fn(() => {
        throw new Error("create_transaction: the replica refused this row");
      }),
    });

    // The whole point: this must not throw.
    const outcome = await loadDemo(t, TODAY, 1);
    expect(outcome.transactions).toBe(0);
    expect(outcome.refused, "every row counted, none escaped").toBeGreaterThan(0);
  });

  it("does not hang children off a group whose conversion was refused", async () => {
    const t = target({
      convertCategory: vi.fn(() => {
        throw new Error("convert_leaf_group: refused");
      }),
    });
    await loadDemo(t, TODAY, 1);

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
  it("sets a rate for each of them, spanning every date the plan names", async () => {
    const t = target();
    await loadDemo(t, TODAY, 26);

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
  it("writes them before the first transaction", async () => {
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
    await loadDemo(t, TODAY, 1);

    expect(order.indexOf("transaction"), "a transaction was attempted").toBeGreaterThan(-1);
    expect(order.lastIndexOf("rate"), "every rate precedes it").toBeLessThan(
      order.indexOf("transaction"),
    );
  });
});

describe("rateWindows", () => {
  it("never asks for a range the operation refuses", async () => {
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

  it("covers the span exactly, with no gap and no overlap", async () => {
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

  it("is one window for a span that fits", async () => {
    expect(rateWindows("2026-01-01", "2026-03-01")).toEqual([
      { from: "2026-01-01", to: "2026-03-01" },
    ]);
  });

  it("is one window for a single day", async () => {
    expect(rateWindows("2026-01-01", "2026-01-01")).toEqual([
      { from: "2026-01-01", to: "2026-01-01" },
    ]);
  });
});

describe("demoRates", () => {
  it("quotes every other demo currency against whatever the pivot is", async () => {
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

  it("states how many of the quote one pivot buys, not the reciprocal", async () => {
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

  it("round-trips a figure through the rate it writes", async () => {
    // The check that would have caught the inversion without knowing which way
    // round the field is: value an amount and value it back.
    const rate = demoRates("USD").find((r) => r.quote === "PLN")?.rate;
    expect(rate).toBeDefined();
    if (rate === undefined) return;
    // 204.30 PLN, divided by "PLN per USD", is ~50.44 USD — not 827.
    const usd = money.toPivotByDivision(money.toMoney("204.30"), rate);
    expect(Number(usd)).toBeCloseTo(50.444, 2);
  });

  it("asks for nothing when the pivot is a currency the plan does not price", async () => {
    // Inventing a rate would be a ledger whose figures mean nothing.
    expect(demoRates("JPY")).toEqual([]);
  });
});

/**
 * S14 sorts people into three states and the demo had none of them: Debt drew
 * its empty state and S15 could not be reached at all, which is how the debt
 * half of the app went uncompared against its own drawing.
 */
describe("the people money moves between", () => {
  /**
   * **Before the history, so an interrupted load still has them.** They were
   * written last, after nine hundred rows; on a phone the load looked frozen,
   * was reloaded partway, and the Counterparties tab stayed empty.
   */
  it("creates the people before the first history row", async () => {
    const t = target();
    await loadDemo(t, TODAY, 1);
    const lastPerson = Math.max(...vi.mocked(t.createCounterparty).mock.invocationCallOrder);
    const historyRow = vi
      .mocked(t.createTransaction)
      .mock.calls.findIndex(
        ([draft]) => draft.obligationCounterpartyId === null && draft.type !== "transfer",
      );
    const firstHistoryCall =
      vi.mocked(t.createTransaction).mock.invocationCallOrder[historyRow] ?? 0;
    expect(lastPerson).toBeLessThan(firstHistoryCall);
  });

  /** The history in chunks, each one batch, with how far it has got after every one. */
  it("writes the history in batches and reports its progress", async () => {
    const t = target();
    const batch = vi.fn((write: () => void) => write());
    const progress = vi.fn();
    await loadDemo({ ...t, batch }, TODAY, 3, progress);
    expect(batch.mock.calls.length).toBeGreaterThan(1);
    const [written, of] = progress.mock.calls.at(-1) ?? [];
    expect(written).toBe(of);
    expect(progress.mock.calls.map(([w]) => w)).toEqual(
      [...progress.mock.calls.map(([w]) => w)].sort((x, y) => x - y),
    );
  });

  it("creates each one, and a debt row for each", async () => {
    const t = target();
    const outcome = await loadDemo(t, TODAY, 1);

    expect(outcome.counterparties).toBe(DEMO_COUNTERPARTIES.length);
    expect(outcome.refused).toBe(0);
    const withCounterparty = vi
      .mocked(t.createTransaction)
      .mock.calls.filter(([draft]) => draft.obligationCounterpartyId !== null);
    expect(withCounterparty).toHaveLength(DEMO_DEBTS.length);
    expect(withCounterparty.every(([draft]) => draft.obligationRole !== null)).toBe(true);
  });

  /**
   * §6.6.1 — **both** links on every obligation row. The two say different
   * things (who it was with; who owes because of it) and the demo used to set
   * only the second, which left the identity link with nothing behind it on
   * any screen that reads it.
   */
  it("names who the row was with, as well as who owes because of it", async () => {
    const t = target();
    await loadDemo(t, TODAY, 1);

    const obligations = vi
      .mocked(t.createTransaction)
      .mock.calls.filter(([draft]) => draft.obligationCounterpartyId !== null);
    expect(obligations).not.toHaveLength(0);
    expect(
      obligations.every(([draft]) => draft.counterpartyId === draft.obligationCounterpartyId),
    ).toBe(true);
  });

  /** One of the three is settled, which is a settlement written after its debt. */
  it("settles exactly one of them, in full and after the debt it clears", async () => {
    const t = target();
    await loadDemo(t, TODAY, 1);

    const settlements = vi.mocked(t.settleDebt).mock.calls;
    expect(settlements).toHaveLength(1);
    const settlement = settlements[0]?.[0];
    const debt = DEMO_DEBTS.find((row) => row.settle === true);
    expect(settlement?.dischargesAmount).toBe(debt?.amount);
    // `settle_debt` refuses an account holding another currency, and the
    // device's pivot is usually not the account's own.
    expect(settlement?.currency).toBe(
      DEMO_ACCOUNTS.find((account) => account.ref === debt?.account)?.currency,
    );
    expect(settlement?.currency).not.toBe("USD");
    expect(
      daysBetween(
        accountingDate(addDays(accountingDate(TODAY), -(debt?.daysAgo ?? 0))),
        accountingDate(settlement?.date ?? TODAY),
      ),
      "the settlement lands after the debt, never on the same day",
    ).toBeGreaterThan(0);
  });

  /** Both sides exist, so Debt has something in each of its segments. */
  it("leaves one who owes you and one you owe", async () => {
    const owing = DEMO_DEBTS.filter((row) => row.counterparty === "owing");
    const owed = DEMO_DEBTS.filter((row) => row.counterparty === "owed");
    expect(
      owing.every((row) => row.type === "expense"),
      "you paid on their behalf",
    ).toBe(true);
    expect(
      owed.every((row) => row.type === "income"),
      "they paid you",
    ).toBe(true);
  });
});
