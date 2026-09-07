/**
 * `DetailRow` — the labelled row S06, S12, S16, S30 and S34 all repeat.
 * Inside a `Card`, which is where every one of them draws it.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { Text, View } from "react-native";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { radius, space } from "../tokens.ts";
import { DetailRow } from "./detail-row";

function noop() {}

const meta = {
  title: "Primitives/DetailRow",
  component: DetailRow,
  args: { label: "Account", hint: "Bank A · PLN", onPress: noop },
  decorators: [
    (Story) => (
      <OnACard>
        <Story />
      </OnACard>
    ),
  ],
} satisfies Meta<typeof DetailRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Opens a picker: chevron, button role, 44pt. */
export const Opens: Story = {};

/** States a figure instead — no chevron, and not a button. */
export const States: Story = {
  args: { label: "Adds up to", value: <Amount /> },
  render: (args) => <DetailRow label={args.label} value={args.value} />,
};

function Amount() {
  const styles = useStyles();
  return <Text style={styles.amount}>48,90</Text>;
}

const useStyles = makeStyles((theme) => ({
  amount: { color: theme.text, ...text.ui("bodySm", 600) },
  glyph: { width: 15, height: 15, borderRadius: radius.xs, backgroundColor: theme.accentIcon },
}));

function Glyph() {
  const styles = useStyles();
  return <View style={styles.glyph} />;
}

/** With its tile — the shape settings and detail both use. */
export const WithIcon: Story = {
  args: { icon: <Glyph /> },
};

/** A whole card of them, which is how they are actually seen. */
export const Stacked: Story = {
  render: () => (
    <>
      <DetailRow label="Account" hint="Bank A · PLN" icon={<Glyph />} onPress={noop} />
      <DetailRow label="Category" hint="Food" icon={<Glyph />} onPress={noop} />
      <DetailRow label="Date" hint="3 September 2026" icon={<Glyph />} onPress={noop} last />
    </>
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
    overflow: "hidden",
    margin: space.x4,
  },
}));
