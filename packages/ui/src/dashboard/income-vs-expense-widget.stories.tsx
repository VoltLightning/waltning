import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import { IncomeVsExpenseWidget } from "./income-vs-expense-widget";

/**
 * **Bucket labels are the strings the screen actually passes.** They used to
 * read `2026-06`, while `dashboard-screen.tsx` hands this `monthLabel(...)` —
 * so the baselines never once showed the real text, and a long localised month
 * name had never been laid out here. `Grudzień 2026` is in `Localised` for
 * exactly that: it is the longest label this widget can be handed in either
 * language it ships.
 */
const meta = {
  title: "Dashboard/IncomeVsExpenseWidget",
  component: IncomeVsExpenseWidget,
  args: {
    title: "Income vs expense",
    currency: "PLN",
    period: "5 months + this month to date",
    scope: "Mine",
    incomeLabel: "Income",
    expenseLabel: "Expense",
    emptyLabel: "Nothing to show for this range",
    othersLabel: "Other currencies",
    others: [],
    bars: [
      {
        label: "June 2026",
        income: money.toMoney("6500"),
        expense: money.toMoney("4200"),
        currency: "PLN",
        decimals: 2,
      },
      {
        label: "July 2026",
        income: money.toMoney("6500"),
        expense: money.toMoney("5100"),
        currency: "PLN",
        decimals: 2,
      },
      {
        label: "August 2026",
        income: money.toMoney("6800"),
        expense: money.toMoney("3900"),
        currency: "PLN",
        decimals: 2,
      },
    ],
  },
} satisfies Meta<typeof IncomeVsExpenseWidget>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};

/**
 * H2 — the trailing range ends at the current month, which on the 2nd is a
 * two-day figure standing beside whole ones. The partial bucket takes the
 * assertion tone and says "to date", so the short bar reads as incomplete
 * rather than as a collapse.
 */
export const PartialCurrentMonth: Story = {
  args: {
    bars: [
      {
        label: "July 2026",
        income: money.toMoney("6500"),
        expense: money.toMoney("5100"),
        currency: "PLN",
        decimals: 2,
      },
      {
        label: "August 2026",
        income: money.toMoney("6800"),
        expense: money.toMoney("3900"),
        currency: "PLN",
        decimals: 2,
      },
      {
        label: "September 2026 · to date",
        income: money.toMoney("310"),
        expense: money.toMoney("520"),
        currency: "PLN",
        decimals: 2,
        partial: true,
      },
    ],
  },
};

/** H1 — one scale means one currency, so the rest are listed unconverted rather than dropped. */
export const WithOtherCurrencies: Story = {
  args: {
    others: [
      {
        currency: "EUR",
        decimals: 2,
        figures: [
          { value: money.toMoney("400.00"), kind: "income" },
          { value: money.toMoney("260.00"), kind: "spend" },
        ],
      },
      {
        currency: "CHF",
        decimals: 2,
        figures: [
          { value: money.toMoney("0.00"), kind: "income" },
          { value: money.toMoney("85.00"), kind: "spend" },
        ],
      },
    ],
  },
};

/** L6 — the longest label either shipped language can produce, laid out for once. */
export const Localised: Story = {
  args: {
    period: "5 miesięcy + bieżący do dziś",
    scope: "Moje",
    incomeLabel: "Przychody",
    expenseLabel: "Wydatki",
    bars: [
      {
        label: "listopad 2026",
        income: money.toMoney("6500"),
        expense: money.toMoney("5100"),
        currency: "PLN",
        decimals: 2,
      },
      {
        label: "grudzień 2026 · do dziś",
        income: money.toMoney("310"),
        expense: money.toMoney("520"),
        currency: "PLN",
        decimals: 2,
        partial: true,
      },
    ],
  },
};

export const Empty: Story = {
  args: { bars: [] },
};
