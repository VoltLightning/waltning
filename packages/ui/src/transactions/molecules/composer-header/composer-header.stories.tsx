/**
 * `ComposerHeader` — the fixed band above both capture composers.
 *
 * `NotchedPhone` is the story this component exists for: the band clears the
 * device's top inset, and every machine this suite runs on reports zero, so
 * the layout that breaks on a phone is the one nothing would otherwise
 * render.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { type SafeAreaInsets, SafeAreaProvider } from "../../../primitives/safe-area";
import { ComposerHeader } from "./composer-header";

function noop() {}

const meta = {
  title: "Transactions/ComposerHeader",
  component: ComposerHeader,
  args: { onCancel: noop, title: "Add an expense", subtitle: "Wednesday, 3 September" },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ComposerHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Quick add — the name and the day under it (S05 §3). */
export const Expense: Story = {};

/** The same band on an income draft. */
export const Income: Story = {
  args: { title: "Add income" },
};

/** A composer with a fixed shape states what it does instead of the day (S31 §3). */
export const Titled: Story = {
  args: { title: "Move money", subtitle: "Between two of your own accounts" },
};

/**
 * **On a phone with a Dynamic Island.** An iPhone 15 Pro in portrait reports
 * 59 above; this band is what clears it, once, on a `View` that does not
 * scroll. The bottom inset belongs to the footer, which is a different
 * component and a different edge — so it is not faked here.
 */
export const NotchedPhone: Story = {
  decorators: [withInsets({ top: 59, right: 0, bottom: 0, left: 0 })],
};

/**
 * A decorator rather than a wrapper in `render`, so the story still renders
 * the component through its args — `today-frame.stories.tsx`'s own reason.
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
