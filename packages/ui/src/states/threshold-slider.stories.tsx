/**
 * `ThresholdSlider` — `design-system/08` §8.6 row 3. 0.50–0.99; it cannot
 * reach 1.00.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { ThresholdSlider } from "./threshold-slider";

function noop() {}

const meta = {
  title: "States/ThresholdSlider",
  component: ThresholdSlider,
  args: { value: 0.8, onChange: noop },
} satisfies Meta<typeof ThresholdSlider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The floor. */
export const Floor: Story = { args: { value: 0.5 } };

/** The ceiling — the closest the control ever gets to certainty. */
export const Ceiling: Story = { args: { value: 0.99 } };

/** Mid-track, with the value badge riding above the thumb. */
export const Dragging: Story = { args: { value: 0.75 } };
