/**
 * Nine years at a time, paged back to 1900 — the same sheet `PeriodPicker` uses
 * for months, at year granularity.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { YearPicker } from "./year-picker";

function noop() {}

const meta = {
  title: "Shell/YearPicker",
  component: YearPicker,
  args: {
    visible: true,
    page: {
      years: [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026],
      label: "2018 – 2026",
      hasOlder: true,
      hasNewer: false,
    },
    current: 2026,
    withEntries: new Set([2022, 2023, 2024, 2025, 2026]),
    onOlder: noop,
    onNewer: noop,
    onPick: noop,
    onDismiss: noop,
  },
} satisfies Meta<typeof YearPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The page you open on: this year and the eight before it. */
export const ThisPage: Story = {};

/**
 * **The floor.** The back arrow is spent and says so by going quiet rather than
 * disappearing — a control that vanishes leaves a reader wondering what they
 * did. The oldest page is the short one.
 */
export const AtTheFloor: Story = {
  args: {
    page: {
      years: [1900, 1901, 1902, 1903, 1904, 1905, 1906, 1907, 1908],
      label: "1900 – 1908",
      hasOlder: false,
      hasNewer: true,
    },
    current: 2026,
    withEntries: new Set<number>(),
  },
};
