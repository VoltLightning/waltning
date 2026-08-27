/**
 * `Amount` — the component `design-system/04` requires every figure to render
 * through, so it is the first thing worth being able to look at.
 *
 * The stories below are chosen to be the cases that have been wrong before or
 * are silently wrong when they are: the negative that is not negative, the
 * currency whose scale is not two, and the column that only reads as a column
 * if the digits are tabular.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import { View } from "react-native";
import { space } from "../tokens.ts";
import { Amount } from "./amount";

const meta = {
  title: "FX/Amount",
  component: Amount,
  args: {
    value: money.toMoney("1234.56"),
    currency: "PLN",
    decimals: 2,
  },
} satisfies Meta<typeof Amount>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Body: Story = {};

/** §7.0's headline figure, at the size S04 renders it. */
export const Hero: Story = {
  args: { value: money.toMoney("48210.00"), size: "hero" },
};

export const Negative: Story = {
  args: { value: money.toMoney("-820.40") },
};

/**
 * **Negative zero is not an overdraft.**
 *
 * `amount.tsx` picks its ink with `money.cmp`, not `startsWith("-")`, and the
 * comment there says why: `-0.00000000` would otherwise render "a cleared
 * account in the ink of an overdraft". This story is that case, visible.
 */
export const NegativeZero: Story = {
  args: { value: money.toMoney("-0.00000000") },
};

/**
 * **A currency whose scale is not two.**
 *
 * `accounts.service.ts` carries `decimals` from the `currencies` join for
 * exactly this reason, noting that a screen hardcoding two "is correct for
 * every currency in this fixture and wrong for JPY, and the error looks like a
 * formatting quirk."
 */
export const ZeroDecimalCurrency: Story = {
  args: { value: money.toMoney("15400"), currency: "JPY", decimals: 0 },
};

export const SignedPositive: Story = {
  args: { value: money.toMoney("2400.00"), signed: true },
};

export const Muted: Story = {
  args: { emphasis: "muted" },
};

const COLUMN = ["9.99", "1234.56", "-820.40", "48210.00", "7.05"] as const;

/**
 * **The alignment check, which is the whole reason tabular numerals are
 * specified.** Proportional digits make a right-aligned column ragged, and a
 * ragged column of money reads as a rendering glitch rather than as the font
 * choice it is. Nothing about a single figure reveals this — it only appears
 * when several stack.
 */
export const Column: Story = {
  render: renderColumn,
};

function renderColumn() {
  return (
    <View style={{ alignItems: "flex-end", gap: space.x2 }}>
      {COLUMN.map((value) => (
        <Amount key={value} value={money.toMoney(value)} currency="PLN" decimals={2} />
      ))}
    </View>
  );
}
