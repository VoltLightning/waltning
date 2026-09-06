/**
 * `Banner` — `design-system/05` §5.4. The three tones together, so `warn`
 * reads as the only amber use in the system rather than a generic highlight.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { View } from "react-native";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";
import { Banner } from "./banner";

function noop() {}

const meta = {
  title: "States/Banner",
  component: Banner,
  args: { tone: "neutral", message: "Showing data as of 14:06" },
} satisfies Meta<typeof Banner>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Offline, stated as freshness rather than failure (§8.3). */
export const Neutral: Story = {};

/** Not finished or not fully observed — P4's one amber use. */
export const Warn: Story = {
  args: {
    tone: "warn",
    message: "Rates are 3 days old",
    action: { label: "Refresh", onPress: noop },
  },
};

/** A failure. */
export const Negative: Story = {
  args: {
    tone: "negative",
    message: "The last sync failed",
    action: { label: "Retry", onPress: noop },
  },
};

/**
 * The phone, at 390pt: the action goes under the message rather than beside
 * it. Beside it, the button held its own width and left the sentence a column
 * two words wide — four lines and 110pt of banner over a screen it was only
 * meant to annotate. The frame is the story's subject, so it is fixed rather
 * than left to the canvas.
 */
export const StackedAtPhoneWidth: Story = {
  args: {
    tone: "warn",
    message: "No rate for EUR — add one before capturing",
    action: { label: "Add rate", onPress: noop },
  },
  decorators: [withPhoneFrame],
};

function PhoneFrame({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <View style={styles.phone}>{children}</View>;
}

function withPhoneFrame(Story: React.ComponentType) {
  return (
    <PhoneFrame>
      <Story />
    </PhoneFrame>
  );
}

const useStyles = makeStyles((theme) => ({
  phone: { width: 390, padding: space.x5, backgroundColor: theme.ground },
}));
