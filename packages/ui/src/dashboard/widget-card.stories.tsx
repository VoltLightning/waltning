import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { Text } from "react-native";
import { makeStyles } from "../theme/styles.ts";
import { WidgetCard } from "./widget-card";

/** A themed example body — a bare `<Text>` renders black in RN, invisible against a dark card. */
function ExampleBody() {
  const styles = useStyles();
  return <Text style={styles.body}>Card body</Text>;
}

const useStyles = makeStyles((theme) => ({
  body: { color: theme.text },
}));

const meta = {
  title: "Dashboard/WidgetCard",
  component: WidgetCard,
  args: {
    title: "Balances",
    meta: "Now · Mine",
    children: <ExampleBody />,
  },
} satisfies Meta<typeof WidgetCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};

/** S01 §6 — a skeleton in the widget's own shape, never a page-level spinner. */
export const Loading: Story = {
  args: { loading: true },
};

/** S01 §6 — error is per widget, never the whole grid. */
export const Failed: Story = {
  args: { error: "That didn't load." },
};
