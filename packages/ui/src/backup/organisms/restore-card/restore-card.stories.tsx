/**
 * `RestoreCard` — what is in the file, shown before the ledger is replaced.
 * The export's card holds a key you must keep; this one holds a decision you
 * have not made yet.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { RestoreCard } from "./restore-card";

const meta = {
  title: "Backup/RestoreCard",
  component: RestoreCard,
  args: {
    summary: {
      filename: "waltning-2026-09-14-t6wng2.age",
      takenAt: "14 September 2026",
      transactions: 1180,
      outboxEntries: 3,
      fingerprint: "t6wng2",
    },
  },
} satisfies Meta<typeof RestoreCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A backup with captures that were still unsent when it was taken. */
export const Found: Story = {};

/** Nothing was waiting: the row is absent rather than showing a zero. */
export const NothingUnsent: Story = {
  args: {
    summary: {
      filename: "waltning-2026-09-14-t6wng2.age",
      takenAt: "14 September 2026",
      transactions: 1180,
      outboxEntries: 0,
      fingerprint: "t6wng2",
    },
  },
};

/** A first backup, taken early. */
export const Small: Story = {
  args: {
    summary: {
      filename: "waltning-2026-09-16-q41ba8.age",
      takenAt: "16 September 2026",
      transactions: 4,
      outboxEntries: 0,
      fingerprint: "q41ba8",
    },
  },
};
