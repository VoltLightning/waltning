/**
 * The year as twelve paired columns — the shape that answers *which months were
 * heavy* before a figure is read, and the control that moves between years.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import { Amount } from "../../../fx/atoms/amount/amount";
import { YearChart, type YearColumn } from "./year-chart";

const PLN = money.currencyCode("PLN");
const INITIALS = "JFMAMJJASOND";
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
  initial: INITIALS[at] ?? "?",
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
 * At 1900 the back step is spent — drawn here by the year alone, since the
 * caller is what withholds the handler and a story cannot pass `undefined`
 * under `exactOptionalPropertyTypes`.
 */
export const AtTheFloor: Story = { args: { year: 1900 } };

export const AtThisYear: Story = {};
