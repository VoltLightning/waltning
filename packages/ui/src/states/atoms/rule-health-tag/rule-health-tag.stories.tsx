/**
 * `RuleHealthTag` — `design-system/08` §8.6 row 13, all five states together
 * so a rule screen's list of tags is legible as five different claims.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { RuleHealthTag } from "./rule-health-tag";

const meta = {
  title: "States/RuleHealthTag",
  component: RuleHealthTag,
  args: { state: "healthy" },
} satisfies Meta<typeof RuleHealthTag>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Healthy: Story = {};
export const EndingSoon: Story = { args: { state: "endingSoon" } };
export const AmountDrifted: Story = { args: { state: "amountDrifted" } };
export const Overdue: Story = { args: { state: "overdue" } };
export const NeverPosted: Story = { args: { state: "neverPosted" } };
