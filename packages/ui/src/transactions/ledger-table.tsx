/**
 * `<LedgerTable>` — S10 §3 (web ≥1024px): "Table, not cards" — date · payee ·
 * category · account · scope · amount, sortable by header, dense enough that
 * a month is scanned rather than scrolled.
 *
 * **A plain `FlatList`, on purpose.** `apps/mobile/src/ledger-screen.tsx`'s
 * own doc names this exactly: the phone list was the first honest data point
 * for a virtualised table's own risk, and this is the second, not the risk's
 * answer. `initialNumToRender` is set from `rows.length` (capped) so a
 * populated story and a modest real ledger page both mount in full; a
 * thousand-row page still virtualises the ordinary `FlatList` way — windowed,
 * growing as the list scrolls — which is a real, load-bearing trade rather
 * than a limitation of the stories that exercise it.
 *
 * **Sorting and selection are owned by the caller.** `rows` arrives already
 * sorted and filtered (`sortLedgerRows`, `useTransactionSearch`) and
 * `selection` is `useLedgerTableSelection`'s own result — this component
 * reads both and writes to neither on its own initiative; it only ever
 * calls back (`onSortColumn`, `selection.toggleRow`). That split is what
 * lets "range-selected" and "sorted" be two independent stories instead of
 * one component's own hidden state.
 *
 * **Keyboard: `J`/`K` move the active row, `Enter` opens it, `F` asks the
 * caller to focus the rail** (S10 §7 web). All three arrive through one
 * `onKeyDown` on the table's own scroll container — `react-native-web`
 * forwards it the same way `threshold-slider.tsx` already relies on, and
 * its own doc explains why the prop is typed separately rather than named
 * in `View`'s RN type. The container must hold DOM focus for any of this to
 * fire, which is the ordinary shape of a keyboard-driven grid: click or Tab
 * into it once, then never touch the mouse again — exactly what "the keys
 * above all work with no mouse" asks for, not a global page-level listener
 * this component has no business installing.
 *
 * **The checkbox column reads `shiftKey` off `onPress`'s own event.**
 * `react-native-web`'s `Pressable` forwards a real DOM `MouseEvent` into
 * `onPress` on web (`PressResponder.js`'s own comment: "the event's
 * `nativeEvent` is a `MouseEvent`"), so `shiftKey` is genuinely there —
 * React Native's `GestureResponderEvent` type just does not say so, which is
 * this file's one budgeted `unknown` (`tests/unknown-budget.test.ts`): the
 * same seam `ledger-screen.tsx`'s own `Href` cast crosses, an external type
 * that does not carry a member TypeScript can see.
 *
 * **`LedgerTableColumn`, `SortState` and the selection shape are restated,
 * not imported from `@waltning/client`.** `packages/client` and `packages/ui`
 * are siblings on the architecture floor — neither depends on the other — so
 * `TransactionType`'s own precedent (independently declared here and in
 * `create-phone-ledger.ts`) is the pattern: the two packages agree on a
 * structural shape, and TypeScript's structural typing makes the boundary
 * invisible to the screen that hands a client hook's result to this prop.
 */

import type * as money from "@waltning/core/money";
import { useCallback, useRef, useState } from "react";
import {
  FlatList,
  type GestureResponderEvent,
  type ListRenderItemInfo,
  Pressable,
  Text,
  View,
} from "react-native";
import { Amount } from "../fx/amount";
import { useT } from "../i18n/provider";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, hairline, radius, space, tabularNums, touchTarget } from "../tokens.ts";
import { TRANSACTION_AMOUNT_KIND, type TransactionType } from "./transaction-row";

export type LedgerTableColumn = "date" | "payee" | "category" | "account" | "scope" | "amount";
export type LedgerTableSortDirection = "asc" | "desc";
/** `null` — the caller's own order, untouched (`ledger-table-sort.ts`'s own doc). */
export type LedgerTableSortState = {
  column: LedgerTableColumn;
  direction: LedgerTableSortDirection;
} | null;

