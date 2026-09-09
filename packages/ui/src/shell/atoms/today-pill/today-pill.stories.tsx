/**
 * The way back from a jump (S04 §6). It floats over the list, so the story
 * gives it rows to float over — a pill drawn on nothing says nothing about the
 * one property that matters.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { Text, View } from "react-native";
import { makeStyles } from "../../../theme/styles.ts";
import { space } from "../../../tokens.ts";
import { TodayPill } from "./today-pill";

function noop() {}

const DAYS = ["Tue 3 March", "Mon 2 March", "Sun 1 March", "Sat 28 February"];

function Page({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.page}>
      <View style={styles.rows}>
        {DAYS.map((day) => (
          <Text key={day} style={styles.day}>
            {day}
          </Text>
        ))}
      </View>
      {children}
    </View>
  );
}

const meta = {
  title: "Shell/TodayPill",
  component: TodayPill,
  args: { label: "Today", accessibilityLabel: "Back to today", onPress: noop },
  decorators: [
    (Story) => (
      <Page>
        <Story />
      </Page>
    ),
  ],
} satisfies Meta<typeof TodayPill>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The list is somewhere else, and this is the way home. */
export const Away: Story = {};

const useStyles = makeStyles((theme) => ({
  page: { height: 200, backgroundColor: theme.ground },
  rows: { gap: space.md, paddingTop: space.sm, paddingHorizontal: space.x3 },
  day: { color: theme.textMuted },
}));
