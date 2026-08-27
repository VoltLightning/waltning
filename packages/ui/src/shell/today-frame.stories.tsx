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
import { Amount } from "../fx/amount";
import { space, type } from "../tokens.ts";
import { Card } from "./card";
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
    body: renderBody(),
  },
};

/**
 * The state a first launch shows, and the reason `addDisabled` exists — there
 * is nowhere to put a capture until an account exists.
 */
export const FirstRun: Story = {
  args: {
    total: renderTotal("0"),
    addDisabled: true,
    body: renderEmptyBody(),
  },
};

function renderTotal(value: string) {
  return (
    <Amount value={money.toMoney(value)} currency="PLN" decimals={2} size="hero" emphasis="shell" />
  );
}

function renderBody() {
  return (
    <Card title="Recent">
      <View style={{ gap: space.x2 }}>
        <Text style={{ fontSize: type.body.fontSize }}>Three rows would sit here.</Text>
      </View>
    </Card>
  );
}

function renderEmptyBody() {
  return (
    <Card title="Recent">
      <Text style={{ fontSize: type.body.fontSize }}>Nothing captured yet.</Text>
    </Card>
  );
}
