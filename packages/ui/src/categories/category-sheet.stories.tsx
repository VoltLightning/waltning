/**
 * `CategorySheet` — S06. One picker, composed the same way from Quick add, a
 * ledger row's swipe, and the detail screen.
 *
 * `WithProposal` and `LowConfidence` are D2's contract, photographed: the
 * proposal is a value the caller computed and handed in, never something
 * this component derives — S06 never proposes on its own. `FilteredEmpty`
 * is scoped to a chosen group on purpose (§6: never at top level, because a
 * top-level leaf is `Uncategorized` and nothing else). `Creating` drives the
 * pinned `+ New` row the way a person would.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { expect, userEvent, within } from "storybook/test";
import { CategorySheet, type CategoryTreeNode } from "./category-sheet";

function noop() {}

const FOOD: CategoryTreeNode = {
  id: "food",
  parentId: null,
  name: "Food",
  kind: "expense",
  isLeaf: false,
};
const TRANSPORT: CategoryTreeNode = {
  id: "transport",
  parentId: null,
  name: "Transport",
  kind: "expense",
  isLeaf: false,
};
const TREE: CategoryTreeNode[] = [
  FOOD,
  { id: "groceries", parentId: "food", name: "Groceries", kind: "expense", isLeaf: true },
  { id: "eating-out", parentId: "food", name: "Eating out", kind: "expense", isLeaf: true },
  { id: "delivery", parentId: "food", name: "Delivery", kind: "expense", isLeaf: true },
  { id: "alcohol", parentId: "food", name: "Alcohol", kind: "expense", isLeaf: true },
  TRANSPORT,
  { id: "fuel", parentId: "transport", name: "Fuel", kind: "expense", isLeaf: true },
  { id: "parking", parentId: "transport", name: "Parking", kind: "expense", isLeaf: true },
  { id: "uncategorized", parentId: null, name: "Uncategorized", kind: "expense", isLeaf: true },
];

const USAGE = { groceries: 187, "eating-out": 56, delivery: 48, alcohol: 22, uncategorized: 194 };

const meta = {
  title: "Categories/CategorySheet",
  component: CategorySheet,
  args: {
    visible: true,
    kind: "expense",
    tree: TREE,
    usage: USAGE,
    onPick: noop,
    onDismiss: noop,
  },
} satisfies Meta<typeof CategorySheet>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The default: every leaf across every group, `Uncategorized` last and muted. */
export const Browsing: Story = {};

/** Live, and covering every leaf regardless of the group chip (S06 §9). */
export const Searching: Story = {
  play: async ({ canvasElement }) => {
    // `<Modal>` (`shell/bottom-sheet.tsx`) portals its content to a sibling of
    // `canvasElement` on the web — the same reason `visual/stories.spec.ts`
    // screenshots the rendered `role="dialog"` rather than the story root.
    // `within(canvasElement)` would never find anything here and the `play`
    // step would fail silently against the pristine story.
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.type(await canvas.findByLabelText("Search…"), "eat");
    await expect(canvas.findByRole("radio", { name: "Eating out" })).resolves.toBeDefined();
  },
};

/** A group chip narrows the grid to its own leaves and nothing else. */
export const GroupFiltered: Story = {
  play: async ({ canvasElement }) => {
    // `<Modal>` (`shell/bottom-sheet.tsx`) portals its content to a sibling of
    // `canvasElement` on the web — the same reason `visual/stories.spec.ts`
    // screenshots the rendered `role="dialog"` rather than the story root.
    // `within(canvasElement)` would never find anything here and the `play`
    // step would fail silently against the pristine story.
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("button", { name: "Transport" }));
    await expect(canvas.findByRole("radio", { name: "Fuel" })).resolves.toBeDefined();
  },
};

/** D2's proposal, at the top, with its confidence as a `Tag`. */
export const WithProposal: Story = {
  args: {
    proposal: { categoryId: "groceries", confidence: 0.93, basis: "exact", neighbours: [] },
  },
};

/** Below 0.85, the §14 marker joins the tag — never tint alone (P5). */
export const LowConfidence: Story = {
  args: {
    proposal: {
      categoryId: "delivery",
      confidence: 0.6,
      basis: "neighbours",
      neighbours: [{ payee: "Bolt Food", similarity: 0.6 }],
    },
  },
};

/** No match, scoped to the chosen group — never at top level (§6). */
export const FilteredEmpty: Story = {
  args: { onCreate: () => ({ id: "new-id" }) },
  play: async ({ canvasElement }) => {
    // `<Modal>` (`shell/bottom-sheet.tsx`) portals its content to a sibling of
    // `canvasElement` on the web — the same reason `visual/stories.spec.ts`
    // screenshots the rendered `role="dialog"` rather than the story root.
    // `within(canvasElement)` would never find anything here and the `play`
    // step would fail silently against the pristine story.
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("button", { name: "Food" }));
    await userEvent.type(await canvas.findByLabelText("Search…"), "Snacks");
    await expect(canvas.findByRole("button", { name: 'Create "Snacks"' })).resolves.toBeDefined();
  },
};

/** The pinned `+ New` row — group locked to the chip already narrowing the sheet. */
export const Creating: Story = {
  args: { onCreate: () => ({ id: "new-id" }) },
  play: async ({ canvasElement }) => {
    // `<Modal>` (`shell/bottom-sheet.tsx`) portals its content to a sibling of
    // `canvasElement` on the web — the same reason `visual/stories.spec.ts`
    // screenshots the rendered `role="dialog"` rather than the story root.
    // `within(canvasElement)` would never find anything here and the `play`
    // step would fail silently against the pristine story.
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("button", { name: "Food" }));
    await userEvent.click(await canvas.findByRole("button", { name: "New" }));
    await expect(canvas.findByLabelText("Name")).resolves.toBeDefined();
  },
};
