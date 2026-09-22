/**
 * `CategoryTree` — `screens/S19-settings-categories.md` §3, §4.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { toMoney } from "@waltning/core/money";
import { CategoryTree } from "./category-tree";

function noop() {}

const FOOD = {
  id: "food",
  parentId: null,
  name: "Food",
  kind: "expense" as const,
  isLeaf: false,
  archived: false,
  depth: 0,
  usageCount: 0,
};

const GROCERIES = {
  id: "groceries",
  parentId: "food",
  name: "Groceries",
  kind: "expense" as const,
  isLeaf: true,
  archived: false,
  depth: 1,
  usageCount: 214,
};

const EATING_OUT = {
  id: "eating-out",
  parentId: "food",
  name: "Eating out",
  kind: "expense" as const,
  isLeaf: true,
  archived: false,
  depth: 1,
  usageCount: 0,
};

const EARNINGS = {
  id: "earnings",
  parentId: null,
  name: "Earnings",
  kind: "income" as const,
  isLeaf: false,
  archived: false,
  depth: 0,
  usageCount: 0,
};

const SALARY = {
  id: "salary",
  parentId: "earnings",
  name: "Salary",
  kind: "income" as const,
  isLeaf: true,
  archived: false,
  depth: 1,
  usageCount: 12,
};

const NODES = [FOOD, GROCERIES, EATING_OUT, EARNINGS, SALARY];

const meta = {
  title: "Categories/CategoryTree",
  component: CategoryTree,
  args: { nodes: NODES, onOpenActions: noop },
} satisfies Meta<typeof CategoryTree>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * **Where money went this month** (S19): the figure over a bar against the
 * month's largest, a group's being its children's together, and nothing on a
 * row that was not spent in.
 */
export const ThisMonth: Story = {
  args: {
    nodes: [
      { ...FOOD, spent: { amount: toMoney("1729.40"), currency: "zł", decimals: 2 } },
      {
        ...GROCERIES,
        spent: { amount: toMoney("1240.50"), currency: "zł", decimals: 2 },
        share: 1,
      },
      {
        ...EATING_OUT,
        spent: { amount: toMoney("488.90"), currency: "zł", decimals: 2 },
        share: 0.39,
      },
      EARNINGS,
      SALARY,
    ],
  },
};

/**
 * The archived toggle, on — a formerly hidden row rejoins the list right
 * after its parent group's own leaves, not appended at the end.
 */
export const WithArchived: Story = {
  args: {
    nodes: [
      FOOD,
      GROCERIES,
      EATING_OUT,
      {
        id: "old-subscriptions",
        parentId: "food",
        name: "Old subscriptions",
        kind: "expense" as const,
        isLeaf: true,
        archived: true,
        depth: 1,
        usageCount: 41,
      },
      EARNINGS,
      SALARY,
    ],
  },
};
