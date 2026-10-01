/**
 * `BusyScreen` — the whole app covered while the demo ledger is written, and
 * then while it restarts.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { BusyScreen } from "./busy-screen";

const meta = {
  title: "States/BusyScreen",
  component: BusyScreen,
  args: { visible: true, title: "Loading demo data" },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof BusyScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Before the loader has counted what it will write. */
export const Starting: Story = {};

export const Writing: Story = {
  args: { detail: "Writing history… 240 of 540" },
};

export const Restarting: Story = {
  args: { title: "Restarting…" },
};
