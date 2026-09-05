/**
 * `<CommandBar>` — `screens/S05-quick-add.md` §3's "Web — ≥1024px". D1's
 * grammar resolves S05's own worked example ("48.90 cash coffee yesterday")
 * live, and a line it cannot resolve renders the reason and nothing else — no
 * fourth "interpret with model" story, because this arc never offers one.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import type { CaptureParse } from "@waltning/core/capture/grammar";
import { accountingDate } from "@waltning/core/date";
import { currencyCode, toMoney } from "@waltning/core/money";
import { CommandBar, type CommandBarProps } from "./command-bar";

function noop() {}

const ACCOUNTS: CommandBarProps["accounts"] = [
  { id: "acc-cash", name: "Cash", currency: currencyCode("PLN"), decimals: 2 },
];
const CATEGORIES: CommandBarProps["categories"] = [{ id: "cat-food", name: "Food" }];

const TODAY = "2026-09-03";

const meta = {
  title: "Transactions/CommandBar",
  component: CommandBar,
  args: {
    value: "",
    onChangeText: noop,
    accounts: ACCOUNTS,
    categories: CATEGORIES,
    today: TODAY,
    parse: null,
    onSubmit: noop,
    onDiscard: noop,
  },
} satisfies Meta<typeof CommandBar>;

export default meta;
type Story = StoryObj<typeof meta>;

const RESOLVED: CaptureParse = {
  ok: true,
  amount: toMoney("48.90"),
  accountId: "acc-cash",
  categoryId: null,
  date: accountingDate("2026-09-02"), // "yesterday" against `TODAY`.
  payee: "coffee",
  unmatched: [],
};

/** S05 §3's own worked example, fully resolved — amount, account, date and payee, ready for Enter. */
export const Resolved: Story = {
  args: { value: "48.90 cash coffee yesterday", parse: RESOLVED },
};

/** D2's proposal at the display threshold — the category chip fills machine, exactly as `QuickAddComposer`'s own P2 chip would. */
export const WithCategoryProposal: Story = {
  args: {
    value: "48.90 cash coffee yesterday",
    parse: RESOLVED,
    categoryProposal: { categoryId: "cat-food", confidence: 1, basis: "exact", neighbours: [] },
    categoryAutoFilled: true,
  },
};

/**
 * D1 resolved the amount but no account named or defaulted — the line stays
 * mid-typing, not a refusal: what did resolve renders, and the reason names
 * what to add next.
 */
export const Partial: Story = {
  args: {
    value: "48.90 taxi",
    parse: {
      ok: false,
      reason: "no_account",
      partial: { amount: toMoney("48.90") },
      unmatched: ["taxi"],
    },
  },
};

/**
 * `screens/S05-quick-add.md` §3: no amount, nothing else worth resolving —
 * D1's own refusal is the whole answer, no model call spent on it.
 */
export const Refused: Story = {
  args: {
    value: "coffee",
    parse: { ok: false, reason: "no_amount", partial: {}, unmatched: ["coffee"] },
  },
};

/** `create_transaction`'s own refusal (B1), already resolved to plain text and landed under the bar. */
export const FieldErrors: Story = {
  args: {
    value: "48.90 cash coffee yesterday",
    parse: RESOLVED,
    fieldErrors: {
      byField: {
        accountId: ["PLN needs an exchange rate before a transaction can be recorded in it."],
      },
      formLevel: [],
    },
  },
};
