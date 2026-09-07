import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import { fn } from "storybook/test";
import { UnsettledBanner } from "./unsettled-banner";

/**
 * All eight `shell.unsettled*` messages, one story each.
 *
 * The component's own doc says why there are eight and not one with holes:
 * each of the three axes — an opening balance with no payee, a remainder that
 * differs from the balance, a second unsettled account — changes the sentence
 * rather than a placeholder inside it. Eight sentences that nothing ever
 * rendered are eight sentences nobody has read, in either theme; the three
 * screens that compose this banner only ever produce whichever one their own
 * fixture happens to hit.
 *
 * The model shape is `packages/client`'s `unsettledBannerModel` output,
 * restated here structurally the same way the component restates it — and the
 * combinations are what that function can actually return, not every product
 * of three booleans: `isOpening` means there is no payee, so it never pairs
 * with `remainderDiffers`, which is a statement about a named leg.
 */
const BASE = {
  name: "Clearing · Bank A",
  currency: "PLN",
  decimals: 2,
  balance: money.toMoney("480.00"),
  remainder: money.toMoney("480.00"),
  payee: null,
  isOpening: false,
  remainderDiffers: false,
  more: 0,
};

const meta = {
  title: "Shell/UnsettledBanner",
  component: UnsettledBanner,
  args: { model: BASE, onOpen: fn() },
  parameters: { layout: "padded" },
} satisfies Meta<typeof UnsettledBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

/** `shell.unsettled` — no payee on the oldest leg, so the account names itself. */
export const Account: Story = {};

/** `shell.unsettledMore` — S04 §3's one banner, never a stack: the rest become a count. */
export const AccountAndMore: Story = {
  args: { model: { ...BASE, more: 2 } },
};

/** `shell.unsettledNamed` — the oldest open leg has a payee, and its remainder is the whole balance. */
export const Named: Story = {
  args: { model: { ...BASE, payee: "Grocer" } },
};

/** `shell.unsettledNamedMore`. */
export const NamedAndMore: Story = {
  args: { model: { ...BASE, payee: "Grocer", more: 3 } },
};

/**
 * `shell.unsettledNamedDiffers` — H3. With a second entry open, the oldest
 * one's remainder is less than the account balance, so both figures are
 * stated: naming the balance beside that payee would overstate what their leg
 * accounts for.
 */
export const NamedDiffers: Story = {
  args: {
    model: {
      ...BASE,
      payee: "Grocer",
      remainder: money.toMoney("120.00"),
      remainderDiffers: true,
    },
  },
};

/** `shell.unsettledNamedDiffersMore` — H3 and the count together, the longest of the eight. */
export const NamedDiffersAndMore: Story = {
  args: {
    model: {
      ...BASE,
      payee: "Grocer",
      remainder: money.toMoney("120.00"),
      remainderDiffers: true,
      more: 2,
    },
  },
};

/**
 * `shell.unsettledOpening` — H2. The oldest open entry is the account's own
 * opening balance, which has no payee to name and no transaction to open.
 */
export const Opening: Story = {
  args: { model: { ...BASE, isOpening: true } },
};

/** `shell.unsettledOpeningMore`. */
export const OpeningAndMore: Story = {
  args: { model: { ...BASE, isOpening: true, more: 4 } },
};

/**
 * S12 says *Allocate* where S04 and S01 say *Open* — the one word
 * `debt-screen.tsx` still passes for itself. Same route either way.
 */
export const AllocateLabel: Story = {
  args: { model: { ...BASE, payee: "Grocer" }, actionLabel: "Allocate" },
};
