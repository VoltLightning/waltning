/**
 * `SettingsMenu` — the Settings tab's list of destinations, one card of
 * grouped rows with no title of its own (the tab shell draws the name).
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { SettingsMenu } from "./settings-menu";

function noop() {}

const meta = {
  title: "Settings/SettingsMenu",
  component: SettingsMenu,
  args: {
    items: [
      { id: "accounts", label: "Accounts" },
      { id: "categories", label: "Categories" },
      { id: "currencies", label: "Currencies" },
      { id: "rates", label: "Exchange rates" },
    ],
    onSelect: noop,
  },
} satisfies Meta<typeof SettingsMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every destination the Settings tab offers today, in the order it offers them. */
export const Populated: Story = {};

/** One destination — the rule under the last row is the one that never draws. */
export const Single: Story = { args: { items: [{ id: "accounts", label: "Accounts" }] } };
