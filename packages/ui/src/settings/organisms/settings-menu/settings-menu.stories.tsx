/**
 * `SettingsMenu` — the Settings tab's destinations, in the deck's three
 * groups: a tinted tile, the label, and the one fact behind it.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { SettingsMenu } from "./settings-menu";

function noop() {}

const meta = {
  title: "Settings/SettingsMenu",
  component: SettingsMenu,
  args: {
    groups: [
      [
        { id: "accounts", label: "Accounts", value: "Four, one shared", glyph: "accounts" },
        { id: "categories", label: "Categories", value: "31 in use", glyph: "categories" },
      ],
      [
        { id: "currencies", label: "Currencies", value: "PLN · EUR · GBP", glyph: "currencies" },
        { id: "rates", label: "Exchange rates", value: "Two days behind", glyph: "rates" },
      ],
      [{ id: "backup", label: "Back up", value: "Never taken", glyph: "backup" }],
    ],
    onSelect: noop,
  },
} satisfies Meta<typeof SettingsMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every destination, grouped and with its line — `S30` as drawn. */
export const Populated: Story = {};

/**
 * A fresh ledger has nothing true to say behind most rows, so the label stands
 * alone. A placeholder would be a figure the screen invented.
 */
export const NoValues: Story = {
  args: {
    groups: [
      [
        { id: "accounts", label: "Accounts", glyph: "accounts" },
        { id: "categories", label: "Categories", glyph: "categories" },
      ],
      [{ id: "backup", label: "Back up", glyph: "backup" }],
    ],
  },
};

/** One group of one — the rule under the last row is the one that never draws. */
export const Single: Story = {
  args: { groups: [[{ id: "backup", label: "Back up", glyph: "backup" }]] },
};
