/**
 * `SearchField` — §3.7: leading icon, clear button, live results.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { userEvent, waitFor, within } from "storybook/test";
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

/**
 * H2's fix: the ring encloses the whole field — `[icon][input][×]` — not
 * only the searchbox that receives focus.
 */
export const Focused: Story = {
  args: { value: "coffee", onClear: noop },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const searchbox = await canvas.findByRole("searchbox", { name: "Search" });
    await userEvent.click(searchbox);
    // `focused` is React state on the wrapper (`useInteraction`), set from
    // the input's own `onFocus` — one render tick behind the click's own DOM
    // focus, which lands the instant `userEvent.click` resolves. Screenshotting
    // on that instant catches the browser's own native ring on the input
    // alone, before the wrapper's ring has painted.
    const wrapper = searchbox.parentElement;
    await waitFor(() => {
      if (wrapper === null || getComputedStyle(wrapper).outlineStyle === "none") {
        throw new Error("field wrapper has not taken the focus ring yet");
      }
    });
  },
};
