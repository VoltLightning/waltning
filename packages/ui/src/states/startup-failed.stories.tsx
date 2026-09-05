/**
 * `StartupFailed` — the one state the ledger's own startup can be in besides
 * ready. `_layout.tsx` renders this in place of the whole app when
 * `startPhoneLedger` throws.
 *
 * **`layout: "fullscreen"`, not the default padded canvas.** The vertical
 * centring this composes (`flexGrow: 1` + `justifyContent: "center"` on
 * `GroundPanel`'s own content) has nothing to centre *within* unless the
 * story's own root fills the real viewport — a content-sized canvas is
 * already exactly as tall as its content, the same reasoning
 * `card.stories.tsx`'s fixed frame and `today-frame.stories.tsx`'s
 * `fullscreen` both state for themselves.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { StartupFailed } from "./startup-failed";

const meta = {
  title: "States/StartupFailed",
  component: StartupFailed,
  args: {
    error: new Error("placeholder failure reason"),
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof StartupFailed>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Failed: Story = {};
