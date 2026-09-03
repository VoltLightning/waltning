/**
 * `Toast` — `design-system/08` §8.4. Transient, 4 s, no action.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { Toast } from "./toast";

function noop() {}

const meta = {
  title: "States/Toast",
  component: Toast,
  args: { message: "Saved", onDismiss: noop },
} satisfies Meta<typeof Toast>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {};
