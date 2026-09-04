/**
 * `SearchField` — §3.7: leading icon, clear button, live results.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { SearchField } from "./search-field";

function noop() {}

const meta = {
  title: "Primitives/SearchField",
  component: SearchField,
  args: { value: "", onChangeText: noop, placeholder: "Search" },
} satisfies Meta<typeof SearchField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

/** The clear control appears only once there is something to clear. */
export const WithText: Story = {
  args: { value: "coffee", onClear: noop },
};

/** The live-region line — visible, not only announced. */
export const WithResults: Story = {
  args: { value: "coffee", onClear: noop, resultCount: 4 },
};
