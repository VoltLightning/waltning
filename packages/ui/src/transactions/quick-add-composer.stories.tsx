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
import { useCallback, useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { type SafeAreaInsets, SafeAreaProvider } from "../primitives/safe-area";
import { QuickAddComposer, type QuickAddComposerProps } from "./quick-add-composer";

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
    onOpenAccountPicker: noop,
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

/**
 * H1, D2's proposal at or above `PROPOSAL_DISPLAY_THRESHOLD` — it **is** the
 * draft's category, not only a suggestion the sheet has to confirm: the chip
 * fills machine (P2), and the trail underneath names where it came from with
 * an Undo (S05 §8). `categoryId` and `categoryAutoFilled` are the screen's
 * own computed state, not something a person tapped — the same pairing
 * `quick-add-screen.tsx` derives from `composerCategoryId` and the proposal.
 */
export const WithProposal: Story = {
  args: {
    raw: "48,90",
    accountId: "account-a",
    payee: "Corner shop",
    categoryId: "cat-eating-out",
    categoryAutoFilled: true,
    onUndoCategory: noop,
    categoryProposal: {
      categoryId: "cat-eating-out",
      confidence: 0.92,
      basis: "exact",
      neighbours: [],
    },
  },
};

/**
 * Below §14's `PROPOSAL_DISPLAY_THRESHOLD` (0.85) — H1-a: never machine-filled,
 * because that would claim more confidence than the proposal itself carries.
 * The chip's own placeholder names the suggestion instead
 * (`transactions.categorySuggested`), in the placeholder's own ink, with
 * `categories.lowConfidence` underneath — no accent border, no Undo, nothing
 * an applied pick would show.
 */
export const LowConfidence: Story = {
  args: {
    raw: "48,90",
    accountId: "account-a",
    payee: "New café",
    categoryProposal: {
      categoryId: "cat-eating-out",
      confidence: 0.62,
      basis: "neighbours",
      neighbours: [{ payee: "Corner shop", similarity: 0.4, categoryId: "cat-eating-out" }],
    },
  },
};

/**
 * §9.2's four-hour window, still open — the account chip fills machine,
 * carrying the trail. The "from your last capture" line itself now lives in
 * `AccountPicker`'s own *Recent* tile (`accounts/account-picker.stories.tsx`
 * — `WithLastUsed`), the sheet this chip only ever asks the screen to open.
 */
export const LastUsedAccount: Story = {
  args: { raw: "48,90", accountId: "account-a", accountMachineFilled: true },
};

/**
 * §6.6 — a counterparty offered once the ledger holds one, its role picked in
 * the same sheet.
 *
 * `QuickAddComposer` is fully controlled — `counterpartyId`/`counterpartyRole`
 * only ever reflect props — so a story that wires `onCounterpartyChange` to a
 * no-op never re-renders with the pick and the role sheet's radiogroup is
 * unreachable. `render` holds both in local state instead, the way
 * `primitives/select.stories.tsx`'s `Live` does.
 */
export const WithCounterparty: Story = {
  args: {
    raw: "48,90",
    accountId: "account-a",
    counterparties: [{ id: "cp-a", name: "Corner Café" }],
  },
  render: (args) => <WithCounterpartyDemo {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "+ Person" }));
    // `BottomSheet` (`shell/bottom-sheet.tsx`) portals its content to a
    // sibling of `canvasElement` on the web — `account-picker.stories.tsx:161`'s
    // own reason — so the Select trigger and everything past it is queried
    // against the owner document, not the canvas.
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByRole("button", { name: "Counterparty" }));
    await userEvent.click(await body.findByRole("radio", { name: "Corner Café" }));
    await expect(body.findByRole("radiogroup", { name: "Role" })).resolves.toBeDefined();
  },
};

function WithCounterpartyDemo(args: QuickAddComposerProps) {
  const [counterpartyId, setCounterpartyId] = useState(args.counterpartyId);
  const [counterpartyRole, setCounterpartyRole] = useState(args.counterpartyRole);
  const handleCounterpartyChange = useCallback((next: string) => setCounterpartyId(next), []);
  const handleCounterpartyRoleChange = useCallback(
    (next: QuickAddComposerProps["counterpartyRole"]) => setCounterpartyRole(next),
    [],
  );
  return (
    <QuickAddComposer
      {...args}
      counterpartyId={counterpartyId}
      onCounterpartyChange={handleCounterpartyChange}
      counterpartyRole={counterpartyRole}
      onCounterpartyRoleChange={handleCounterpartyRoleChange}
    />
  );
}

/**
 * §14.6 — the account is held, and nothing can be captured in it because the
 * pivot holds no rate for its currency. The banner is the whole state of a
 * fresh install with one PLN account and a USD pivot: Save is disabled, and
 * this is both the reason and the way out (S05 §6).
 *
 * `neutral`, not amber: P4 reserves amber on this screen for the
 * estimated-rate marker, and a currency with no rate at all is a missing
 * capability rather than an asserted figure.
 */
export const NeedsRate: Story = {
  args: {
    raw: "48,90",
    accounts: [
      {
        id: "account-pln",
        name: "Cash · PLN",
        currency: currencyCode("PLN"),
        decimals: 2,
        capturable: false,
        ownership: "own" as const,
      },
    ],
    accountId: "account-pln",
    onSetRate: noop,
  },
};

/**
 * The kind menu open — S05 §9.1's escape hatch, and `▾` meaning what it
 * draws. Two options, and a transfer is not one of them: it is a different
 * shape with its own composer.
 */
export const KindMenu: Story = {
  args: { raw: "48,90", accountId: "account-a" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Kind: Expense" }));
    // `BottomSheet` portals to a sibling of `canvasElement` on the web —
    // `WithCounterparty` below states the same reason.
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.findByRole("button", { name: "Income" })).resolves.toBeDefined();
  },
};

/**
 * **The composer on a phone with a Dynamic Island.** This route carries no
 * navigation header, so this row *is* the header and clears the device's top
 * inset itself — the one layout no machine in this suite can report, because
 * `useSafeAreaInsets()` says zero on all of them. An iPhone 15 Pro in
 * portrait: 59 above, 34 below.
 */
export const NotchedPhone: Story = {
  decorators: [withInsets({ top: 59, right: 0, bottom: 34, left: 0 })],
  args: { raw: "48,90", accountId: "account-a" },
};

/**
 * A decorator rather than a wrapper in `render`, so the story still renders
 * the component through its args — `today-frame.stories.tsx`'s own reason.
 */
function withInsets(insets: SafeAreaInsets) {
  return function InsetDecorator(Story: React.ComponentType) {
    return (
      <SafeAreaProvider insets={insets}>
        <Story />
      </SafeAreaProvider>
    );
  };
}

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
