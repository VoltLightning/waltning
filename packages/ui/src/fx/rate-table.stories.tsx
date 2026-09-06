/**
 * `RateTable` — `design-system/04` §4.7. Gaps render as explicit empty rows,
 * never as absence.
 *
 * **This list is its screen's page scroller**, so the hosting screen's own
 * controls arrive as `header` and its coverage card as `footer`. These
 * stories show the table alone; S18 is where the slots are filled.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { Text } from "react-native";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { RateTable } from "./rate-table";

function noop() {}

/**
 * The hint S18 puts in `header` when there is no pair to table — through the
 * theme, like the screen's own, rather than a bare `<Text>`: unstyled text is
 * black on both grounds, which is a 1.2:1 contrast violation in the dark
 * theme and a picture of a state this product never renders.
 */
function NoQuoteHint() {
  const styles = useStyles();
  return <Text style={styles.hint}>No currency to compare against the pivot yet.</Text>;
}

const useStyles = makeStyles((theme) => ({
  hint: { color: theme.textMuted, ...text.ui("body") },
}));

const meta = {
  title: "FX/RateTable",
  component: RateTable,
  args: {
    pair: {
      base: "USD",
      quote: "PLN",
      from: "2026-08-01",
      to: "2026-08-05",
      rows: [
        { date: "2026-08-01", rate: "3.7556", source: "nbp" },
        { date: "2026-08-02", rate: "3.7601", source: "nbp" },
        { date: "2026-08-04", rate: "3.9000", source: "manual" },
        { date: "2026-08-05", rate: "3.7601", source: "carried_forward", carriedDays: 3 },
      ],
      onSelectRow: noop,
    },
  },
} satisfies Meta<typeof RateTable>;

export default meta;
type Story = StoryObj<typeof meta>;

/** `2026-08-03` is missing — an explicit empty row, not a skipped date. */
export const WithGap: Story = {};

export const AllSynced: Story = {
  args: {
    pair: {
      base: "USD",
      quote: "PLN",
      from: "2026-08-01",
      to: "2026-08-05",
      rows: [
        { date: "2026-08-01", rate: "3.7556", source: "nbp" },
        { date: "2026-08-02", rate: "3.7601", source: "nbp" },
        { date: "2026-08-03", rate: "3.7601", source: "nbp" },
        { date: "2026-08-04", rate: "3.7601", source: "nbp" },
        { date: "2026-08-05", rate: "3.7601", source: "nbp" },
      ],
      onSelectRow: noop,
    },
  },
};

/** RUB's own state — a dead source, entirely gaps until a manual range covers it. */
export const AllGaps: Story = {
  args: {
    pair: {
      base: "USD",
      quote: "RUB",
      from: "2026-08-01",
      to: "2026-08-05",
      rows: [],
      onSelectRow: noop,
    },
  },
};

/**
 * *Nothing to table* — no quote currency, no pivot, or a range that does not
 * parse. The scroller stays, because it is the page; the hosting screen's own
 * hint rides in `header`, which is why this story has one: the state never
 * occurs without it, and a picture of an empty list documents nothing.
 */
export const NoPair: Story = {
  args: {
    pair: null,
    header: <NoQuoteHint />,
  },
};
