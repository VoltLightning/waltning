/**
 * `CreateAccountForm` — name and currency, with everything `create_account`
 * takes behind *More details*. `defaultExpanded` is what lets a screenshot
 * suite photograph the disclosed state — the same reason `Select` carries
 * `defaultOpen`.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { currencyCode } from "@waltning/core/money";
import { userEvent, within } from "storybook/test";
import { CreateAccountForm } from "./create-account-form";

function noop() {}

const CURRENCIES = [
  { code: currencyCode("PLN"), name: "Polish Złoty", symbol: "zł" },
  { code: currencyCode("BYN"), name: "Belarusian Ruble", symbol: "Br" },
];

const GROUPS = [
  { id: "group-bank-a", name: "Bank A" },
  { id: "group-household", name: "Household" },
];

const meta = {
  title: "Accounts/CreateAccountForm",
  component: CreateAccountForm,
  args: {
    currencies: CURRENCIES,
    today: "2026-08-24",
    groups: GROUPS,
    onCancel: noop,
    onSave: noop,
  },
} satisfies Meta<typeof CreateAccountForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The default a person actually opens: name and currency, nothing else. */
export const Collapsed: Story = {};

/** Every field `create_account` takes, disclosed. */
export const Expanded: Story = { args: { defaultExpanded: true } };

/**
 * §14.6 — a currency the replica holds but cannot value a capture in. The
 * account still opens; the note says what that costs, and offers S18.
 */
export const CurrencyWithoutRate: Story = {
  args: {
    currencies: [
      { code: currencyCode("BYN"), name: "Belarusian Ruble", symbol: "Br", capturable: false },
      { code: currencyCode("PLN"), name: "Polish Złoty", symbol: "zł", capturable: true },
    ],
    onSetRate: noop,
  },
};

/**
 * §6.7: shared money is never business. Picking *Shared* forces the toggle
 * off and disabled rather than merely warning — the input refines this too,
 * so the form should not offer the contradiction in the first place.
 */
export const SharedAccount: Story = {
  args: { defaultExpanded: true },
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByText("Shared"));
  },
};

/**
 * The field-errors card's *Done when*, photographed: two errors from one
 * `fieldErrors` map on their own fields (`name`, `currency`), and a path the
 * form does not know about still reads, under the `common.couldNotSave` alert.
 */
export const WithErrors: Story = {
  args: {
    fieldErrors: {
      byField: {
        name: ["A name needs at least one visible character."],
        currency: ["This currency is no longer offered."],
      },
      formLevel: ["externalId: already used by another account"],
    },
  },
};
