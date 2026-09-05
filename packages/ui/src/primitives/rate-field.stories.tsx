/**
 * `<RateField>` — `design-system/03` §3.7: 4dp, read-only by default, the
 * synced value shown beside an override.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { pivotPerUnit, toMoney } from "@waltning/core/money";
import { RateField } from "./rate-field";

function noop() {}

const meta = {
  title: "Primitives/RateField",
  component: RateField,
  args: {
    label: "Realized",
    value: toMoney("4.2810"),
  },
} satisfies Meta<typeof RateField>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A derived figure, shown plainly — S14 and S31's own usage. */
export const Default: Story = {};

/** The synced value beside the override — §3.7's own requirement. */
export const WithReference: Story = {
  args: { reference: { rate: pivotPerUnit("4.3120"), source: "nbp", date: "2026-08-10" } },
};

/** A person's own assertion (P4) — never a comparison this component makes; the caller says so. */
export const Manual: Story = {
  args: {
    reference: { rate: pivotPerUnit("4.3120"), source: "nbp", date: "2026-08-10" },
    manual: true,
  },
};

/** `04` §4.8's `RateEditor` — the one caller that types a rate directly. */
export const Editable: Story = {
  args: { editable: true, value: "4.2810", onChange: noop },
};

export const WithError: Story = {
  args: { editable: true, value: "4.2810", onChange: noop, error: "Not a valid rate." },
};
