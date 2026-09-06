/**
 * `ComposerHeader` — the fixed band above both capture composers.
 *
 * `NotchedPhone` is the story this component exists for: the band clears the
 * device's top inset, and every machine this suite runs on reports zero, so
 * the layout that breaks on a phone is the one nothing would otherwise
 * render.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { expect, userEvent, within } from "storybook/test";
import { type SafeAreaInsets, SafeAreaProvider } from "../primitives/safe-area";
import { ComposerHeader } from "./composer-header";

function noop() {}

const meta = {
  title: "Transactions/ComposerHeader",
  component: ComposerHeader,
  args: { onCancel: noop },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ComposerHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Quick add — the kind control is the name and the change, together (S05 §9.1). */
export const Expense: Story = {
  args: { kind: "expense", onKindChange: noop },
};

/** The same header on an income draft: the title reflects the kind, because it *is* the kind. */
export const Income: Story = {
  args: { kind: "income", onKindChange: noop },
};

/** A composer whose kind cannot change states its name instead (S31 §3). */
export const Titled: Story = {
  args: { title: "Transfer" },
};

/**
 * The menu open, **marking the current kind** — being read is the whole
 * reason it opens, and a sheet that answers nothing the trigger already said
 * is a tap spent on nothing. Two options; a transfer is not one of them.
 */
export const KindMenu: Story = {
  args: { kind: "expense", onKindChange: noop },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Kind: Expense" }));
    // `BottomSheet` portals its content to a sibling of `canvasElement` on
    // the web — `quick-add-composer.stories.tsx` states the same reason.
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.findByRole("radio", { name: "Expense" })).resolves.toBeDefined();
  },
};

/**
 * **On a phone with a Dynamic Island.** An iPhone 15 Pro in portrait reports
 * 59 above; this band is what clears it, once, on a `View` that does not
 * scroll. The bottom inset belongs to `Dock`, which is a different component
 * and a different edge — so it is not faked here.
 */
export const NotchedPhone: Story = {
  decorators: [withInsets({ top: 59, right: 0, bottom: 0, left: 0 })],
  args: { kind: "expense", onKindChange: noop },
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
