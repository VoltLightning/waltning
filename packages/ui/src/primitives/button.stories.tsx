/**
 * `Button` — four variants × three sizes, and the two states that are easy to
 * get wrong in one theme while looking right in the other.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { View } from "react-native";
import { expect, fn, userEvent, within } from "storybook/test";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";
import { Button, type ButtonVariant } from "./button";

function noop() {}

const meta = {
  title: "Primitives/Button",
  component: Button,
  args: { label: "Save", onPress: noop },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = { args: { variant: "primary" } };
export const Secondary: Story = { args: { variant: "secondary" } };
export const Ghost: Story = { args: { variant: "ghost" } };
export const Danger: Story = { args: { variant: "danger", label: "Delete" } };

/**
 * `primary`, so the baseline shows the disabled treatment of the solid fill —
 * the variant most likely to be disabled in the app (a submit button waiting
 * on a required field), and the one whose contrast loss is easiest to miss.
 */
export const Disabled: Story = { args: { disabled: true, variant: "primary" } };

/**
 * **Pressing it calls `onPress` once.** The floor of the component, and the
 * first thing in this package that is checked by *driving* it rather than by
 * inspecting what it rendered.
 */
export const Pressed: Story = {
  args: { onPress: fn(), variant: "primary" },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByText("Save"));
    await expect(args.onPress).toHaveBeenCalledTimes(1);
  },
};

/**
 * **A disabled button does not call `onPress`.** The direction that fails
 * silently: a disabled control that still fires looks correct until the write
 * it was guarding happens twice.
 */
export const DisabledDoesNotFire: Story = {
  args: { disabled: true, onPress: fn(), variant: "primary" },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByText("Save"));
    await expect(args.onPress).not.toHaveBeenCalled();
  },
};

/**
 * **The spinner replaces the label and the width does not change** — stated in
 * `ButtonProps`, and a claim only a render can check. A button that resizes
 * when pressed moves everything beside it.
 *
 * `primary`, so the baseline shows the loading treatment of the solid fill —
 * the variant a submit action actually uses while it waits on a write.
 */
export const Loading: Story = { args: { loading: true, variant: "primary" } };

const VARIANTS: readonly ButtonVariant[] = ["primary", "secondary", "ghost", "danger"];

/**
 * All four together, which is how a variant that has lost its contrast in one
 * theme becomes obvious. Switch the toolbar to *Side by side* to check both at
 * once.
 */
export const AllVariants: Story = {
  args: { variant: "primary" },
  render: AllVariantsDemo,
};

function AllVariantsDemo() {
  const styles = useStyles();
  return (
    <View style={styles.stack}>
      {VARIANTS.map((variant) => (
        <Button key={variant} label={variant} onPress={noop} variant={variant} />
      ))}
    </View>
  );
}

/**
 * §3.1's height scale — sm 32 · md 40 · lg 48 — which is a spec number rather
 * than a preference, and the row is where an off-by-one shows.
 */
export const Sizes: Story = {
  args: { variant: "primary" },
  render: SizesDemo,
};

function SizesDemo() {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <Button label="sm" onPress={noop} size="sm" variant="primary" />
      <Button label="md" onPress={noop} size="md" variant="primary" />
      <Button label="lg" onPress={noop} size="lg" variant="primary" />
    </View>
  );
}

const useStyles = makeStyles(() => ({
  stack: { gap: space.x2, alignItems: "flex-start" },
  row: { flexDirection: "row", gap: space.x2, alignItems: "center" },
}));
