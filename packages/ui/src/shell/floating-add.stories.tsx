/**
 * The floating add button in its two states, over a stand-in for the page.
 *
 * The frame is a fixed 390×640 `ground` box rather than the story canvas: the
 * button positions itself against its layer's measured size, and a canvas that
 * is as tall as its content would be as tall as nothing.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { View } from "react-native";
import { type SafeAreaInsets, SafeAreaProvider } from "../primitives/safe-area";
import { makeStyles } from "../theme/styles.ts";
import { FloatingAdd } from "./floating-add";

function noop() {}

const meta = {
  title: "Shell/FloatingAdd",
  component: FloatingAdd,
  args: { onAdd: noop, onPositionChange: noop, position: null },
  decorators: [withFrame],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof FloatingAdd>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Bottom-right, 16 in from both edges. */
export const Default: Story = {};

/** Where a thumb put it. */
export const Moved: Story = { args: { position: { x: 24, y: 180, dock: null } } };

/** Pushed off the bottom: a 44×22 tab at that column, on top of the safe area. */
export const Parked: Story = { args: { position: { x: 24, y: 180, dock: 260 } } };

/** The default on a phone with a home indicator: the inset adds to the 16. */
export const NotchedPhone: Story = {
  decorators: [withInsets({ top: 59, right: 0, bottom: 34, left: 0 })],
};

export const Disabled: Story = { args: { disabled: true } };

function withFrame(Story: React.ComponentType) {
  return (
    <Frame>
      <Story />
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <View style={styles.frame}>{children}</View>;
}

function withInsets(insets: SafeAreaInsets) {
  return function InsetDecorator(Story: React.ComponentType) {
    return (
      <SafeAreaProvider insets={insets}>
        <Story />
      </SafeAreaProvider>
    );
  };
}

const useStyles = makeStyles((theme) => ({
  frame: { width: 390, height: 640, backgroundColor: theme.ground },
}));