export type LedgerTableRow = {
  id: string;
  date: string;
  payee: string;
  category: string;
  account: string;
  scope: string;
  /** A decimal `Money` string — the same field name `sortLedgerRows` sorts on. */
  amountValue: money.Money;
  currency: string;
  decimals: number;
  type: TransactionType;
  isBusiness: boolean;
  /** Only income/expense rows join a batch categorize — `transactions_category_shape`. */
  selectable: boolean;
};

/** The shape `useLedgerTableSelection`'s own result already has — restated, not imported (see the file doc). */
export type LedgerTableSelection = {
  selectedIds: ReadonlySet<string>;
  isSelected: (id: string) => boolean;
  toggleRow: (id: string, rangeExtend: boolean) => void;
  clear: () => void;
  count: number;
};

const COLUMNS: readonly LedgerTableColumn[] = [
  "date",
  "payee",
  "category",
  "account",
  "scope",
  "amount",
];

export type LedgerTableProps = {
  rows: readonly LedgerTableRow[];
  sort: LedgerTableSortState;
  onSortColumn: (column: LedgerTableColumn) => void;
  selection: LedgerTableSelection;
  onOpenRow: (id: string) => void;
  /** `F` — S10 §7 web. Absent for a table with no rail beside it (a story). */
  onFocusRail?: () => void;
  /** Shown in place of the rows — `EmptyState(filtered)` or `(first-run)`, the screen's own call. */
  emptyState?: React.ReactNode;
};

/**
 * Read from the row a table cell shows, in bytes not glyphs — a checkbox
 * column plus the six named ones. Widths are fixed rather than `flex` on
 * every column so a header cell and its body cells never drift a pixel
 * apart, the same reasoning `TransactionRow`'s own `date` column gives.
 */
const CHECKBOX_WIDTH = 32;
const DATE_WIDTH = 84;
const SCOPE_WIDTH = 88;
const AMOUNT_WIDTH = 120;

export function LedgerTable({
  rows,
  sort,
  onSortColumn,
  selection,
  onOpenRow,
  onFocusRail,
  emptyState,
}: LedgerTableProps) {
  const t = useT();
  const styles = useStyles();
  const [activeId, setActiveId] = useState<string | null>(null);

  // Read fresh inside the keydown handler without making its identity swing
  // on every row change — `use-transaction-search.ts`'s own ref trick.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const moveActive = useCallback(
    (delta: number) => {
      const current = rowsRef.current;
      if (current.length === 0) return;
      const index = current.findIndex((row) => row.id === activeId);
      const next =
        index === -1
          ? delta > 0
            ? 0
            : current.length - 1
          : Math.min(current.length - 1, Math.max(0, index + delta));
      const row = current[next];
      if (row) setActiveId(row.id);
    },
    [activeId],
  );

  const handleOpenActive = useCallback(() => {
    if (activeId !== null) onOpenRow(activeId);
  }, [activeId, onOpenRow]);

  /**
   * `View`'s React Native type has no `onKeyDown` — the file doc explains
   * why this stays a separately-typed prop bag rather than a literal JSX
   * attribute the stricter type would refuse.
   */
  const keyboardProps: { onKeyDown: (event: KeyboardEvent) => void } = {
    onKeyDown: (event) => {
      if (event.key === "j") {
        event.preventDefault();
        moveActive(1);
      } else if (event.key === "k") {
        event.preventDefault();
        moveActive(-1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        handleOpenActive();
      } else if (event.key === "f" || event.key === "/") {
        // S10 §7 web — `/` and `F` both reach the rail's search field. The
        // spec's own two verbs ("focuses search" / "opens the filter rail")
        // described a collapsible rail; this one is persistent (§3: "the
        // filter bar as a persistent left rail"), so there is nothing for
        // either key to open — both land on the one control worth a
        // keyboard shortcut to reach.
        event.preventDefault();
        onFocusRail?.();
      }
    },
  };

  const handlePressRow = useCallback(
    (id: string) => {
      setActiveId(id);
      onOpenRow(id);
    },
    [onOpenRow],
  );

  const handleToggleSelect = useCallback(
    (id: string, event: { shiftKey?: boolean }) => {
      selection.toggleRow(id, event.shiftKey === true);
    },
    [selection],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<LedgerTableRow>) => (
      <LedgerTableRowView
        row={item}
        active={item.id === activeId}
        selected={selection.isSelected(item.id)}
        onPress={handlePressRow}
        onToggleSelect={handleToggleSelect}
      />
    ),
    [activeId, selection, handlePressRow, handleToggleSelect],
  );
  const keyExtractor = useCallback((row: LedgerTableRow) => row.id, []);

  if (rows.length === 0) {
    return (
      <View style={styles.root}>
        <LedgerTableHeader sort={sort} onSortColumn={onSortColumn} />
        <View style={styles.empty}>{emptyState}</View>
      </View>
    );
  }

  return (
    <View style={styles.root} accessibilityLabel={t("transactions.ledgerTable")}>
      <LedgerTableHeader sort={sort} onSortColumn={onSortColumn} />
      <FlatList
        data={rows}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        initialNumToRender={Math.min(rows.length, 50)}
        style={styles.list}
        tabIndex={0}
        testID="ledger-table-scroller"
        {...keyboardProps}
      />
    </View>
  );
}

