/**
 * `MatchWarning` — `design-system/08` §8.4. The balance is what makes the
 * risk legible: merging two spellings of one person corrupts it.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import { MatchWarning } from "./match-warning";

function noop() {}

const meta = {
  title: "States/MatchWarning",
  component: MatchWarning,
  args: {
    candidate: {
      name: "Ania",
      balance: money.toMoney("240.00000000"),
      currency: "PLN",
      decimals: 2,
      transactionCount: 12,
    },
    onSame: noop,
    onDifferent: noop,
  },
} satisfies Meta<typeof MatchWarning>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A candidate the trigram matcher surfaced from a loose typed name. */
export const CloseSpelling: Story = {
  args: {
    candidate: {
      name: "Nina",
      balance: money.toMoney("-85.50000000"),
      currency: "PLN",
      decimals: 2,
      transactionCount: 4,
    },
  },
};
