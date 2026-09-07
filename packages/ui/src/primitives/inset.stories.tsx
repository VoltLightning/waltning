/**
 * `Inset` — `design-system/02` §2.1's `inset` step, drawn. Shown inside a
 * `Card`, which is the only place it belongs: on the page it would read as a
 * card that forgot its border.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { Text, View } from "react-native";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { radius, space } from "../tokens.ts";
import { Inset } from "./inset";

const meta = {
  title: "Primitives/Inset",
  component: Inset,
  args: { children: null },
  decorators: [
    (Story) => (
      <OnACard>
        <Story />
      </OnACard>
    ),
  ],
} satisfies Meta<typeof Inset>;

export default meta;
type Story = StoryObj<typeof meta>;

function Figure({ label, value, kind }: { label: string; value: string; kind: "in" | "out" }) {
  const styles = useStyles();
  return (
    <View style={styles.figure}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, kind === "in" ? styles.in : styles.out]}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  figure: { flex: 1, gap: space.xxs },
  label: { color: theme.textMuted, ...text.ui("caption") },
  value: { ...text.ui("displayThree") },
  in: { color: theme.income },
  out: { color: theme.spend },
}));

/** The pair S04 and S12 both draw — two figures, one object. */
export const Pair: Story = {
  args: { row: true },
  render: (args) => (
    <Inset {...args}>
      <Figure label="Came in" value="+7 850,00" kind="in" />
      <Figure label="Went out" value="−4 320,18" kind="out" />
    </Inset>
  ),
};

/** Stacked, for a single grouped figure with its own caption. */
export const Single: Story = {
  render: () => (
    <Inset>
      <Figure label="Adds up to" value="48,90" kind="out" />
    </Inset>
  ),
};

/**
 * A card, drawn here rather than imported. `Card` lives in `shell/`, which is a
 * domain module, and this file is the foundation — `module-boundaries.test.ts`
 * refuses the import in either direction, stories included. Duplicating the
 * three properties a card has is cheaper than the exception.
 */
function OnACard({ children }: { children: React.ReactNode }) {
  const styles = useStoryStyles();
  return <View style={styles.card}>{children}</View>;
}

const useStoryStyles = makeStyles((theme) => ({
  card: {
    backgroundColor: theme.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    padding: space.x5,
    gap: space.x3,
    margin: space.x4,
  },
}));
