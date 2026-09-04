/**
 * `Dock` — §5.1: the bottom-anchored composer. Mode row, keypad, full-width
 * Save.
 *
 * Only `keypad` runs in arc 1 — `voice`, `receipt` and `converse` are named
 * in the mode row so its eventual shape is visible, and disabled because
 * S08 and S07 have not shipped.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { Dock, type DockModeOption } from "./dock";
import { Keypad as KeypadControl } from "./keypad";

function noop() {}

const MODES: readonly [DockModeOption, DockModeOption, ...DockModeOption[]] = [
  { value: "keypad", label: "Keypad" },
  { value: "voice", label: "Voice", disabled: true },
  { value: "receipt", label: "Receipt", disabled: true },
  { value: "converse", label: "Converse", disabled: true },
];

const meta = {
  title: "Transactions/Dock",
  component: Dock,
  args: {
    mode: "keypad",
    modes: MODES,
    onMode: noop,
    onSave: noop,
    saveLabel: "Save",
    children: <KeypadControl onKey={noop} />,
  },
} satisfies Meta<typeof Dock>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The keypad slot, filled the way S05 will fill it. */
export const Keypad: Story = {};

export const SaveDisabled: Story = { args: { saveDisabled: true } };
