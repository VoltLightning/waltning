/**
 * `SwipeableRow` — S10 §4, §7. Drag the row: short of ~40px it springs back,
 * past it fires *Categorise*, past ~140px fires *Edit*. Interactive here and
 * on device; inert under the component test (`.vitest/gesture-handler.ts`).
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { radius, space } from "../tokens.ts";
import { SwipeableRow } from "./swipeable-row";
import { TransactionRow } from "./transaction-row";

const meta = {
  title: "Transactions/SwipeableRow",
  component: SwipeableRow,
  args: { onShortSwipe: () => undefined, onLongSwipe: () => undefined, children: null },
} satisfies Meta<typeof SwipeableRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: SwipeDemo,
};

function SwipeDemo() {
  const styles = useStyles();
  const [last, setLast] = useState("Drag the row — short swipe categorises, long swipe edits.");
  const handleShortSwipe = useCallback(() => setLast("Short swipe → Categorise"), []);
  const handleLongSwipe = useCallback(() => setLast("Long swipe → Edit"), []);

  return (
    <View style={styles.surface}>
      <Text style={styles.hint}>{last}</Text>
      <SwipeableRow onShortSwipe={handleShortSwipe} onLongSwipe={handleLongSwipe}>
        <TransactionRow
          date="2026-08-24"
          payee="Corner Bakery"
          category="Eating out"
          account="Cash"
          amount={money.toMoney("-48.90")}
          currency="PLN"
          type="expense"
        />
      </SwipeableRow>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  surface: {
    backgroundColor: theme.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    padding: space.x5,
    gap: space.x3,
  },
  hint: { color: theme.textMuted, ...text.ui("caption") },
}));
