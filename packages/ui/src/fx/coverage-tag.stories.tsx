/**
 * `CoverageTag` — `screens/S17` §6/§8. Amber below 100%, with the last
 * quote date it holds.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { CoverageTag } from "./coverage-tag";

const meta = {
  title: "FX/CoverageTag",
  component: CoverageTag,
  args: { pct: 100 },
} satisfies Meta<typeof CoverageTag>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Complete: Story = {};

/** RUB — ECB delisted it in 2022; the carry cap correctly refused to invent the rest. */
export const Partial: Story = { args: { pct: 23, lastDate: "2022-03-11" } };

/** GEL — 11 days of 2,080. Stated plainly, never nudged (S17 §9). */
export const NearlyEmpty: Story = { args: { pct: 1, lastDate: "2020-12-06" } };
