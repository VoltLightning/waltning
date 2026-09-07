/**
 * `ComparisonTable` — `design-system/05` §5.6. S19's merge preview: how many
 * rows move, and from where, stated before the write.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { ComparisonTable } from "./comparison-table";

const meta = {
  title: "Shell/ComparisonTable",
  component: ComparisonTable,
  args: {
    rows: [
      { label: "Transactions", value: "12" },
      { label: "Lines", value: "3" },
      { label: "Rules", value: "1" },
    ],
  },
} satisfies Meta<typeof ComparisonTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** §6.8 — an exclusion stated inline rather than silently dropped. */
export const WithNoteAndTone: Story = {
  args: {
    rows: [
      {
        label: "Spend, this period",
        value: "3 420 zł",
        tone: "negative",
        note: "up from 2 980 zł",
      },
      { label: "Income, this period", value: "5 100 zł", tone: "positive" },
      { label: "Capital moves", value: "excluded — 1 one-off", tone: "neutral" },
    ],
  },
};
