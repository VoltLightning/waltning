/**
 * `TabHeader` — the band every tab root but Today wears (`05-composites`
 * §5.1). Three stories: the plain title, a title with its one action, and a
 * notched device, because the clearance is the part a laptop cannot show.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { Text } from "react-native";
import { SafeAreaProvider } from "../primitives/safe-area";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { TabHeader } from "./tab-header";

const NOTCHED = { top: 59, right: 0, bottom: 34, left: 0 };

/** Whatever a screen puts in the slot — here, the shape of a period label. */
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
  action: { color: theme.shellText, ...text.ui("bodySm", 600) },
}));
