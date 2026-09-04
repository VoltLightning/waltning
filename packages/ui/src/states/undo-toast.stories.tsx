/**
 * `UndoToast` — `design-system/08` §8.4. The repeat-collapse story is the one
 * the copy names directly: *"3 rows accepted · Undo"* — one toast with a
 * count, never a stack.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { Text, View } from "react-native";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";
import { UndoToast } from "./toast";

function noop() {}

const meta = {
  title: "States/UndoToast",
  component: UndoToast,
  args: { message: "Row deleted", onUndo: noop, onDismiss: noop },
  decorators: [withFrame],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof UndoToast>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A single reversible action. */
export const Single: Story = {};

/** Rapid repeats collapse into one toast with a count, never a stack. */
export const RepeatCollapsed: Story = {
  args: { message: "Rows accepted", count: 3 },
};

/**
 * A fixed-height ground with a line of content behind the toast, the way a
 * screen has one — otherwise the story canvas is as tall as the toast's own
 * `position: absolute` box, which is to say not tall at all.
 */
function withFrame(Story: React.ComponentType) {
  return (
    <Frame>
      <Story />
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.frame}>
      <Text style={styles.hint}>Recent activity</Text>
      {children}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  // No padding on the frame itself — the toast's own `left`/`right`/`bottom`
  // insets are meant to read against the screen edge, the way they do in the
  // app, not against a padded box.
  frame: { height: 200, backgroundColor: theme.ground },
  hint: { color: theme.textMuted, ...text.ui("body"), padding: space.x3 },
}));
