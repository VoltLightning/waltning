/**
 * `ListEntryCell` — one cell of Today's List page (S04 §3): a day's header,
 * a row in its place inside the day's surface, a quiet day, or a run of them.
 * The list is a sequence of these cells, so each story draws a short column
 * of them the way the page does — rows without their date, because the day
 * header above already says it.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { currencyCode, toMoney } from "@waltning/core/money";
import { View } from "react-native";
import { makeStyles } from "../../../theme/styles.ts";
import type { LedgerEntry } from "../entry-row/ledger-entry.ts";
import type { DayRowPlaceName, DayTotal, ListEntry } from "./entry.ts";
import { ListEntryCell } from "./list-entry";

const PLN = currencyCode("PLN");

function noop() {}

const HANDLERS = { onOpenTransaction: noop, onPickDay: noop };

function row(id: string, overrides: Partial<LedgerEntry>): LedgerEntry {
  return {
    id,
    date: "2026-09-10",
    type: "expense",
    enteredName: "Market B",
    categoryName: "Groceries",
    accountName: "Bank A",
    amount: toMoney("-124.50"),
    currency: PLN,
    decimals: 2,
    isBusiness: false,
    brandKey: null,
    ...overrides,
  };
}

const MARKET = row("t1", {});
const TRAM = row("t2", {
  enteredName: "Tram pass",
  categoryName: "Transport",
  accountName: "Cash",
  amount: toMoney("-45.00"),
});
const CAFE = row("t3", {
  enteredName: "Café A",
  categoryName: "Eating out",
  amount: toMoney("-18.90"),
});
const SALARY = row("t4", {
  date: "2026-09-11",
  type: "income",
  enteredName: "Employer A",
  categoryName: "Salary",
  amount: toMoney("6200.00"),
});

function day(key: string, date: string, label: string, total: DayTotal, first = false): ListEntry {
  return { key, kind: "day", date, label, total, first };
}

function placed(entry: LedgerEntry, place: DayRowPlaceName): ListEntry {
  return { key: entry.id, kind: "row", row: entry, place };
}

function Column({ entries }: { entries: readonly ListEntry[] }) {
  const styles = useStyles();
  return (
    <View style={styles.column}>
      {entries.map((entry) => (
        <ListEntryCell
          key={entry.key}
          entry={entry}
          handlers={HANDLERS}
          currency={PLN}
          decimals={2}
          onMeasure={noop}
        />
      ))}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  column: { width: 390, maxWidth: "100%" },
}));

const meta = {
  title: "Transactions/ListEntryCell",
  component: Column,
  args: { entries: [] },
} satisfies Meta<typeof Column>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A day of three: the first and last rows round the surface, the middle one does not. */
export const ADay: Story = {
  args: {
    entries: [
      day(
        "d1",
        "2026-09-10",
        "Thursday 10 September",
        { pivot: toMoney("-188.40"), approximate: false },
        true,
      ),
      placed(MARKET, "first"),
      placed(TRAM, "middle"),
      placed(CAFE, "last"),
    ],
  },
};

/** One row is still a day: fully rounded, alone in its surface. A day that nets positive is green. */
export const OnlyRow: Story = {
  args: {
    entries: [
      day(
        "d1",
        "2026-09-11",
        "Friday 11 September",
        { pivot: toMoney("6200.00"), approximate: false },
        true,
      ),
      placed(SALARY, "only"),
    ],
  },
};

/**
 * No rate for a leg: a transfer into a foreign account whose destination the
 * ledger could not price. The day cannot state a total, so a dash stands in
 * for the figure (S04 §5).
 */
export const NoRate: Story = {
  args: {
    entries: [
      day("d1", "2026-09-10", "Thursday 10 September", { pivot: null }, true),
      placed(
        row("t6", {
          type: "transfer",
          enteredName: "",
          categoryName: null,
          toAccountName: "Wallet · USD",
          amount: toMoney("-400.00"),
          toAmount: toMoney("98.10"),
          toCurrency: currencyCode("USD"),
          toDecimals: 2,
        }),
        "only",
      ),
    ],
  },
};

/** Filtered: the rows on screen are a subset a query chose, so the day states no total (S04 §7). */
export const Filtered: Story = {
  args: {
    entries: [
      day("d1", "2026-09-10", "Thursday 10 September", { pivot: "filtered" }, true),
      placed(MARKET, "first"),
      placed(TRAM, "last"),
    ],
  },
};

/** A day with nothing on it, in the past and ahead — the two say different things. */
export const QuietDays: Story = {
  args: {
    entries: [
      {
        key: "q1",
        kind: "quiet",
        date: "2026-09-09",
        label: "Wednesday 9 September",
        ahead: false,
      },
      { key: "q2", kind: "quiet", date: "2026-09-26", label: "Saturday 26 September", ahead: true },
    ],
  },
};

/**
 * Several quiet days in a row collapse into one line, in the past and ahead.
 * A single quiet day is never a run — `QuietDays` above is how it draws.
 */
export const QuietRuns: Story = {
  args: {
    entries: [
      {
        key: "r1",
        kind: "run",
        label: "1–8 September",
        days: 8,
        from: "2026-09-08",
        ahead: false,
      },
      {
        key: "r2",
        kind: "run",
        label: "27–30 September",
        days: 4,
        from: "2026-09-27",
        ahead: true,
      },
    ],
  },
};
