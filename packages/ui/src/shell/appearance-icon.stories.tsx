/**
 * The header action, on the band it actually sits on — which is the whole
 * point of the story. A first version put a ground-family hover fill behind
 * the glyph, leaving it at 1.10:1 in light: a control that disappears the
 * moment a pointer touches it, and nothing in the suite could see it because
 * jsdom does not paint. Hover these.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { IconButton } from "../primitives/icon-button";
import { AppearanceIcon } from "./appearance-icon";
import { Shell } from "./shell";

function noop() {}

const meta = {
  title: "Shell/AppearanceIcon",
  component: AppearanceIcon,
  decorators: [
    (Story) => (
      <Shell
        leading={null}
        trailing={
          <IconButton label="Appearance" onPress={noop} tone="shell">
            <Story />
          </IconButton>
        }
      />
    ),
  ],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof AppearanceIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

/** At rest. `shellText` on `shell` — 7.77:1 light, 7.94 dark. */
export const OnTheBand: Story = {};
