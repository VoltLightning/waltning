/**
 * `TabBar` — `design-system/05` §5.1. Four targets today (Today · Ledger ·
 * Calendar · Debt); the add button is not one of them (§2.9) and Settings
 * arrives with S19.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { TabBar } from "./tab-bar";
import { CalendarTabIcon, DebtTabIcon, LedgerTabIcon, TodayTabIcon } from "./tab-icons";

function noop() {}

const meta = {
  title: "Shell/TabBar",
  component: TabBar,
  args: {
    items: [
      { name: "today", label: "Today", icon: <TodayTabIcon active />, active: true },
      { name: "ledger", label: "Ledger", icon: <LedgerTabIcon />, active: false },
      { name: "calendar", label: "Calendar", icon: <CalendarTabIcon />, active: false },
      { name: "debt", label: "Debt", icon: <DebtTabIcon />, active: false },
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
      { name: "today", label: "Today", icon: <TodayTabIcon />, active: false },
      { name: "ledger", label: "Ledger", icon: <LedgerTabIcon active />, active: true },
      { name: "calendar", label: "Calendar", icon: <CalendarTabIcon />, active: false },
      { name: "debt", label: "Debt", icon: <DebtTabIcon />, active: false },
      { name: "settings", label: "Settings", icon: <TodayTabIcon />, active: false },
    ],
  },
};
