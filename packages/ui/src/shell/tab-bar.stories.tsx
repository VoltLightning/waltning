/**
 * `TabBar` — `design-system/05` §5.1. Four targets today (Today · Ledger ·
 * Calendar · Debt); the add button is not one of them (§2.9) and Settings
 * arrives with S19.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { View } from "react-native";
import { makeStyles } from "../theme/styles.ts";
import { radius } from "../tokens.ts";
import { TabBar } from "./tab-bar";

function noop() {}

function Dot() {
  const styles = useStyles();
  return <View style={styles.dot} />;
}

const useStyles = makeStyles((theme) => ({
  dot: { width: 20, height: 20, borderRadius: radius.sm, backgroundColor: theme.textMuted },
}));

const meta = {
  title: "Shell/TabBar",
  component: TabBar,
  args: {
    items: [
      { name: "today", label: "Today", icon: <Dot />, active: true },
      { name: "ledger", label: "Ledger", icon: <Dot />, active: false },
      { name: "calendar", label: "Calendar", icon: <Dot />, active: false },
      { name: "debt", label: "Debt", icon: <Dot />, active: false },
    ],
    onSelect: noop,
  },
} satisfies Meta<typeof TabBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A fifth target, to prove the bar is not hardcoded to four. */
export const FiveTabs: Story = {
  args: {
    items: [
      { name: "today", label: "Today", icon: <Dot />, active: false },
      { name: "ledger", label: "Ledger", icon: <Dot />, active: true },
      { name: "calendar", label: "Calendar", icon: <Dot />, active: false },
      { name: "debt", label: "Debt", icon: <Dot />, active: false },
      { name: "settings", label: "Settings", icon: <Dot />, active: false },
    ],
  },
};
