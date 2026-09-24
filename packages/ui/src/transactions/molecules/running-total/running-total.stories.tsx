/**
 * `RunningTotal` — the ledger's figure over the whole filtered set (S10 §3):
 * the count, and one sum per currency, never summed across them.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { currencyCode, toMoney } from "@waltning/core/money";
import { RunningTotal } from "./running-total";

const PLN = currencyCode("PLN");
const EUR = currencyCode("EUR");
const USD = currencyCode("USD");

function sum(currency: typeof PLN, value: string, capital = "0", capitalCount = 0) {
  return {
    currency,
    decimals: 2,
    sum: toMoney(value),
    sumExcludingCapital: toMoney(capital === "0" ? value : capital),
    capitalCount,
  };
}

const meta = {
  title: "Transactions/RunningTotal",
  component: RunningTotal,
  args: { total: { count: 39, currencies: [sum(PLN, "-5024.47")] } },
} satisfies Meta<typeof RunningTotal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One currency. */
export const OneCurrency: Story = {};

/** Three currencies, three sums — never one figure across them. */
export const SeveralCurrencies: Story = {
  args: {
    total: {
      count: 39,
      currencies: [sum(PLN, "-5024.47"), sum(EUR, "-174.12"), sum(USD, "-45.00")],
    },
  },
};

/** The desk drain stopped at its cap: the header says how many are loaded and how many match. */
export const PartlyLoaded: Story = {
  args: { total: { count: 2400, currencies: [sum(PLN, "-81240.10")] }, shown: 1000 },
};

/** A one-off in range: the total without it is stated beside the total with it (S10 §9). */
export const WithOneOff: Story = {
  args: { total: { count: 12, currencies: [sum(PLN, "-18420.00", "-1420.00", 1)] } },
};
