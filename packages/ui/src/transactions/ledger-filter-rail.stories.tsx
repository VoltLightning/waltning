/**
 * `LedgerFilterRail` — S10 §3/§4 (web ≥1024px): the persistent left rail
 * beside `<LedgerTable>`.
 *
 * **The frame is the point of these stories.** The rail is a bounded
 * `ScrollView`, and a `ScrollView` with no height bound is just a column —
 * so a story that let Storybook's auto-height harness size it would
 * screenshot the one arrangement the component never has on a real screen.
 * `frame` gives it the fixed viewport a desk device supplies, and `Short`
 * proves the overflow case that motivated the scroller at all: at 1024×640
 * the stack of eight controls plus *Clear all* does not fit, and without a
 * scroller of its own the bottom of it is unreachable.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { View } from "react-native";
import { fn } from "storybook/test";
import { makeStyles } from "../theme/styles.ts";
import { LedgerFilterRail } from "./ledger-filter-rail";

const ACCOUNTS = [
  { value: "acc-1", label: "Bank A · PLN" },
  { value: "acc-2", label: "Bank B · EUR" },
  { value: "acc-3", label: "Cash · PLN" },
];

const CATEGORIES = [
  { value: "cat-1", label: "Groceries" },
  { value: "cat-2", label: "Eating out" },
  { value: "cat-3", label: "Transport" },
];

const CURRENCIES = [
  { value: "", label: "Every currency" },
  { value: "PLN", label: "PLN" },
  { value: "EUR", label: "EUR" },
];

const COUNTERPARTIES = [
  { value: "", label: "Every counterparty" },
  { value: "cp-1", label: "Corner Bakery" },
  { value: "cp-2", label: "Electric co-op" },
];

const SCOPES = [
  { value: "all", label: "All" },
  { value: "mine", label: "Mine" },
  { value: "shared", label: "Shared" },
  { value: "business", label: "Business" },
] as const;

const EMPTY_VALUE = {
  text: "",
  accountIds: [] as readonly string[],
  categoryIds: [] as readonly string[],
  scope: "all",
  currency: "",
  counterpartyId: "",
  from: "",
  to: "",
};

const HANDLERS = {
  onChangeText: fn(),
  onChangeAccountIds: fn(),
  onChangeCategoryIds: fn(),
  onChangeScope: fn(),
  onChangeCurrency: fn(),
  onChangeCounterpartyId: fn(),
  onChangeFrom: fn(),
  onChangeTo: fn(),
};

const PERIOD = {
  label: "September 2026",
  isCurrent: true,
  onPrevious: fn(),
  onNext: fn(),
  onToday: fn(),
};

const meta = {
  title: "Transactions/LedgerFilterRail",
  component: LedgerFilterRail,
  args: {
    value: EMPTY_VALUE,
    options: {
      accounts: ACCOUNTS,
      categories: CATEGORIES,
      currencies: CURRENCIES,
      counterparties: COUNTERPARTIES,
      scopes: SCOPES,
    },
    period: PERIOD,
    today: "2026-09-05",
    ...HANDLERS,
  },
  decorators: [
    (Story) => (
      <Frame>
        <Story />
      </Frame>
    ),
  ],
} satisfies Meta<typeof LedgerFilterRail>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing set — no *Clear all*, no exclusion notes, every control at "everything". */
export const Default: Story = {};

/**
 * Every dimension §4 names, active at once, each reporting what it excludes —
 * and *Clear all*, which appears only when there is something to clear.
 */
export const EveryFilterActive: Story = {
  args: {
    value: {
      text: "bakery",
      accountIds: ["acc-1"],
      categoryIds: ["cat-1", "cat-2"],
      scope: "business",
      currency: "PLN",
      counterpartyId: "cp-1",
      from: "2026-09-01",
      to: "2026-09-30",
    },
    period: { ...PERIOD, label: "September 2026" },
    exclusions: {
      text: 412,
      accountIds: 96,
      categoryIds: 38,
      scope: 204,
      currency: 7,
      counterpartyId: 121,
      dateRange: 1_284,
    },
    onClearAll: fn(),
  },
};

/**
 * The overflow case the scroller exists for: the same rail in a 640px-tall
 * viewport, where *Clear all* sits below the fold and is reachable only
 * because this column scrolls on its own.
 */
export const Short: Story = {
  args: { ...EveryFilterActive.args, onClearAll: fn() },
  decorators: [
    (Story) => (
      <ShortFrame>
        <Story />
      </ShortFrame>
    ),
  ],
};

function Frame({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <View style={styles.frame}>{children}</View>;
}

function ShortFrame({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <View style={styles.shortFrame}>{children}</View>;
}

const useStyles = makeStyles((theme) => ({
  // A desk viewport's own height, supplied here because Storybook's harness
  // has none of its own — see the file doc.
  frame: { height: 900, flexDirection: "row", backgroundColor: theme.surface },
  /** 1024×640 — the smallest viewport `useBreakpoint` still calls `desk`. */
  shortFrame: { height: 640, flexDirection: "row", backgroundColor: theme.surface },
}));
