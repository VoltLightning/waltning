/**
 * `PageHeader` — what every screen that is not a tab root opens with. The deck
 * has no navigation band; this is what replaced the one twelve screens wore.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { IconButton } from "../../../primitives/atoms/icon-button/icon-button";
import { BackMark } from "./back-mark";
import { PageHeader } from "./page-header";

function noop() {}

const back = (
  <IconButton label="Back" onPress={noop}>
    <BackMark />
  </IconButton>
);

const meta = {
  title: "Shell/PageHeader",
  component: PageHeader,
  args: { title: "Currencies" },
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

const SUBTITLE = "Which exist, and where rates come from";

/** S17, as the deck draws it: the name, the line, and the way back in the corner. */
export const Pushed: Story = { args: { subtitle: SUBTITLE, action: back } };

/** A tab root, which has somewhere to be rather than somewhere to leave. */
export const NoAction: Story = { args: { subtitle: SUBTITLE } };

/**
 * Some screens are a word. The prop is **omitted**, not `undefined` —
 * `exactOptionalPropertyTypes` makes those different, and omission is what a
 * screen with nothing to add actually passes.
 */
export const TitleOnly: Story = { args: { action: back } };

/**
 * A long name truncates rather than wrapping into the control: the title is one
 * line by construction, and the mark keeps its corner.
 */
export const LongTitle: Story = {
  args: {
    title: "A counterparty with a very long name indeed",
    subtitle: "What is owed, and since when",
    action: back,
  },
};
