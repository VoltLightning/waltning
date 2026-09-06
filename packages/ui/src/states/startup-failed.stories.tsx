/**
 * `StartupFailed` — the one state the ledger's own startup can be in besides
 * ready. `_layout.tsx` renders this in place of the whole app when
 * `startPhoneLedger` throws.
 *
 * **A fixed 390×600 frame, the same one `card.stories.tsx`'s own
 * `TallContent` uses — not `layout: "fullscreen"` alone.** The vertical
 * centring this composes (`flexGrow: 1` + `justifyContent: "center"` on
 * `GroundPanel`'s own content) has nothing to centre *within* unless
 * something above it actually has a bounded height: `fullscreen` alone
 * only removes Storybook's own padding around the canvas, and the canvas
 * itself still comes out exactly as tall as its content — a story that
 * *looked* centred under it was reading a coincidence, not a demonstration.
 * A fixed frame is what `card.stories.tsx` uses for exactly this reason.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { View } from "react-native";
import { makeStyles } from "../theme/styles.ts";
import { StartupFailed } from "./startup-failed";

function Frame({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <View style={styles.frame}>{children}</View>;
}

function withFrame(Story: React.ComponentType) {
  return (
    <Frame>
      <Story />
    </Frame>
  );
}

const meta = {
  title: "States/StartupFailed",
  component: StartupFailed,
  args: {
    error: new Error("placeholder failure reason"),
  },
  decorators: [withFrame],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof StartupFailed>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Failed: Story = {};

/**
 * The browser's transient failure: the SQLite worker still holds its files for
 * the document being replaced, which the next attempt usually clears — so this
 * one is `recoverable`, carries what it cost (nothing), and offers the button.
 */
export const Retryable: Story = {
  args: { error: new Error("placeholder failure reason"), onRetry: noop },
};

function noop() {}

const useStyles = makeStyles((theme) => ({
  frame: { width: 390, height: 600, backgroundColor: theme.ground },
}));
