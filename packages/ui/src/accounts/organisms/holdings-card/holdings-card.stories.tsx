/**
 * S04's hero. Closed is the screen at rest; the two open stories are its two
 * lenses, and `Shared` is the one place the title is *Mine*.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import type { ReactNode } from "react";
import { View } from "react-native";
import type { Locale } from "../../../i18n/locales.ts";
import { I18nProvider } from "../../../i18n/provider";
import { makeStyles } from "../../../theme/styles.ts";
import { HoldingsCard, type HoldingsCardProps } from "./holdings-card";

function noop() {}

const BASE: HoldingsCardProps = {
  currency: "PLN",
  decimals: 2,
  mine: money.toMoney("49415.84"),
  ours: null,
  held: money.toMoney("50670.52"),
  overdrawn: money.toMoney("0"),
  owed: money.toMoney("1254.68"),
  counted: 9,
  of: 9,
  byKind: [
    { kind: "bank", count: 3, value: money.toMoney("24310.52") },
    { kind: "cash", count: 1, value: money.toMoney("1820.00") },
    { kind: "card", count: 2, value: money.toMoney("-1254.68") },
    { kind: "investment", count: 1, value: money.toMoney("9640.00") },
    { kind: "deposit", count: 2, value: money.toMoney("14900.00") },
  ],
  byCurrency: [
    {
      currency: "PLN",
      name: "Polish złoty",
      decimals: 2,
      count: 6,
      balance: money.toMoney("32197.60"),
      value: money.toMoney("32197.60"),
    },
    {
      currency: "USD",
      name: "US dollar",
      decimals: 2,
      count: 2,
      balance: money.toMoney("3120.00"),
      value: money.toMoney("12640.40"),
    },
    {
      currency: "EUR",
      name: "Euro",
      decimals: 2,
      count: 1,
      balance: money.toMoney("1050.00"),
      value: money.toMoney("4577.84"),
    },
  ],
  loans: [
    { kind: "loan_receivable", count: 1, value: money.toMoney("3000.00") },
    { kind: "loan_payable", count: 1, value: money.toMoney("-3795.00") },
  ],
  byAccount: [
    {
      id: "a1",
      name: "Bank A",
      kind: "bank",
      color: null,
      currency: "PLN",
      decimals: 2,
      balance: money.toMoney("18200.00"),
      value: money.toMoney("18200.00"),
    },
    {
      id: "a2",
      name: "Bank B",
      kind: "bank",
      color: "rust",
      currency: "PLN",
      decimals: 2,
      balance: money.toMoney("6110.52"),
      value: money.toMoney("6110.52"),
    },
    {
      id: "a3",
      name: "Wallet",
      kind: "cash",
      color: null,
      currency: "PLN",
      decimals: 2,
      balance: money.toMoney("1820.00"),
      value: money.toMoney("1820.00"),
    },
    {
      id: "a4",
      name: "Card A",
      kind: "card",
      color: null,
      currency: "PLN",
      decimals: 2,
      balance: money.toMoney("-1254.68"),
      value: money.toMoney("-1254.68"),
    },
    {
      id: "a5",
      name: "Brokerage",
      kind: "investment",
      color: null,
      currency: "USD",
      decimals: 2,
      balance: money.toMoney("2380.00"),
      value: money.toMoney("9640.00"),
    },
    {
      id: "a6",
      name: "Savings",
      kind: "deposit",
      color: "teal",
      currency: "PLN",
      decimals: 2,
      balance: money.toMoney("14900.00"),
      value: money.toMoney("14900.00"),
    },
  ],
  onOpenAccounts: noop,
  onOpenAccount: noop,
};

const meta = {
  title: "Accounts/HoldingsCard",
  component: HoldingsCard,
  args: BASE,
} satisfies Meta<typeof HoldingsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** At rest: the figure, what is held and owed, and the bar of what it is made of. */
export const Closed: Story = {};

/** Broken down by kind, loans under their own rule and not in the figure. */
export const ByKind: Story = { args: { initiallyOpen: true } };

/**
 * **A bank below zero is *overdrawn*, a card below zero is *owed*** — two
 * words for two things, where one used to read the overdraft as money owed to
 * someone.
 */
export const Overdrawn: Story = {
  args: {
    mine: money.toMoney("48611.64"),
    overdrawn: money.toMoney("504.20"),
    owed: money.toMoney("299.63"),
    held: money.toMoney("49415.47"),
  },
};

/** A shared account: the title becomes *Mine*, and *ours* sits under the figure. */
export const Shared: Story = { args: { ours: money.toMoney("61240.10") } };

/** One currency has no rate — the count says the total covers nine of ten. */
export const OneWithoutARate: Story = { args: { of: 10 } };

/**
 * **Each account in its own colour** — two banks, one of them given rust by
 * hand, and a deposit given teal. The third lens is where a colour picked in
 * the editor is read.
 */
export const ByAccount: Story = { args: { initiallyOpen: true, initialLens: "account" } };

function PhoneFrame({ locale, children }: { locale: Locale; children: ReactNode }) {
  const styles = useFrameStyles();
  return (
    <I18nProvider locale={locale}>
      <View style={styles.frame}>{children}</View>
    </I18nProvider>
  );
}

function withPhoneDe(Story: () => ReactNode) {
  return (
    <PhoneFrame locale="de">
      <Story />
    </PhoneFrame>
  );
}

function withPhoneEn(Story: () => ReactNode) {
  return (
    <PhoneFrame locale="en">
      <Story />
    </PhoneFrame>
  );
}

const useFrameStyles = makeStyles(() => ({
  // A phone's 360pt less the page's own gutters.
  frame: { width: 328 },
}));

/**
 * **The widest figure `numeric(20,8)` holds, in an overdraft.** The hero is one
 * line at any length: it gives up point size, never a digit, and its mark stays
 * beside it. The line under it breaks between *held* and *owed*, never inside a
 * figure.
 */
const MAX_FIGURE = {
  mine: money.toMoney("-999999999999.99"),
  held: money.toMoney("0"),
  owed: money.toMoney("999999999999.99"),
};

export const MaxFigureDe: Story = { args: MAX_FIGURE, decorators: [withPhoneDe] };
export const MaxFigureEn: Story = { args: MAX_FIGURE, decorators: [withPhoneEn] };
