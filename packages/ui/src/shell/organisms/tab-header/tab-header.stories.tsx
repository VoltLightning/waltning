/**
 * `TabHeader` — the band every tab root but Today wears (`05-composites`
 * §5.1), on the ground as the deck draws it. The plain title, a title with
 * its line, a title with its one action, and a notched device — the
 * clearance is the part a laptop cannot show.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { Text } from "react-native";
import { SafeAreaProvider } from "../../../primitives/safe-area";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { TabHeader } from "./tab-header";

const NOTCHED = { top: 59, right: 0, bottom: 34, left: 0 };

/**
 * Whatever a screen puts in the slot — here, the shape of a period label. In
 * the ground's own muted ink: the band is cream now, and an action inked for
 * the sage it used to sit on fails contrast on it.
 */
function Action() {
  const styles = useStyles();
  return <Text style={styles.action}>September</Text>;
}

const meta = {
  title: "Shell/TabHeader",
  component: TabHeader,
  args: { title: "Ledger" },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof TabHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** S30's own opening: the name and what the screen is for. */
export const WithSubtitle: Story = {
  args: { title: "Settings", subtitle: "Everything about how this behaves" },
};

/** One action, on the right — never three. */
export const WithAction: Story = {
  args: {
    title: "Debt",
    action: <Action />,
  },
};

/** A phone with a Dynamic Island: the title clears it rather than sharing it. */
export const Notched: Story = {
  decorators: [withNotch],
};

function withNotch(Story: React.ComponentType) {
  return (
    <SafeAreaProvider insets={NOTCHED}>
      <Story />
    </SafeAreaProvider>
  );
}

const useStyles = makeStyles((theme) => ({
  action: { color: theme.textMuted, ...text.ui("bodySm", 600) },
}));
