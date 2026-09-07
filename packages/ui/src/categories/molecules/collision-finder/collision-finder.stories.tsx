/**
 * `CollisionFinder` — `screens/S19-settings-categories.md` §9.2. The
 * near-duplicate finder, "same mechanism as `MatchWarning`".
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { CollisionFinder } from "./collision-finder";

function noop() {}

const meta = {
  title: "Categories/CollisionFinder",
  component: CollisionFinder,
  args: {
    candidates: [
      {
        a: { id: "groceries", name: "Groceries", usageCount: 214 },
        b: { id: "grocery", name: "Grocery", usageCount: 3 },
        score: 0.83,
      },
      {
        a: { id: "software-tools", name: "Software & tools", usageCount: 18 },
        b: { id: "software", name: "Software", usageCount: 2 },
        score: 0.71,
      },
    ],
    onReview: noop,
  },
} satisfies Meta<typeof CollisionFinder>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const None: Story = {
  args: { candidates: [] },
};
