/**
 * `SwipeableRow` — S10 §4, §7. Drag the row: short of ~40px it springs back,
 * past it fires the short swipe (*categorise*), past ~140px the long swipe
 * (*open detail*, `LedgerRowItem`'s own name for it). Interactive here and on
 * a device; inert under the component test (`.vitest/gesture-handler.ts`).
 *
 * **There is nothing behind the row to reveal.** The row only moves; no layer
 * under it says which action a drag will take, so there is no revealed state
 * to photograph — only the row at rest.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import { View } from "react-native";
import { makeStyles } from "../../../theme/styles.ts";
import { radius, space } from "../../../tokens.ts";
import { TransactionRow } from "../transaction-row/transaction-row";
import { SwipeableRow } from "./swipeable-row";

function noop() {}

function RowAtRest() {
  const styles = useStyles();
  return (
    <View style={styles.surface}>
      <SwipeableRow onShortSwipe={noop} onLongSwipe={noop}>
        <TransactionRow
          date="2026-08-24"
          withDate={false}
          enteredName="Corner Bakery"
          category="Eating out"
          account="Cash"
          amount={money.toMoney("-48.90")}
          currency="PLN"
          type="expense"
          brandKey={null}
        />
      </SwipeableRow>
    </View>
  );
}

const meta = {
  title: "Transactions/SwipeableRow",
  component: RowAtRest,
} satisfies Meta<typeof RowAtRest>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

const useStyles = makeStyles((theme) => ({
  surface: {
    backgroundColor: theme.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    padding: space.x5,
  },
}));
