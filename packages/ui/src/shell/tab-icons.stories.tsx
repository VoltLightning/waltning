/**
 * The five tab glyphs, active and inactive side by side — the placeholder
 * set until §2.8's Phosphor install lands. Soft rectangles only (§2.4); the
 * ink follows the label the way `TabBar`'s own text does.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { View } from "react-native";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";
import {
  CalendarTabIcon,
  DebtTabIcon,
  LedgerTabIcon,
  SettingsTabIcon,
  TodayTabIcon,
} from "./tab-icons";

function Row() {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <TodayTabIcon />
      <LedgerTabIcon />
      <CalendarTabIcon />
      <DebtTabIcon />
      <SettingsTabIcon />
    </View>
  );
}

function ActiveRow() {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <TodayTabIcon active />
      <LedgerTabIcon active />
      <CalendarTabIcon active />
      <DebtTabIcon active />
      <SettingsTabIcon active />
    </View>
  );
}

const useStyles = makeStyles(() => ({
  row: { flexDirection: "row", gap: space.x4, padding: space.x4 },
}));

const meta = {
  title: "Shell/TabIcons",
  component: Row,
} satisfies Meta<typeof Row>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Today · Ledger · Calendar · Debt · Settings, inactive. */
export const Inactive: Story = {};

/** The same five, active — `accentText`, matching the selected label. */
export const Active: Story = { render: () => <ActiveRow /> };
