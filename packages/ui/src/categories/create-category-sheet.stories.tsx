/**
 * `CreateCategorySheet` — S19's own `create_category`: name, kind, and an
 * optional parent, because an empty taxonomy has no group to sit under.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { CreateCategorySheet } from "./create-category-sheet";

function noop() {}

const GROUPS = [
  { id: "food", name: "Food", kind: "expense" as const },
  { id: "home", name: "Home", kind: "expense" as const },
  { id: "work", name: "Work", kind: "income" as const },
];

const meta = {
  title: "Categories/CreateCategorySheet",
  component: CreateCategorySheet,
  args: { visible: true, groups: GROUPS, onSave: noop, onDismiss: noop },
} satisfies Meta<typeof CreateCategorySheet>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The ordinary open — expense, no parent chosen yet. */
export const Open: Story = {};

/** A ledger with nothing in it: the parent picker has nothing to offer, and says so. */
export const EmptyTaxonomy: Story = { args: { groups: [] } };

/** The sibling collision the controller refuses, landing on the field it is about. */
export const WithError: Story = { args: { error: '"Groceries" already exists here' } };
