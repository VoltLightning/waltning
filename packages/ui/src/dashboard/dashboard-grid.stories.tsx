import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { Text } from "react-native";
import { makeStyles } from "../theme/styles.ts";
import { DashboardGrid } from "./dashboard-grid";
import { WidgetCard } from "./widget-card";

/** A themed placeholder card — a bare `<Text>` renders black in RN, invisible against a dark card. */
function Tile({ label }: { label: string }) {
  const styles = useStyles();
  return (
    <WidgetCard title={label} meta="Now · Mine">
      <Text style={styles.body}>{label}</Text>
    </WidgetCard>
  );
}

const useStyles = makeStyles((theme) => ({
  body: { color: theme.text },
}));

const meta = {
  title: "Dashboard/DashboardGrid",
  component: DashboardGrid,
  args: {
    slots: [
      { key: "balances", size: "m", node: <Tile label="Balances" /> },
      { key: "recent", size: "m", node: <Tile label="Recent" /> },
      { key: "debt", size: "s", node: <Tile label="Debt" /> },
      { key: "spend", size: "m", node: <Tile label="Spend by category" /> },
      { key: "flow", size: "l", node: <Tile label="Income vs expense" /> },
    ],
  },
  parameters: { layout: "padded" },
} satisfies Meta<typeof DashboardGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

/** S01 §3's own mock — three cards then one full-width chart. */
export const Standing: Story = {};
