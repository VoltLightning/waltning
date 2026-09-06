/**
 * `TabBar` — `design-system/05` §5.1. Four targets today (Today · Ledger ·
 * Debt · Settings); the add button is not one of them (§2.9) and Calendar
 * returns with S11.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { TabBar } from "./tab-bar";
import {
  CalendarTabIcon,
  DebtTabIcon,
  LedgerTabIcon,
  SettingsTabIcon,
  TodayTabIcon,
} from "./tab-icons";

function noop() {}

const meta = {
  title: "Shell/TabBar",
  component: TabBar,
  args: {
    items: [
      { name: "today", label: "Today", icon: <TodayTabIcon active />, active: true },
      { name: "ledger", label: "Ledger", icon: <LedgerTabIcon />, active: false },
      { name: "debt", label: "Debt", icon: <DebtTabIcon />, active: false },
      { name: "settings", label: "Settings", icon: <SettingsTabIcon />, active: false },
    ],
    onSelect: noop,
  },
} satisfies Meta<typeof TabBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A fifth target — the shape S11 brings back, and proof of the count being the caller's. */
export const FiveTabs: Story = {
  args: {
    items: [
      { name: "today", label: "Today", icon: <TodayTabIcon />, active: false },
      { name: "ledger", label: "Ledger", icon: <LedgerTabIcon active />, active: true },
      { name: "calendar", label: "Calendar", icon: <CalendarTabIcon />, active: false },
      { name: "debt", label: "Debt", icon: <DebtTabIcon />, active: false },
      { name: "settings", label: "Settings", icon: <SettingsTabIcon />, active: false },
    ],
  },
};