type LedgerTableHeaderProps = {
  sort: LedgerTableSortState;
  onSortColumn: (column: LedgerTableColumn) => void;
};

function LedgerTableHeader({ sort, onSortColumn }: LedgerTableHeaderProps) {
  const styles = useStyles();
  return (
    <View style={styles.headerRow}>
      <View style={[styles.cell, styles.checkboxCell]} />
      {COLUMNS.map((column) => (
        <LedgerTableHeaderCell
          key={column}
          column={column}
          sort={sort}
          onSortColumn={onSortColumn}
        />
      ))}
    </View>
  );
}

// `satisfies`, not a `Record<LedgerTableColumn, string>` annotation — the
// latter widens every value to plain `string`, and `t()` wants the literal
// catalogue key each one actually is.
const COLUMN_LABEL_KEY = {
  date: "transactions.date",
  payee: "transactions.payee",
  category: "transactions.category",
  account: "transactions.account",
  scope: "transactions.scope",
  amount: "transactions.amount",
} as const satisfies Record<LedgerTableColumn, string>;

const COLUMN_STYLE_KEY: Record<
  LedgerTableColumn,
  "dateCell" | "flexCell" | "scopeCell" | "amountCell"
> = {
  date: "dateCell",
  payee: "flexCell",
  category: "flexCell",
  account: "flexCell",
  scope: "scopeCell",
  amount: "amountCell",
};

type LedgerTableHeaderCellProps = {
  column: LedgerTableColumn;
  sort: LedgerTableSortState;
  onSortColumn: (column: LedgerTableColumn) => void;
};

function LedgerTableHeaderCell({ column, sort, onSortColumn }: LedgerTableHeaderCellProps) {
  const t = useT();
  const styles = useStyles();
  const handlePress = useCallback(() => onSortColumn(column), [onSortColumn, column]);
  const active = sort?.column === column;
  // Arrows carry no letters, so they read the same in every language —
  // `PeriodHeader`'s own "‹"/"›" make the same call.
  const indicator = active ? (sort?.direction === "asc" ? " ↑" : " ↓") : "";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(COLUMN_LABEL_KEY[column])}
      onPress={handlePress}
      style={[styles.cell, styles[COLUMN_STYLE_KEY[column]]]}
    >
      <Text style={styles.headerLabel}>
        {t(COLUMN_LABEL_KEY[column])}
        {indicator}
      </Text>
    </Pressable>
  );
}

type LedgerTableRowViewProps = {
  row: LedgerTableRow;
  active: boolean;
  selected: boolean;
  onPress: (id: string) => void;
  onToggleSelect: (id: string, event: { shiftKey?: boolean }) => void;
};

