/**
 * @vitest-environment jsdom
 *
 * **L-1.** The hatch is the only thing on this chart that says a bucket is
 * incomplete, and until now it existed only where a browser had measured the
 * bar: `onLayout` never fires in jsdom, so a headless render drew a partial
 * bucket that looked exactly like a finished one. The visual suite could see
 * the mark and no unit test could, which means the one channel carrying "this
 * figure is not comparable" had no cheap regression test at all.
 */

import { render, screen } from "@testing-library/react";
import * as money from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { IncomeVsExpenseWidget } from "./income-vs-expense-widget";

const FRAME = {
  title: "Income vs expense",
  currency: "PLN",
  period: "5 months + this month to date",
  scope: "Mine",
  incomeLabel: "Income",
  expenseLabel: "Expense",
  emptyLabel: "Nothing to show for this range",
  othersLabel: "Other currencies",
  others: [],
} as const;

const AUGUST = {
  label: "August 2026",
  income: money.toMoney("6800"),
  expense: money.toMoney("3900"),
  currency: "PLN",
  decimals: 2,
} as const;

const SEPTEMBER = { ...AUGUST, label: "September 2026", partial: true } as const;

describe("IncomeVsExpenseWidget", () => {
  it("marks a partial bucket before anything has been laid out", () => {
    render(<IncomeVsExpenseWidget {...FRAME} bars={[AUGUST, SEPTEMBER]} />);

    // Two — the partial bucket's income fill and its expense fill. The
    // complete bucket beside it carries none, which is what makes the mark
    // mean something.
    const hatches = screen.getAllByTestId("partial-hatch");
    expect(hatches).toHaveLength(2);
    for (const hatch of hatches) {
      expect(hatch.childElementCount, "at least one stripe, unmeasured").toBeGreaterThan(0);
    }
  });

  it("leaves a range of complete buckets unmarked", () => {
    render(<IncomeVsExpenseWidget {...FRAME} bars={[AUGUST, { ...AUGUST, label: "July 2026" }]} />);

    expect(screen.queryAllByTestId("partial-hatch")).toHaveLength(0);
  });
});
