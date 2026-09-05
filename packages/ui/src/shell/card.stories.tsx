/**
 * `Card` — `design-system/05` §5.1: groups related rows or holds one hero
 * figure. Titles, single fields, chip rows, hints and buttons sit on the
 * ground, never inside one — the rule
 * `docs/specification/design-system/05-composites.md` states beside the
 * material, and `tests/architecture.test.ts` enforces against every screen.
 *
 * The two stories below are the two shapes the rule allows. Nothing else is
 * a card: not a whole screen, not a single field.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import { Text, View } from "react-native";
import { Amount } from "../fx/amount";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";
import { Card } from "./card";

const meta = {
  title: "Shell/Card",
  component: Card,
  args: { children: null },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROWS = [
  { label: "Coffee · Eating out", value: "-48.90" },
  { label: "Salary · Employment", value: "9200.00" },
  { label: "Rewe · Groceries", value: "-251.04" },
] as const;

/**
 * A titled group of related rows — `today-screen.tsx`'s Recent, `S16`'s
 * per-kind account groups. `title` and `action` are the header; the rows are
 * the body.
 */
export const GroupedRows: Story = {
  render: GroupedRowsDemo,
};

function GroupedRowsDemo() {
  const styles = useStyles();
  return (
    <Card title="Recent">
      {ROWS.map((row) => (
        <View key={row.label} style={styles.row}>
          <Text style={styles.rowLabel}>{row.label}</Text>
          <Amount value={money.toMoney(row.value)} currency="PLN" decimals={2} size="small" />
        </View>
      ))}
    </Card>
  );
}

/**
 * One hero figure and nothing else — `debt-screen.tsx`'s direction totals,
 * `ledger-screen.tsx`'s running total. Never a form, never a whole screen: a
 * card this shape holds exactly the number the screen is about.
 */
export const HeroFigure: Story = {
  render: HeroFigureDemo,
};

function HeroFigureDemo() {
  const styles = useStyles();
  return (
    <Card>
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>they owe you</Text>
        <Amount value={money.toMoney("1240.60")} currency="PLN" decimals={2} size="large" />
      </View>
    </Card>
  );
}

const useStyles = makeStyles((theme) => ({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowLabel: { color: theme.text, ...text.ui("body") },
  hero: { gap: space.xs },
  heroLabel: { color: theme.textMuted, ...text.ui("bodySm") },
}));
