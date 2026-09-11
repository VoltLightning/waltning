/**
 * S04's Months page (§3) — the year, twelve rows.
 *
 * **Two bars, never one.** A month that took 8 000 and spent 8 000 nets to
 * nothing and was not a quiet month; a single net bar would draw it as one.
 * `FlowBar` on Summary makes the opposite choice for the opposite reason —
 * there the subject is what is left of one month, here it is how twelve
 * compare.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import type { MonthRow } from "./month-list";
import { MonthList } from "./month-list";

function noop() {}

const NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Figures that read like a year rather than like a test fixture. */
const FIGURES: readonly (readonly [string, string])[] = [
  ["7850.00", "5120.40"],
  ["7850.00", "4310.00"],
  ["8200.00", "8180.00"],
  ["7850.00", "3990.60"],
  ["7850.00", "6740.10"],
  ["9120.00", "5010.00"],
  ["7850.00", "7420.80"],
  ["7850.00", "4980.20"],
  ["7850.00", "4320.18"],
  ["0", "0"],
  ["0", "0"],
  ["0", "0"],
];

const ROWS: readonly MonthRow[] = NAMES.map((label, index) => {
  const [inflowRaw, spendRaw] = FIGURES[index] ?? ["0", "0"];
  const inflow = money.toMoney(inflowRaw ?? "0");
  const spend = money.toMoney(spendRaw ?? "0");
  return {
    month: `2026-${String(index + 1).padStart(2, "0")}`,
    label,
    inflow,
    spend,
    currency: "PLN",
    decimals: 2,
    net: money.sub(inflow, spend),
    note: index === 4 ? "+ 1 other currency" : null,
    matches: null,
    ahead: index > 8,
  };
});

const meta = {
  title: "Transactions/MonthList",
  component: MonthList,
  args: {
    rows: ROWS,
    current: "2026-09",
    labels: { inflow: "Came in", spend: "Went out" },
    onPickMonth: noop,
  },
} satisfies Meta<typeof MonthList>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A year part-way through. March took and spent almost the same and is not a
 * quiet month — which is what two bars say and one could not. May holds a
 * currency the figures leave out, and says so rather than dropping it.
 */
export const AYear: Story = {};

/**
 * **A year with nothing in it is twelve rows, not an empty state.** A list that
 * dropped its empty months would change length as the ledger fills.
 */
export const Nothing: Story = {
  args: {
    rows: ROWS.map((row) => ({
      ...row,
      inflow: money.ZERO,
      spend: money.ZERO,
      net: money.ZERO,
      note: null,
      matches: null,
    })),
  },
};

/**
 * **Searching (S04 §7).** Each month states how often it matched, in place of
 * its bars and figures — the bars are drawn against the busiest month of the
 * year, which under a search would still be scaled by money nobody asked about.
 * A month with nothing found says so rather than disappearing: *not in this
 * month* is part of *how often, and when*.
 */
export const Searching: Story = {
  args: {
    rows: ROWS.map((row, index) => ({
      ...row,
      matches:
        index === 2
          ? { label: "5 matches", found: true }
          : index === 4
            ? { label: "1 match", found: true }
            : { label: "0 matches", found: false },
    })),
  },
};
