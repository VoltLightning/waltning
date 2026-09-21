/**
 * `TimePicker` — §3.7a's sheet for a clock: *Now* and three landmark times over
 * two wrapping columns.
 *
 * Every story opens the modal, because that is the only state this component
 * has. `AMinuteNoChipNames` is the one worth reading twice: it is why the
 * minute column offers all sixty.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { timeOfDay } from "@waltning/core/date";
import { TimePicker } from "./time-picker";

function noop() {}

const NOW = timeOfDay("14:37");

const meta = {
  title: "Primitives/TimePicker",
  component: TimePicker,
  args: {
    prompt: "At what time?",
    value: NOW,
    onChange: noop,
    now: NOW,
    onDismiss: noop,
  },
} satisfies Meta<typeof TimePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Opens on the clock, with *Now* lit. */
export const Now: Story = {};

/** A landmark — the light moves, and the drum is already there. */
export const Midday: Story = { args: { value: timeOfDay("12:00") } };

/** Off a receipt: no chip says 08:12, so the drum is the only thing that does. */
export const AMinuteNoChipNames: Story = { args: { value: timeOfDay("08:12") } };

/** Either side of midnight, which is where a column that did not wrap would end. */
export const AcrossMidnight: Story = { args: { value: timeOfDay("00:03") } };
