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
 * **`base`/`quote` are required, not decoration.** `fx_rates.rate` is units
 * of the quote per one pivot (`SPEC.md` §4) — a table that renders `3.7556`
 * with no unit reads as *the* rate, and the reader supplies whichever
 * direction they were already thinking in, which is the exact hazard §4
 * names. The column header states it plainly: `{quote} per {base}`.
 *
 * **The rate renders through `formatRate`**, the same locale-aware helper
 * `<Amount>` uses (`money.forDisplay` under the reader's own decimal mark) —
 * not `money.toMoney`, which only ever answers the storage form. And through
 * `text.ui` + `tabularNums`, not `text.mono`: `04` §2.2 already settled which
 * face aligns a column of digits on Android, and `mono` here was `ui-monospace`
 * — the platform's own face, unregistered and untested, which is a fallback
 * serif on more than one device this ships to.
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
import { useCallback, useMemo } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useLocale, useT } from "../i18n/provider";
import { useInteraction } from "../primitives/interaction.ts";
import { Tag } from "../primitives/tag";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, space, tabularNums, touchTarget } from "../tokens.ts";
import { formatRate } from "./format-rate.ts";

/** `04` §4.6's own source set — the fourth provider names and the two markers. */
const SOURCE_LABEL_KEYS = {
  nbp: "fx.sourceNbp",
  ecb: "fx.sourceEcb",
  nbrb: "fx.sourceNbrb",
  nbg: "fx.sourceNbg",
  manual: "fx.sourceManual",
} as const;

const CARRIED_FORWARD = "carried_forward";

export type RateTableSourceRow = {
  date: string;
  rate: string;
  source: string;
  /**
   * Only meaningful when `source === "carried_forward"` — `readRate`'s own
   * figure. `null` (C2) means the origin is unlocatable; never `0`.
   */
  carriedDays?: number | null;
};

type RenderRow = {
  date: string;
  rate: string | null;
  source: string | null;
  carriedDays: number | null | undefined;
};

export type RateTableProps = {
  /** The pivot — never chosen here, only stated (`SPEC.md` §7.0). */
  base: string;
  quote: string;
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

export function RateTable({ base, quote, from, to, rows, onSelectRow }: RateTableProps) {
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
        held
          ? { date, rate: held.rate, source: held.source, carriedDays: held.carriedDays }
          : { date, rate: null, source: null, carriedDays: undefined },
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
    <>
      <View style={styles.header}>
        <Text style={styles.headerDate}>{t("fx.rateTableDateHeader")}</Text>
        <Text style={styles.headerRate}>{t("fx.rateTableRateHeader", { quote, base })}</Text>
        <Text style={styles.headerSource}>{t("fx.rateTableSourceHeader")}</Text>
      </View>
      <FlatList
        data={filled}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        style={styles.list}
      />
    </>
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
  const locale = useLocale();
  const styles = useStyles();
  const { focused, handlers } = useInteraction();

  const handlePress = useCallback(() => onSelect?.(row.date), [onSelect, row.date]);

  const isManual = row.source === "manual";
  const isCarried = row.source === CARRIED_FORWARD;

  // Never the raw enum with an underscore (`04` §4.6) — every source renders
  // through a translated label, and `carried_forward` states its own age
  // rather than repeating a word that means nothing to whoever reads it.
  const sourceKey =
    row.source !== null && row.source in SOURCE_LABEL_KEYS
      ? SOURCE_LABEL_KEYS[row.source as keyof typeof SOURCE_LABEL_KEYS]
      : undefined;
  // L8 — an unrecognised source states so plainly; it is not `manual` just
  // because that used to be the fallback. C2 — an unlocatable origin states
  // its age as unknown, never `0`, which would read as an exact quote.
  const sourceLabel = isCarried
    ? row.carriedDays == null
      ? t("fx.rateTableCarriedUnknown")
      : t("fx.rateTableCarried", { count: row.carriedDays })
    : t(sourceKey ?? "fx.sourceUnknown");

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
          <Text style={styles.rate}>{formatRate(row.rate, locale)}</Text>
          <Tag variant={isManual ? "warn" : "neutral"}>{sourceLabel}</Tag>
        </>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  list: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.x3,
    paddingVertical: space.xs,
    paddingHorizontal: space.x2,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerDate: {
    color: theme.textMuted,
    ...text.ui("kicker"),
    textTransform: "uppercase",
    width: 96,
  },
  headerRate: { color: theme.textMuted, ...text.ui("kicker"), textTransform: "uppercase", flex: 1 },
  headerSource: { color: theme.textMuted, ...text.ui("kicker"), textTransform: "uppercase" },
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
    ...text.ui("bodySm"),
    fontVariant: [...tabularNums],
    flex: 1,
  },
  gap: { color: theme.textMuted, ...text.ui("bodySm"), flex: 1 },
  empty: { color: theme.textMuted, ...text.ui("body"), padding: space.x3 },
}));
