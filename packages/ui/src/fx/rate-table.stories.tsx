/**
 * `RateTable` — `design-system/04` §4.6. Gaps render as explicit empty rows,
 * never as absence.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { RateTable } from "./rate-table";

function noop() {}

const meta = {
  title: "FX/RateTable",
  component: RateTable,
  args: {
    base: "USD",
    quote: "PLN",
    from: "2026-08-01",
    to: "2026-08-05",
    rows: [
      { date: "2026-08-01", rate: "3.7556", source: "nbp" },
      { date: "2026-08-02", rate: "3.7601", source: "nbp" },
      { date: "2026-08-04", rate: "3.9000", source: "manual" },
      { date: "2026-08-05", rate: "3.7601", source: "carried_forward", carriedDays: 3 },
    ],
    onSelectRow: noop,
  },
} satisfies Meta<typeof RateTable>;

export default meta;
type Story = StoryObj<typeof meta>;

/** `2026-08-03` is missing — an explicit empty row, not a skipped date. */
export const WithGap: Story = {};

export const AllSynced: Story = {
  args: {
    rows: [
      { date: "2026-08-01", rate: "3.7556", source: "nbp" },
      { date: "2026-08-02", rate: "3.7601", source: "nbp" },
      { date: "2026-08-03", rate: "3.7601", source: "nbp" },
      { date: "2026-08-04", rate: "3.7601", source: "nbp" },
      { date: "2026-08-05", rate: "3.7601", source: "nbp" },
    ],
  },
};

/** RUB's own state — a dead source, entirely gaps until a manual range covers it. */
export const AllGaps: Story = { args: { rows: [] } };
