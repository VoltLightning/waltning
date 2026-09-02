/**
 * `TodayFrame` — the one composite in the proof set, because a composite is
 * where the shell gradient meets the ground panel, and that is where the dark
 * palette's hardest open question lives.
 *
 * The dark-palette card names it: the shell gradient is `#0e2e20 → #164531`,
 * "already almost-black green", and in dark "it cannot also be the ground, or
 * the shell stops being a shell and the app becomes one flat surface." That is
 * settled by looking, and this is where you look. Switch the toolbar to *Side
 * by side*.
 *
 * **The slots hold `shell` and foundation content only, and the boundary test
 * is why.** A first draft filled `body` with `TransactionRow` and `EmptyState`
 * to look like the real screen, and `module-boundaries.test.ts` refused it:
 * `shell/` reaching into `transactions/` and `states/` is a cross-module
 * import. It was right, and the reason generalises — **a story that composes
 * across domains is a screen**, and `architecture/11` puts composition in
 * `app/` routes, not inside a module. Screen stories arrive with the port that
 * lets a screen render without a live ledger; until then a frame story shows
 * the frame.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import { Text, View } from "react-native";
import { type SafeAreaInsets, SafeAreaProvider } from "../primitives/safe-area";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";
import { Card } from "./card";
import { CurrencyTotals } from "./currency-totals";
import { TodayFrame } from "./today-frame";

function noop() {}

const meta = {
  title: "Shell/TodayFrame",
  component: TodayFrame,
  args: { appearanceAction: null, onAdd: noop },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof TodayFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  args: {
    total: renderTotal("48210.00"),
    body: <Body>Three rows would sit here.</Body>,
  },
};

/**
 * **The same frame on a phone with a Dynamic Island**, which is the device the
 * old hardcoded `34` was most wrong about.
 *
 * This story exists because `useSafeAreaInsets()` reports whatever the running
 * device says, and every machine this suite runs on says zero — so the layout
 * that breaks on a notched phone was the one nothing could render. Insets as a
 * value mean a story can be that phone, and the screenshot is the evidence.
 *
 * The numbers are an iPhone 15 Pro in portrait: 59 above, 34 below for the home
 * indicator.
 */
export const NotchedPhone: Story = {
  decorators: [withInsets({ top: 59, right: 0, bottom: 34, left: 0 })],
  args: {
    total: renderTotal("48210.00"),
    body: <Body>Three rows would sit here.</Body>,
  },
};

/**
 * **Two currencies, and no total.** The screenshot is the evidence for the one
 * claim this change makes visually: the lead figure is a hero, the second is
 * one step down rather than a component of it, and the line underneath says so.
 *
 * The order is the ledger's — złoty first because the first account is in it,
 * not because 12 480,20 outranks 8 400,00 across two currencies it cannot be
 * compared to.
 */
export const TwoCurrencies: Story = {
  args: {
    total: (
      <CurrencyTotals
        subtotals={[
          { currency: "PLN", decimals: 2, balance: money.toMoney("12480.20") },
          { currency: "BYN", decimals: 2, balance: money.toMoney("8400.00") },
        ]}
      />
    ),
    body: <Body>Three rows would sit here.</Body>,
  },
};

/**
 * The state a first launch shows, and the reason `addDisabled` exists — there
 * is nowhere to put a capture until an account exists.
 *
 * **The headline is absent, not zero.** With no account there is no currency to
 * print a zero in, and `0,00 USD` on a ledger someone banks in złoty would be
 * an invented figure in an invented currency.
 */
export const FirstRun: Story = {
  args: {
    total: <CurrencyTotals subtotals={[]} />,
    addDisabled: true,
    body: <Body>Nothing captured yet.</Body>,
  },
};

/**
 * A decorator rather than a wrapper in `render`, so the story still renders
 * `TodayFrame` through its args and stays a component story — a `render` that
 * builds the tree itself is a story the args table no longer describes.
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

/** One currency. `<CurrencyTotals>` prints the lead figure and nothing else. */
function renderTotal(value: string) {
  return (
    <CurrencyTotals subtotals={[{ currency: "PLN", decimals: 2, balance: money.toMoney(value) }]} />
  );
}

/**
 * **A `Text` with no colour was the bug the contrast check found first**, and
 * it was in this file rather than in a component. React Native defaults an
 * uncoloured `Text` to black, which is invisible on a dark `surface` — 1.3:1
 * against `#10251a`, where 4.5 is required.
 *
 * `conformance.test.ts` could not see it: that rule bans a component *naming* a
 * colour, and this named none. Naming none is the same defect from the other
 * side, and only a rendered pixel catches it — which is the argument for this
 * whole suite, made by the suite on its first run.
 */
function Body({ children }: { children: string }) {
  const styles = useStyles();
  return (
    <Card title="Recent">
      <View style={styles.stack}>
        <Text style={styles.text}>{children}</Text>
      </View>
    </Card>
  );
}

const useStyles = makeStyles((theme) => ({
  stack: { gap: space.x2 },
  text: { color: theme.text, ...text.ui("body") },
}));
