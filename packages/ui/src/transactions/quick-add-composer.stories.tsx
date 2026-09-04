/**
 * `QuickAddComposer` — S05 §3 mobile, above the `Dock`. The amount, and the
 * chip row that is "the whole model."
 *
 * Every state below is one `Dock` would show above its keypad; the play
 * functions drive the sheets a static screenshot cannot reach, the way
 * `quick-add-form.stories.tsx`'s own `Expanded` and `WithCounterparty` do.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { currencyCode } from "@waltning/core/money";
import { expect, userEvent, within } from "storybook/test";
import { QuickAddComposer } from "./quick-add-composer";

function noop() {}

const ACCOUNTS = [
  {
    id: "account-a",
    name: "Cash · PLN",
    currency: currencyCode("PLN"),
    decimals: 2,
    capturable: true,
    ownership: "own" as const,
  },
  {
    id: "account-shared",
    name: "Joint · PLN",
    currency: currencyCode("PLN"),
    decimals: 2,
    capturable: true,
    ownership: "shared" as const,
  },
];

const CATEGORIES = [
  { id: "cat-eating-out", name: "Eating out", kind: "expense" as const },
  { id: "cat-salary", name: "Salary", kind: "income" as const },
];

const TODAY = "2026-09-03";

const meta = {
  title: "Transactions/QuickAddComposer",
  component: QuickAddComposer,
  args: {
    raw: "",
    type: "expense",
    onTypeChange: noop,
    accounts: ACCOUNTS,
    accountId: null,
    accountMachineFilled: false,
    onAccountChange: noop,
    onCreateAccount: noop,
    categories: CATEGORIES,
    categoryId: null,
    onOpenCategoryPicker: noop,
    payee: "",
    onPayeeChange: noop,
    date: TODAY,
    onDateChange: noop,
    today: TODAY,
    isBusiness: false,
    onBusinessChange: noop,
    note: "",
    onNoteChange: noop,
    counterparties: [],
    counterpartyId: null,
    onCounterpartyChange: noop,
    counterpartyRole: null,
    onCounterpartyRoleChange: noop,
    onCancel: noop,
  },
} satisfies Meta<typeof QuickAddComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The resting state — every chip a placeholder, nothing machine-filled. */
export const Empty: Story = {};

/** Amount typed, no account yet — `Dock`'s own Save would still be disabled (S05 §9.2). */
export const AmountOnly: Story = { args: { raw: "48,90" } };

/** Amount and a chosen-by-hand account — the state that would enable Save. */
export const ReadyToSave: Story = {
  args: { raw: "48,90", accountId: "account-a" },
};

/** D2's proposal, confident — the category chip fills machine (P2) before anyone taps it. */
export const WithProposal: Story = {
  args: {
    raw: "48,90",
    accountId: "account-a",
    payee: "Corner shop",
    categoryProposal: {
      categoryId: "cat-eating-out",
      confidence: 0.92,
      basis: "exact",
      neighbours: [],
    },
  },
};

/** Below §14's 0.85 threshold — still shown, still machine-filled; the low-confidence marker lives in `CategorySheet`. */
export const LowConfidence: Story = {
  args: {
    raw: "48,90",
    accountId: "account-a",
    payee: "New café",
    categoryProposal: {
      categoryId: "cat-eating-out",
      confidence: 0.62,
      basis: "neighbours",
      neighbours: [{ payee: "Corner shop", similarity: 0.4 }],
    },
  },
};

/** §9.2's four-hour window, still open — the account chip fills machine, carrying the trail. */
export const LastUsedAccount: Story = {
  args: {
    raw: "48,90",
    accountId: "account-a",
    accountMachineFilled: true,
    accountMachineFilledAt: new Date("2026-09-03T14:20:00").getTime(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText("Cash · PLN"));
    await expect(canvas.findByText(/From your last capture/)).resolves.toBeDefined();
  },
};

/** §6.6 — a counterparty offered once the ledger holds one, its role picked in the same sheet. */
export const WithCounterparty: Story = {
  args: {
    raw: "48,90",
    accountId: "account-a",
    counterparties: [{ id: "cp-a", name: "Costa" }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "+ Person" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Counterparty" }));
    await userEvent.click(await canvas.findByRole("radio", { name: "Costa" }));
    await expect(canvas.findByRole("radiogroup", { name: "Role" })).resolves.toBeDefined();
  },
};

/** `create_transaction`'s own refusals, rendered under the chip they name. */
export const FieldErrors: Story = {
  args: {
    fieldErrors: {
      byField: {
        accountId: ["Choose an account before saving"],
        amountOriginal: ["Amount must be greater than zero"],
      },
      formLevel: [],
    },
  },
};
