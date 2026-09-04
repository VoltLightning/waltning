/**
 * `PeriodHeader` — `design-system/05` §5.1 / §7.2. Rendered inside `Shell`,
 * the only place it lives — `shell.tsx`'s `children` slot is named for it.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import { DualTotal } from "./dual-total";
import { PeriodHeader } from "./period-header";
import { Shell } from "./shell";

function noop() {}

const meta = {
  title: "Shell/PeriodHeader",
  component: PeriodHeader,
  args: { label: "August 2026", onPrevious: noop, onNext: noop, onToday: noop, isCurrent: true },
  decorators: [
    (Story) => (
      <Shell
        hero={
          <DualTotal
            mine={money.toMoney("12480.20")}
            ours={money.toMoney("18940.60")}
            currency="PLN"
          />
        }
      >
        <Story />
      </Shell>
    ),
  ],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PeriodHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The current month — no *Today* action, because it would do nothing. */
export const Current: Story = {};

/** A past month — *Today* offers the one step back to the present. */
export const PastMonth: Story = {
  args: { label: "July 2026", isCurrent: false },
};
