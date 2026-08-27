/**
 * `EmptyState` — the three variants `design-system/08` names, which
 * `09-state-matrix.md` then requires almost every screen to specify.
 *
 * The variants are not styling choices. They differ in **what the reader is
 * being told**: nothing exists yet, nothing matches what you asked for, or
 * nothing is in the range you are looking at — and the wrong one is a screen
 * that says "no transactions" to someone whose filter simply excluded them all.
 * Rendering the three together is the only way to check they read as different.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { EmptyState } from "./empty-state";

function noop() {}

const meta = {
  title: "States/EmptyState",
  component: EmptyState,
  args: {
    title: "No accounts yet",
    body: "Create one account to start your ledger.",
    primaryAction: { label: "Create account", onPress: noop },
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * **`first-run`.** Nothing exists because nothing has been made yet, so the
 * action is the point of the screen. S16's spec puts this variant *on the
 * accounts screen itself*, not only in the setup wizard.
 */
export const FirstRun: Story = {};

/**
 * **`filtered`.** Rows exist and the filter excluded them — so the body names
 * the excluding filter and the action clears it. `S10`'s card is explicit that
 * this variant "names the excluding filter"; an empty state that just said "no
 * transactions" here would be false.
 */
export const Filtered: Story = {
  args: {
    title: "No transactions match",
    body: "The Needs attention filter is excluding 214 rows.",
    primaryAction: { label: "Clear filter", onPress: noop },
    secondaryAction: { label: "Edit filters", onPress: noop },
  },
};

/**
 * **`range`.** The period is empty, not the ledger — so the useful offer is the
 * nearest period that is not, which is what the calendar and reports screens
 * specify.
 */
export const Range: Story = {
  args: {
    title: "Nothing in August",
    body: "The nearest period with activity is June 2026.",
    primaryAction: { label: "Go to June", onPress: noop },
    secondaryAction: { label: "Pick a period", onPress: noop },
  },
};
