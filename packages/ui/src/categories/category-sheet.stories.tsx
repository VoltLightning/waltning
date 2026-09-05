/**
 * `CategorySheet` — S06. One picker, composed the same way from Quick add, a
 * ledger row's swipe, and the detail screen.
 *
 * `WithProposal` and `LowConfidence` are D2's contract, photographed: the
 * proposal is a value the caller computed and handed in, never something
 * this component derives — S06 never proposes on its own. `FilteredEmpty`
 * is scoped to a chosen group on purpose (§6: never at top level, because a
 * top-level leaf is `Uncategorized` and nothing else). `Creating` drives the
 * pinned `+ New` row the way a person would. Every story but `NoCreate`
 * spreads `WITH_CREATE`, because S06 §4 makes creating in place an ordinary
 * part of this sheet, not an opt-in extra — `onCreate` sits out of
 * `meta.args` itself only because `exactOptionalPropertyTypes` refuses a
 * story that tries to un-set an inherited arg by assigning it `undefined`.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { expect, userEvent, within } from "storybook/test";
import { CategorySheet, type CategoryTreeNode } from "./category-sheet";

function noop() {}
function createLeaf() {
  return { id: "new-id" };
}

/** Spread into every story but `NoCreate` — see the file doc for why this isn't in `meta.args`. */
const WITH_CREATE = { onCreate: createLeaf };

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
export const Browsing: Story = { args: WITH_CREATE };

/** A picker-only caller — `+ New` is refused rather than opening a dead end. */
export const NoCreate: Story = {};

/** Live, and covering every leaf regardless of the group chip (S06 §9). */
export const Searching: Story = {
  args: WITH_CREATE,
  play: async ({ canvasElement }) => {
    // `<Modal>` (`shell/bottom-sheet.tsx`) portals its content to a sibling of
    // `canvasElement` on the web — the same reason `visual/stories.spec.ts`
    // screenshots the rendered `role="dialog"` rather than the story root.
    // `within(canvasElement)` would never find anything here and the `play`
    // step would fail silently against the pristine story.
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.type(await canvas.findByLabelText("Search…"), "eat");
    // `USAGE`'s own count rides along in the accessible name (`common.fieldValue`,
    // "Eating out: 56") — an exact-string match against the bare leaf name
    // never matched it, and nothing was checking a `play` function's own
    // result until the gate that now catches this.
    await expect(canvas.findByRole("radio", { name: /^Eating out/ })).resolves.toBeDefined();
  },
};

/** A group chip narrows the grid to its own leaves and nothing else. */
export const GroupFiltered: Story = {
  args: WITH_CREATE,
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

/**
 * D2's proposal, at the top. ≥ 0.85 is good news, not a warning — the row
 * takes the same accent green as every other confirmed pick, never P4's
 * amber.
 */
export const WithProposal: Story = {
  args: {
    ...WITH_CREATE,
    proposal: { categoryId: "groceries", confidence: 0.93, basis: "exact", neighbours: [] },
  },
};

/** Below 0.85, amber and the §14 marker — never tint alone (P5). */
export const LowConfidence: Story = {
  args: {
    ...WITH_CREATE,
    proposal: {
      categoryId: "delivery",
      confidence: 0.6,
      basis: "neighbours",
      neighbours: [{ payee: "Rider Eats", similarity: 0.6, categoryId: "delivery" }],
    },
  },
};

/** No match, scoped to the chosen group — never at top level (§6). */
export const FilteredEmpty: Story = {
  args: WITH_CREATE,
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
  args: WITH_CREATE,
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
