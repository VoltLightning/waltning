/**
 * The year as twelve paired columns — the shape that answers *which months were
 * heavy* before a figure is read, and the control that moves between years.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import { Amount } from "../../../fx/atoms/amount/amount";
import { YearChart, type YearColumn } from "./year-chart";

const PLN = money.currencyCode("PLN");
// The English short names, three characters each — what `monthShort` gives the
// screen. Polish collides on a single initial, which is why this is not one.
const LABELS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const FIGURES: [number, number][] = [
  [7850, 5120],
  [7850, 4310],
  [8200, 8180],
  [7850, 3990],
  [7850, 4320],
  [9120, 5010],
  [7850, 7420],
  [7850, 4980],
  [7850, 4320],
  [0, 0],
  [0, 0],
  [0, 0],
];
const BUSIEST = 9120;

const COLUMNS: YearColumn[] = FIGURES.map(([inflow, spend], at) => ({
  month: `2026-${String(at + 1).padStart(2, "0")}`,
  label: LABELS[at] ?? "?",
  inflowShare: inflow / BUSIEST,
  spendShare: spend / BUSIEST,
  empty: inflow === 0 && spend === 0,
}));

function noop() {}

const meta = {
  title: "Transactions/YearChart",
  component: YearChart,
  args: {
    year: 2026,
    columns: COLUMNS,
    current: "2026-05",
    kept: (
      <Amount value={money.toMoney("24620.00")} currency={PLN} decimals={2} size="caption" signed />
    ),
    onOlder: noop,
    onNewer: noop,
    onPickYear: noop,
    labels: { older: "Previous year", newer: "Next year", pickYear: "Choose a year" },
  },
} satisfies Meta<typeof YearChart>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A year part-way through: nine months drawn, three still to come. */
export const PartWay: Story = {};

/**
 * **A year holding nothing is twelve stubs, not twelve full columns.** This is
 * the case the page was redesigned around — a month with no entries used to be
 * drawn exactly like a month with everything.
 */
export const Nothing: Story = {
  args: {
    columns: COLUMNS.map((column) => ({ ...column, inflowShare: 0, spendShare: 0, empty: true })),
    kept: <Amount value={money.ZERO} currency={PLN} decimals={2} size="caption" signed />,
  },
};

/**
 * **A month whose only rows are foreign is not an empty month.** It keeps its
 * slot at zero height in the money colours rather than drawing the absence
 * stub, because the row below it says *+1 other currency* about the same month
 * — and the figure that would fill the column is a conversion this app does
 * not do.
 */
export const OnlyForeign: Story = {
  args: {
    columns: COLUMNS.map((column, at) =>
      at === 2 ? { ...column, inflowShare: 0, spendShare: 0, empty: false } : column,
    ),
    keptNote: "+ 1 other currency",
  },
};

/**
 * **Both steps spent.** The floor at 1900 and this year at once: a caret that
 * cannot go anywhere goes quiet rather than disappearing, because a control
 * that vanishes leaves a reader wondering what they did. Nothing but a story
 * that withholds the handlers draws this state.
 */
export const NowhereToStep: Story = {
  render: (args) => (
    <YearChart
      year={args.year}
      columns={args.columns}
      current={args.current}
      kept={args.kept}
      onPickYear={args.onPickYear}
      labels={args.labels}
    />
  ),
};
