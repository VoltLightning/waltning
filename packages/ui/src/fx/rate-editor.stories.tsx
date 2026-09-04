/**
 * `RateEditor` — `design-system/04` §4.7. States what it will overwrite
 * before writing; never silently replaces a manual entry.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { RateEditor } from "./rate-editor";

function noop() {}

const meta = {
  title: "FX/RateEditor",
  component: RateEditor,
  args: {
    base: "USD",
    quote: "RUB",
    from: "2022-03-12",
    to: "2026-08-07",
    rate: "0.0104",
    onRateChange: noop,
    existingRows: [],
    onSubmit: noop,
    onCancel: noop,
  },
} satisfies Meta<typeof RateEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

/** RUB's own case — a dead source, the whole range absent. */
export const AllAbsent: Story = {};

export const WithCarriedForward: Story = {
  args: {
    from: "2026-08-01",
    to: "2026-08-10",
    existingRows: Array.from({ length: 6 }, (_, i) => ({
      date: `2026-08-0${i + 1}`,
      source: "carried_forward",
    })),
  },
};

/** The gate: existing manual rows require a second, explicit press. */
export const WithManualOverlap: Story = {
  args: {
    from: "2026-08-01",
    to: "2026-08-05",
    existingRows: [
      { date: "2026-08-02", source: "manual" },
      { date: "2026-08-03", source: "manual" },
    ],
  },
};

export const EmptyRate: Story = { args: { rate: "" } };
