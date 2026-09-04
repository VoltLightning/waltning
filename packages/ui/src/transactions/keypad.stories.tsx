/**
 * `Keypad` — §5.1, §3.7: 0–9, comma, delete. Bottom-anchored, thumb-zone.
 *
 * `motionFrequency.constant` (§2.7): press feedback is the scale alone, no
 * further motion — the one control this system deliberately animates least.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { Keypad } from "./keypad";

function noop() {}

const meta = {
  title: "Transactions/Keypad",
  component: Keypad,
  args: { onKey: noop },
} satisfies Meta<typeof Keypad>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Disabled: Story = { args: { disabled: true } };
