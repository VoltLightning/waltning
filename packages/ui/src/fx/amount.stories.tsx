/**
 * `Amount` — the component `design-system/04` requires every figure to render
 * through, so it is the first thing worth being able to look at.
 *
 * The stories below are chosen to be the cases that have been wrong before or
 * are silently wrong when they are: the negative that is not negative, the
 * currency whose scale is not two, the column that only reads as a column if
 * the digits are tabular — and the three kinds of movement, which must read as
 * three things and not as "green good, red bad".
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import { View } from "react-native";
import { makeStyles } from "../theme/styles.ts";
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

/** Sign-based: a negative figure is spend unless told otherwise. */
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

/** Income is a *brighter* green than the action green — an event, not a control. */
export const Income: Story = {
  args: { value: money.toMoney("4200.00"), kind: "income", signed: true },
};

/** Spend is a restrained red: unmistakable, not alarming. */
export const Spend: Story = {
  args: { value: money.toMoney("-184.20"), kind: "spend" },
};

/**
 * **A transfer is neither.** Its two legs are signed opposite ways; sign alone
 * would paint one green and one red — money moved between your own accounts,
 * read as a gain and a loss. Muted, with no sign, is the honest rendering.
 */
export const Transfer: Story = {
  args: { value: money.toMoney("2000.00"), kind: "transfer" },
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
  render: ColumnDemo,
};

function ColumnDemo() {
  const styles = useStyles();
  return (
    <View style={styles.column}>
      {COLUMN.map((value) => (
        <Amount key={value} value={money.toMoney(value)} currency="PLN" decimals={2} />
      ))}
    </View>
  );
}

const KINDS = [
  { value: "4200.00", kind: "income", label: "income" },
  { value: "-184.20", kind: "spend", label: "spend" },
  { value: "2000.00", kind: "transfer", label: "transfer" },
] as const;

/**
 * The three side by side — the only arrangement in which "reads as three
 * things" can actually be judged. Switch the toolbar to *Side by side* to see
 * that they hold in dark, where the greens and reds are lifted.
 */
export const ThreeKinds: Story = {
  render: ThreeKindsDemo,
};

function ThreeKindsDemo() {
  const styles = useStyles();
  return (
    <View style={styles.column}>
      {KINDS.map((k) => (
        <Amount
          key={k.label}
          value={money.toMoney(k.value)}
          currency="PLN"
          decimals={2}
          kind={k.kind}
          signed={k.kind === "income"}
        />
      ))}
    </View>
  );
}

/**
 * A story is a component, and gets its styles the same way one does. These
 * were inline objects while `today-frame.stories.tsx` two folders over already
 * used `makeStyles` — the same file kind, styled two ways.
 */
const useStyles = makeStyles(() => ({
  column: { alignItems: "flex-end", gap: space.x2 },
}));
