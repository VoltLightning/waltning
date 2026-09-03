/**
 * `ErrorState` — the three variants `design-system/08` §8.2 names.
 *
 * Never a bare code: every story carries what failed, why, and — for
 * `partial` — exactly what it cost, stated as a count rather than implied.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { ErrorState } from "./error-state";

function noop() {}

const meta = {
  title: "States/ErrorState",
  component: ErrorState,
  args: {
    variant: "recoverable",
    what: "Couldn't reach the server",
    why: "The connection timed out.",
    action: { label: "Retry", onPress: noop },
  },
} satisfies Meta<typeof ErrorState>;

export default meta;
type Story = StoryObj<typeof meta>;

/** **`recoverable`.** Retry is likely to work, and the attempt is retained. */
export const Recoverable: Story = {};

/**
 * **`terminal`.** Retry will not help — the input stays on screen, and the
 * offer is to inspect or replace it rather than to try again.
 */
export const Terminal: Story = {
  args: {
    variant: "terminal",
    what: "Couldn't read this file",
    why: "The file is not a supported format.",
    action: { label: "Choose a different file", onPress: noop },
  },
};

/**
 * **`partial`.** Some of it worked, and both numbers are stated — the
 * successful count is what stops a half-imported month going unnoticed.
 */
export const Partial: Story = {
  args: {
    variant: "partial",
    what: "Some rows didn't import",
    why: "18 rows could not be read.",
    cost: "340 of 358 rows imported",
    action: { label: "Review the 18 rows", onPress: noop },
  },
};
