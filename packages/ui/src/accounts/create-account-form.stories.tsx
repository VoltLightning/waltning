/**
 * `CreateAccountForm` — name and currency, plus where a refusal lands.
 *
 * `WithErrors` is the card's *Done when*, photographed: two errors from one
 * `fieldErrors` map on their own fields, and a path the form does not know
 * about (`externalId`, the migration's idempotency key — never a field here)
 * still reads, under the `common.couldNotSave` alert.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { currencyCode } from "@waltning/core/money";
import { CreateAccountForm } from "./create-account-form";

function noop() {}

const CURRENCIES = [
  { code: currencyCode("PLN"), name: "Polish Złoty", symbol: "zł" },
  { code: currencyCode("BYN"), name: "Belarusian Ruble", symbol: "Br" },
];

const meta = {
  title: "Accounts/CreateAccountForm",
  component: CreateAccountForm,
  args: { currencies: CURRENCIES, onCancel: noop, onSave: noop },
} satisfies Meta<typeof CreateAccountForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoCurrencies: Story = { args: { currencies: [] } };

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
