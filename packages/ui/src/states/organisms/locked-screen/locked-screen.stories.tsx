/**
 * `LockedScreen` — §5.7's launch gate, and the cover the app wears in the
 * switcher. Full-screen, because it stands where the ledger would.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { LockedScreen } from "./locked-screen";

function noop() {}

const meta = {
  title: "States/LockedScreen",
  component: LockedScreen,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof LockedScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Locked: Story = { args: { mode: "locked", onUnlock: noop, prompting: false } };

/** The device's own prompt is up; the button waits. */
export const Prompting: Story = { args: { mode: "locked", onUnlock: noop, prompting: true } };

/** After a cancelled prompt: the reason, and the button to try again. Nothing stale beneath. */
export const Cancelled: Story = {
  args: { mode: "locked", onUnlock: noop, prompting: false, failure: "cancelled" },
};

/** What the app switcher shows while the app is away. */
export const Cover: Story = { args: { mode: "cover" } };

/** First launch on a device that can gate: the question, before any prompt. */
export const Ask: Story = {
  args: { mode: "ask", method: "either", onYes: noop, onNotNow: noop },
};

/** A device with no biometric enrolled names its passcode instead. */
export const AskPasscode: Story = {
  args: { mode: "ask", method: "passcode", onYes: noop, onNotNow: noop },
};
