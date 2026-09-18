/**
 * `Wheel` — §3.7a's drum, one column of it.
 *
 * The resting stories pin the face for the visual suite: the band, the fade by
 * distance, and the column on its own. **`Live` is not a screenshot** — it is
 * the one story whose value changes, so `visual/wheel.spec.ts` can roll it in
 * Chrome and check that a roll settles at all. jsdom cannot drive
 * `react-native-web`'s scrolling, and the web's own end-of-scroll events carry
 * no offset, so that behaviour has nowhere else to be measured.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { useState } from "react";
import { Wheel, type WheelOption } from "./wheel";

function noop() {}

const DAYS: WheelOption[] = Array.from({ length: 31 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));

const MONTHS: WheelOption[] = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
].map((label, i) => ({ value: String(i), label }));

const HOURS: WheelOption[] = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: String(i).padStart(2, "0"),
}));

const meta = {
  title: "Primitives/Wheel",
  component: Wheel,
  args: { label: "Day", options: DAYS, value: "18", onChange: noop, width: 56 },
} satisfies Meta<typeof Wheel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Day: Story = {};

export const Month: Story = {
  args: { label: "Month", options: MONTHS, value: "8", width: 148 },
};

/** A cycle — drawn three times, so there is a neighbour in both directions. */
export const Cycle: Story = {
  args: { label: "Hour", options: HOURS, value: "3", wraps: true, width: 72 },
};

/** The first option, where a scale has nothing above it and must not invent any. */
export const AtTheEnd: Story = { args: { value: "1" } };

function LiveWheel() {
  const [value, setValue] = useState("18");
  return <Wheel label="Day" options={DAYS} value={value} onChange={setValue} width={56} />;
}

/**
 * The only story that can answer "does a roll actually settle on the web".
 * `visual/wheel.spec.ts` rolls it with a real wheel; a screenshot of it would
 * be a picture of wherever it was last left, so it is out of the pixel set.
 */
export const Live: Story = { render: LiveWheel };
