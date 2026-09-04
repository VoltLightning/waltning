/**
 * `<RateTable>` — `design-system/04` §4.6.
 *
 * *"The rate history for one pair, by date … Columns: date · rate (4dp,
 * tabular) · source · provenance marker … `manual` renders amber and sorts to
 * visibility (P4) … Gaps are rows, not absences."*
 *
 * **This component fills the gaps, not the caller.** `listFxRates` (the
 * ledger reader behind it) is sparse — it returns the rows the replica
 * actually holds, the same way a database always does. Generating one row per
 * calendar day from `from`…`to` and marking the ones with no match as
 * `"gap"` happens exactly once, here, rather than in every screen that draws
 * this table — the defect §4.6 names (GEL's 11-of-2,080 going unnoticed) was
 * a caller scrolling past a silent hole, and a component that can render a
 * sparse list unchanged would let that happen again.
 *
 * **A `FlatList`, per `wave-4-shared.md`'s own rule — no virtualisation
 * library.** 2,080 days is comfortably within what `FlatList`'s own windowing
 * handles; the spec's "Virtualized" is the behaviour, not a dependency.
 *
 * **No drag-select, and a tap rather than a long-press.** `S18` §7 describes
 * dragging across dates to seed `RateEditor`; that needs a gesture recognizer
 * this table does not yet have, and the plan's own fallback — "long-press a
 * row" — has no discoverable affordance for a screen reader (nothing marks a
 * row as holding a second interaction) and no reliable web-platform event to
 * test against. A plain `onSelectRow` seeds a single-day edit instead, same
 * as every other row action in this design system (`ledger-screen.tsx`'s own
 * rows), and the range form — `RateEditor`'s own `from`/`to` — covers the
 * multi-day case via two `DateField`s on the screen that hosts this table.
 * Named here so the gap from the spec's own language is visible rather than
 * silently smaller than it reads.
 */

import { accountingDate, addDays, daysBetween } from "@waltning/core/date";
import * as money from "@waltning/core/money";
import { useCallback, useMemo } from "react";
import { FlatList, Pressable, Text } from "react-native";
import { useT } from "../i18n/provider";
import { useInteraction } from "../primitives/interaction.ts";
import { Tag } from "../primitives/tag";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, space, tabularNums, touchTarget } from "../tokens.ts";

export type RateTableSourceRow = {
  date: string;
  rate: string;
  source: string;
};

type RenderRow = {
  date: string;
  rate: string | null;
  source: string | null;
};

export type RateTableProps = {
  /** Inclusive range — every calendar day between renders one row. */
  from: string;
  to: string;
  /** Sparse — only the dates the replica actually holds a rate for. */
  rows: readonly RateTableSourceRow[];
  /** A row tapped — seeds a single-day `RateEditor`. */
  onSelectRow?: (date: string) => void;
};

function keyExtractor(row: RenderRow): string {
  return row.date;
}

export function RateTable({ from, to, rows, onSelectRow }: RateTableProps) {
  const t = useT();
  const styles = useStyles();

  const filled = useMemo(() => {
    const byDate = new Map(rows.map((row) => [row.date, row]));
    const fromDate = accountingDate(from);
    const toDate = accountingDate(to);
    const span = daysBetween(fromDate, toDate);
    if (span < 0) return [];

    const out: RenderRow[] = [];
    for (let n = 0; n <= span; n += 1) {
      const date = addDays(fromDate, n);
      const held = byDate.get(date);
      out.push(
        held ? { date, rate: held.rate, source: held.source } : { date, rate: null, source: null },
      );
    }
    return out;
  }, [rows, from, to]);

  const renderItem = useCallback(
    ({ item }: { item: RenderRow }) => <RateTableRowView row={item} onSelect={onSelectRow} />,
    [onSelectRow],
  );

  if (filled.length === 0) {
    return <Text style={styles.empty}>{t("fx.rateTableEmptyRange")}</Text>;
  }

  return (
    <FlatList
      data={filled}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      style={styles.list}
    />
  );
}

function RateTableRowView({
  row,
  onSelect,
}: {
  row: RenderRow;
  onSelect?: ((date: string) => void) | undefined;
}) {
  const t = useT();
  const styles = useStyles();
  const { focused, handlers } = useInteraction();

  const handlePress = useCallback(() => onSelect?.(row.date), [onSelect, row.date]);

  const isManual = row.source === "manual";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        row.rate === null ? t("fx.rateTableGapLabel", { date: row.date }) : row.date
      }
      onPress={handlePress}
      {...handlers}
      style={[styles.row, focused ? styles.rowFocused : null]}
    >
      <Text style={styles.date}>{row.date}</Text>
      {row.rate === null ? (
        <Text style={styles.gap}>{t("fx.rateTableGap")}</Text>
      ) : (
        <>
          <Text style={styles.rate}>{money.toMoney(row.rate, 4)}</Text>
          <Tag variant={isManual ? "warn" : "neutral"}>{row.source ?? ""}</Tag>
        </>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  list: { flex: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: touchTarget.min,
    gap: space.x3,
    paddingVertical: space.sm,
    paddingHorizontal: space.x2,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  rowFocused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  date: { color: theme.text, ...text.ui("bodySm"), width: 96 },
  rate: {
    color: theme.text,
    ...text.mono("bodySm"),
    fontVariant: [...tabularNums],
    flex: 1,
  },
  gap: { color: theme.textMuted, ...text.ui("bodySm"), flex: 1 },
  empty: { color: theme.textMuted, ...text.ui("body"), padding: space.x3 },
}));
