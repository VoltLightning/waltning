/**
 * `<TransferComposer>` — S31 §6: same currency (collapsed), cross-currency
 * (the rate panel and margin), offline with nothing held, an optional fee,
 * and the same-account refusal shown inline.
 *
 * Fully controlled, `QuickAddComposer`'s own contract — every story is a set
 * of props.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { crossRate } from "@waltning/core/money";
import { GroundPanel } from "../shell/card";
import { TransferComposer } from "./transfer-composer";

function noop() {}

const USD_ACCOUNT = {
  id: "acc-usd",
  name: "Household · USD",
  currency: "USD",
  decimals: 2,
  capturable: true,
};
const PLN_ACCOUNT = {
  id: "acc-pln",
  name: "Cash · PLN",
  currency: "PLN",
  decimals: 2,
  capturable: true,
};
const SAVINGS_ACCOUNT = {
  id: "acc-pln-2",
  name: "Savings · PLN",
  currency: "PLN",
  decimals: 2,
  capturable: true,
};

const meta = {
  title: "Transactions/TransferComposer",
  component: TransferComposer,
  args: {
    accounts: [USD_ACCOUNT, PLN_ACCOUNT, SAVINGS_ACCOUNT],
    fromAccountId: "acc-usd",
    onOpenFromAccountPicker: noop,
    toAccountId: "acc-pln",
    onOpenToAccountPicker: noop,
    onSwap: noop,
    amountRaw: "150",
    toAmountRaw: "565,20",
    activeField: "amount",
    onActiveFieldChange: noop,
    referenceRate: {
      rate: crossRate("3.8100"),
      source: "nbp",
      date: "2026-08-12",
      carriedDays: 0,
      manual: false,
    },
    fee: "",
    onFeeChange: noop,
    date: "2026-08-12",
    onDateChange: noop,
    today: "2026-08-12",
    note: "",
    onNoteChange: noop,
    onCancel: noop,
  },
  // `transfer-screen.tsx` never renders `TransferComposer` flush to the
  // device edge — it wraps it in its own `space.x5` horizontal clearance,
  // the same clearance `GroundPanel` gives every other screen body
  // (`today-frame.tsx`). Flush here would be a baseline nobody actually sees.
  decorators: [
    (Story) => (
      <GroundPanel>
        <Story />
      </GroundPanel>
    ),
  ],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof TransferComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** S31 §9's worked example: 150 USD → 565.20 PLN, reference 3.8100 — the bank's own margin. */
export const CrossCurrency: Story = {};

/** One amount, no rate panel, no spread — §3's collapse. */
export const SameCurrency: Story = {
  args: {
    fromAccountId: "acc-pln",
    toAccountId: "acc-pln-2",
    amountRaw: "150",
    toAmountRaw: "150",
    referenceRate: undefined,
  },
};

/** Offline, nothing held — the destination stays empty and the person types it (S31 §6). */
export const NoRateOffline: Story = {
  args: { toAmountRaw: "", referenceRate: undefined },
};

/** The bank's stated fee — a separate figure from the margin (S31 §9.1). */
export const Fee: Story = {
  args: { fee: "5,00" },
};

/**
 * **The screen as it opens — nothing typed.** The rate panel is absent, not
 * zeroed: the realized rate is derived from two amounts (§3), so before both
 * exist there is no rate to state and `realized 0,0000` was the first thing
 * this screen said on open.
 */
export const Untouched: Story = {
  args: { amountRaw: "", toAmountRaw: "" },
};

/** Same account both sides, refused inline before Save (`transactions_transfer_distinct`). */
export const SameAccountRefused: Story = {
  args: { toAccountId: "acc-usd", toAmountRaw: "150", referenceRate: undefined },
};
