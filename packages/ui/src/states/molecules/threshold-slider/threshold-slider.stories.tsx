/**
 * `ThresholdSlider` — `design-system/08` §8.6 row 3. 0.50–0.99; it cannot
 * reach 1.00.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { useCallback, useState } from "react";
import { fn } from "storybook/test";
import { ThresholdSlider, type ThresholdSliderProps } from "./threshold-slider";

const meta = {
  title: "States/ThresholdSlider",
  component: ThresholdSlider,
  args: { value: 0.8, onChange: fn() },
} satisfies Meta<typeof ThresholdSlider>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * `ThresholdSlider` is controlled — `args.value` fixed and nothing to update
 * it left the thumb unable to move at all in Storybook. Every story renders
 * through this instead: the value lives in `useState`, seeded from the
 * story's own `args.value`, and a change updates both that state (so the
 * thumb, fill and badge actually follow the drag) and the story's own
 * `onChange` (so the actions panel logs it too).
 */
function StatefulThresholdSlider({ value, onChange }: ThresholdSliderProps) {
  const [current, setCurrent] = useState(value);
  const handleChange = useCallback(
    (next: number) => {
      setCurrent(next);
      onChange(next);
    },
    [onChange],
  );
  return <ThresholdSlider value={current} onChange={handleChange} />;
}

export const Default: Story = { render: StatefulThresholdSlider };

/** The floor. */
export const Floor: Story = { args: { value: 0.5 }, render: StatefulThresholdSlider };

/** The ceiling — the closest the control ever gets to certainty. */
export const Ceiling: Story = { args: { value: 0.99 }, render: StatefulThresholdSlider };

/** Mid-track, with the value badge riding above the thumb. */
export const Dragging: Story = { args: { value: 0.75 }, render: StatefulThresholdSlider };