function LedgerTableRowView({
  row,
  active,
  selected,
  onPress,
  onToggleSelect,
}: LedgerTableRowViewProps) {
  const styles = useStyles();
  const handlePress = useCallback(() => onPress(row.id), [onPress, row.id]);
  // The one narrow `unknown` step this file needs — the file doc explains
  // why: `GestureResponderEvent` genuinely carries `shiftKey` on web, but
  // its type does not say so, and `unknown` is the sanctioned way through a
  // seam like that (`CLAUDE.md`: "a loose type at a seam is where contracts
  // leak" — the leak is in `react-native`'s own type, not this file's).
  const handleToggle = useCallback(
    (event: GestureResponderEvent) => {
      const shiftKey = (event as unknown as { shiftKey?: boolean }).shiftKey === true;
      onToggleSelect(row.id, { shiftKey });
    },
    [onToggleSelect, row.id],
  );

  return (
    <View
      style={[styles.row, active ? styles.rowActive : null, selected ? styles.rowSelected : null]}
    >
      <View style={[styles.cell, styles.checkboxCell]}>
        {row.selectable ? (
          <LedgerRowCheckbox checked={selected} label={row.payee} onPress={handleToggle} />
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={row.payee || row.account}
        onPress={handlePress}
        style={styles.rowBody}
      >
        <Text style={[styles.cellText, styles.dateCell]}>{row.date.slice(5)}</Text>
        <Text style={[styles.cellText, styles.flexCell]} numberOfLines={1}>
          {row.payee || "—"}
        </Text>
        <Text style={[styles.cellTextMuted, styles.flexCell]} numberOfLines={1}>
          {row.category || "—"}
        </Text>
        <Text style={[styles.cellTextMuted, styles.flexCell]} numberOfLines={1}>
          {row.account}
        </Text>
        <Text style={[styles.cellTextMuted, styles.scopeCell]} numberOfLines={1}>
          {row.scope}
        </Text>
        <View style={styles.amountCell}>
          <Amount
            value={row.amountValue as money.Money}
            currency={row.currency}
            decimals={row.decimals}
            size="small"
            kind={TRANSACTION_AMOUNT_KIND[row.type]}
          />
        </View>
      </Pressable>
    </View>
  );
}

type LedgerRowCheckboxProps = {
  checked: boolean;
  label: string;
  onPress: (event: GestureResponderEvent) => void;
};

/**
 * A bare selection box — not `primitives/checkbox.tsx`'s `<Checkbox>`, which
 * always renders a visible label beside its box (`copy`'s own `flex: 1`).
 * That is right for a settings list and wrong for a 32px table column; this
 * carries the same accessible name through `accessibilityLabel` instead of
 * a rendered one, and draws the same two-bar mark `Checkbox`'s own doc
 * describes, at table density rather than row density.
 */
function LedgerRowCheckbox({ checked, label, onPress }: LedgerRowCheckboxProps) {
  const t = useT();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={t("transactions.selectRow", { payee: label || t("transactions.payee") })}
      accessibilityState={{ checked }}
      aria-checked={checked}
      onPress={onPress}
      style={styles.checkboxBox}
    >
      {checked ? <View style={styles.checkboxMark} /> : null}
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { flex: 1 },
  list: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.subtleFill,
    borderBottomWidth: hairline.width,
    borderBottomColor: theme.hairline,
  },
  headerLabel: { color: theme.textMuted, ...text.ui("caption", 600) },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: touchTarget.min,
    borderBottomWidth: hairline.width,
    borderBottomColor: theme.hairline,
  },
  rowActive: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: -focus.width,
  },
  rowSelected: { backgroundColor: theme.accentFill },
  rowBody: { flex: 1, flexDirection: "row", alignItems: "center" },
  cell: { paddingVertical: space.sm, paddingHorizontal: space.md },
  cellText: { color: theme.text, ...text.ui("bodySm") },
  cellTextMuted: { color: theme.textMuted, ...text.ui("bodySm") },
  checkboxCell: { width: CHECKBOX_WIDTH, alignItems: "center", justifyContent: "center" },
  dateCell: {
    width: DATE_WIDTH,
    color: theme.textMuted,
    fontVariant: [...tabularNums],
  },
  flexCell: { flex: 1 },
  scopeCell: { width: SCOPE_WIDTH },
  amountCell: { width: AMOUNT_WIDTH, alignItems: "flex-end" },
  empty: { flex: 1, padding: space.x4 },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: radius.xs,
    borderWidth: 1.5,
    borderColor: theme.borderInteractive,
    backgroundColor: theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxMark: {
    width: 10,
    height: 5,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: theme.accent,
    transform: [{ rotate: "-45deg" }],
    marginTop: -1,
  },
}));
