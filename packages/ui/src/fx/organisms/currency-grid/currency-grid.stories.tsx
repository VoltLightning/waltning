/**
 * `CurrencyGrid` — `design-system/04` §4.6. Choosing one currency where the
 * whole set is visible at once — `create-account-form.tsx`'s own currency
 * field.
 *
 * **No `Desk` story.** `playwright.config.ts` pins the visual suite's
 * browser to a single fixed viewport (900×600, below `breakpoint.desk`), and
 * a story's own `parameters.viewport` has no effect on the raw
 * `iframe.html` capture path `visual/stories.spec.ts` uses — so a four-column
 * story would screenshot identically to the three-column ones, a duplicate
 * baseline standing in for a state nothing here can actually render. The
 * responsive split is covered instead by `currency-grid.test.tsx`'s own
 * unit test — a real jsdom resize (`document.documentElement.clientWidth`
 * plus a dispatched `resize` event, the same way `use-breakpoint.test.tsx`
 * drives it), never a mock of `useBreakpoint` itself.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { currencyCode } from "@waltning/core/money";
import { fn } from "storybook/test";
import { CurrencyGrid, type CurrencyGridItem } from "./currency-grid";

/** Seven — PLN through CHF, the reference set every other story here subsets or extends. */
const SEVEN: readonly CurrencyGridItem[] = [
  { code: currencyCode("PLN"), name: "Polish Złoty", symbol: "zł" },
  { code: currencyCode("USD"), name: "US Dollar", symbol: "$" },
  { code: currencyCode("EUR"), name: "Euro", symbol: "€" },
  { code: currencyCode("GBP"), name: "British Pound", symbol: "£" },
  { code: currencyCode("BYN"), name: "Belarusian Ruble", symbol: "Br" },
  { code: currencyCode("GEL"), name: "Georgian Lari", symbol: "₾" },
  { code: currencyCode("CHF"), name: "Swiss Franc", symbol: "Fr." },
];

/** Twenty real ISO codes — enough to wrap the three-column grid to seven rows. */
const TWENTY: readonly CurrencyGridItem[] = [
  ...SEVEN,
  { code: currencyCode("JPY"), name: "Japanese Yen", symbol: "¥" },
  { code: currencyCode("CAD"), name: "Canadian Dollar", symbol: "$" },
  { code: currencyCode("AUD"), name: "Australian Dollar", symbol: "$" },
  { code: currencyCode("SEK"), name: "Swedish Krona", symbol: "kr" },
  { code: currencyCode("NOK"), name: "Norwegian Krone", symbol: "kr" },
  { code: currencyCode("DKK"), name: "Danish Krone", symbol: "kr" },
  { code: currencyCode("CZK"), name: "Czech Koruna", symbol: "Kč" },
  { code: currencyCode("HUF"), name: "Hungarian Forint", symbol: "Ft" },
  { code: currencyCode("RON"), name: "Romanian Leu", symbol: "lei" },
  { code: currencyCode("UAH"), name: "Ukrainian Hryvnia", symbol: "₴" },
  { code: currencyCode("TRY"), name: "Turkish Lira", symbol: "₺" },
  { code: currencyCode("CNY"), name: "Chinese Yuan", symbol: "¥" },
  { code: currencyCode("INR"), name: "Indian Rupee", symbol: "₹" },
];

const meta = {
  title: "FX/CurrencyGrid",
  component: CurrencyGrid,
  args: {
    currencies: SEVEN,
    selected: currencyCode("PLN"),
    onSelect: fn(),
    label: "Currency",
  },
} satisfies Meta<typeof CurrencyGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The reference set, PLN selected. */
export const Seven: Story = {};

export const Three: Story = {
  args: { currencies: SEVEN.slice(0, 3) },
};

/** Wraps the three-column grid to seven rows. */
export const Twenty: Story = {
  args: { currencies: TWENTY },
};

export const Disabled: Story = {
  args: { disabled: true },
};
