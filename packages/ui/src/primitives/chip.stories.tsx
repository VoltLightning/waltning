/**
 * `Chip` — and specifically its three states, because the third one is a
 * product principle rather than a style.
 *
 * `J02` calls the chip row "the whole model" of a capture draft, and P2 says
 * anything a model produced declares itself. So *empty*, *filled* and
 * *machine-filled* must be visibly different, and the third must be
 * distinguishable from the second at a glance rather than on inspection.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { View } from "react-native";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";
import { Chip } from "./chip";

function noop() {}

const meta = {
  title: "Primitives/Chip",
  component: Chip,
  args: { placeholder: "Category", onPress: noop },
} satisfies Meta<typeof Chip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No value. `chip.tsx` notes a chip with neither reads as broken. */
export const Empty: Story = {};

export const Filled: Story = {
  args: { value: "Groceries" },
};

/**
 * **Machine-filled (P2).** Never inferred from "the value arrived without a
 * tap" — the prop's own doc rules that out, because a restored draft is also
 * untapped and marking those would make the marker meaningless.
 */
export const MachineFilled: Story = {
  args: { value: "Groceries", machineFilled: true },
};

export const Disabled: Story = {
  args: { value: "Groceries", disabled: true },
};

/**
 * The three side by side — the only arrangement in which "visibly distinct"
 * can actually be judged.
 */
export const ThreeStates: Story = {
  render: ThreeStatesDemo,
};

function ThreeStatesDemo() {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <Chip placeholder="Category" onPress={noop} />
      <Chip placeholder="Category" value="Groceries" onPress={noop} />
      <Chip placeholder="Category" value="Groceries" onPress={noop} machineFilled />
    </View>
  );
}

const useStyles = makeStyles(() => ({
  row: { flexDirection: "row", gap: space.x2, flexWrap: "wrap" },
}));
