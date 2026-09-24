/**
 * `CurrencyRow` — S17's row: a disclosure head (code, name, coverage) over the
 * actions it opens. Rows in one card separate with a rule above every row but
 * the first (`design-system/05` §5.0), so the stories draw them in a card —
 * a card's own look, since `fx/` is foundation and may not import `shell/`.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { View } from "react-native";
import { makeStyles } from "../../../theme/styles.ts";
import { hairline, radius, space } from "../../../tokens.ts";
import { CurrencyRow, type CurrencyRowData } from "./currency-row";

function noop() {}

const ROWS: readonly CurrencyRowData[] = [
  {
    code: "PLN",
    name: "Polish złoty",
    symbol: "zł",
    symbolPosition: "after",
    decimals: 2,
    pinned: true,
    rateSource: null,
    version: 1,
  },
  {
    code: "EUR",
    name: "Euro",
    symbol: "€",
    symbolPosition: "before",
    decimals: 2,
    pinned: true,
    rateSource: "nbp",
    version: 1,
  },
  {
    code: "USD",
    name: "US dollar",
    symbol: "$",
    symbolPosition: "before",
    decimals: 2,
    pinned: false,
    rateSource: "nbp",
    version: 1,
  },
];

const COVERAGE = { days: 412, realDays: 290, calendarDays: 412, pct: 100, futureRows: 0 };

function Rows({ expanded }: { expanded: string | null }) {
  const styles = useStyles();
  return (
    <View style={styles.card}>
      <View>
        {ROWS.map((row, index) => (
          <CurrencyRow
            key={row.code}
            first={index === 0}
            row={row}
            coverage={row.rateSource === null ? undefined : COVERAGE}
            usage={{ transactions: 120 - index * 40, accounts: 3 - index }}
            expanded={expanded === row.code}
            onToggleExpanded={noop}
            onTogglePinned={noop}
            onChangeSource={noop}
            onArchive={noop}
            onEdit={noop}
            onViewRates={noop}
          />
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  card: {
    backgroundColor: theme.surface,
    borderRadius: radius.md,
    borderWidth: hairline.width,
    borderColor: theme.border,
    padding: space.x3b,
  },
}));

const meta = {
  title: "Fx/CurrencyRow",
  component: Rows,
  args: { expanded: null },
} satisfies Meta<typeof Rows>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every row shut: each head sits evenly between the rules (and the card's edges). */
export const Collapsed: Story = {};

/** One row open, mid-card: its actions end on the rule above the next row. */
export const Expanded: Story = { args: { expanded: "EUR" } };
