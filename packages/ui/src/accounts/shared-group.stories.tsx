/**
 * `SharedGroup` — S16 §3, §4: *"visually distinct but not diminished."*
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import { SharedGroup } from "./shared-group";

function noop() {}

const meta = {
  title: "Accounts/SharedGroup",
  component: SharedGroup,
  args: {
    accounts: [
      {
        id: "shared-1",
        name: "Household · USD",
        kind: "Deposit",
        balance: money.toMoney("1800"),
        currency: "USD",
      },
      {
        id: "shared-2",
        name: "Joint card · USD",
        kind: "Card",
        balance: money.toMoney("-120"),
        currency: "USD",
      },
    ],
    onSelectAccount: noop,
  },
} satisfies Meta<typeof SharedGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A negative shared balance is an ordinary fact — no warning treatment. */
export const Populated: Story = {};
