/**
 * `Skeleton` — `design-system/08` §8.5. Matches the shape it replaces, never
 * a grey box: the three stories are the three shapes a screen loads, side by
 * side, so a generic rectangle regresses visibly against them.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { Skeleton } from "./skeleton";

const meta = {
  title: "States/Skeleton",
  component: Skeleton,
  args: { shape: "row", label: "Recent transactions" },
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A row, standing in for a transaction line. */
export const Row: Story = {};

/** A headline figure — the shell's hero total while it loads. */
export const Hero: Story = { args: { shape: "hero", label: "Net worth" } };

/** A card or a chart. */
export const Block: Story = { args: { shape: "block", label: "Spend by category" } };
