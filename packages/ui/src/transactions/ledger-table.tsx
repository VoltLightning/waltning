/**
 * `<LedgerTable>` — S10 §3 (web ≥1024px): "Table, not cards" — date · payee ·
 * category · account · scope · amount, sortable by header, dense enough that
 * a month is scanned rather than scrolled.
 *
 * **A plain `FlatList`, on purpose.** The phone list next door is the first
 * data point for what a virtualised list of these rows costs, and this is
 * the second — neither is the answer to a thousand-row table's own risk, and
 * `packages/core/src/ledger-table.perf.test.ts` measures the comparator
 * rather than the mount, which is the honest limit of what is proven.
 * `initialNumToRender` is set from `rows.length` (capped) so a
 * populated story and a modest real ledger page both mount in full; a
 * thousand-row page still virtualises the ordinary `FlatList` way — windowed,
 * growing as the list scrolls — which is a real, load-bearing trade rather
 * than a limitation of the stories that exercise it.
 *
 * **Sorting and selection are owned by the caller.** `rows` arrives already
 * sorted and filtered (this file's own `sortLedgerTableRows`, over
 * `@waltning/core/ledger-table`'s `sortRows`, and `useTransactionSearch`) and
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
 * **One tab stop inside the table, plus the header cells.** Every
 * `Pressable` `react-native-web` renders is tab-focusable by default, and
 * its `PressResponder` fires a press for `Enter` and then calls
 * `stopPropagation()` — so with row bodies and checkboxes in the tab order
 * there were three separate answers to "which row is current": the ring,
 * whichever row body held focus, and whichever checkbox did. Tab into row 1,
 * press `j` twice to ring row 3, press `Enter`, and row **1** opened.
 *
 * The row body and the checkbox both take `tabIndex={-1}`, leaving the
 * scroller as the single tab stop *inside the table body*. Both stay
 * clickable and stay named for a screen reader; only the tab stop moves.
 * `tabIndex`, not `focusable={false}`: `react-native-web`'s `Pressable`
 * writes `tabIndex` itself from its own `disabled` prop unless one is
 * passed, which overrides `focusable` outright (`Pressable/index.js`'s
 * `_tabIndex`), and `focusable` warns as deprecated besides.
 *
 * **`tabIndex={-1}` takes an element out of the tab order, not out of the
 * document** (M1, round 3), and that half was the part left undone. A click
 * still focuses a `tabIndex={-1}` element, so after checking one row's
 * checkbox with the mouse, DOM focus sits on that checkbox — and `Enter`
 * there never reached the container at all: `PressResponder.onKeyDown` fires
 * for `Enter` on the focused element and calls `stopPropagation()`. Walk to
 * row 3 with `j`, press `Enter`, and row **1** opened, under a ring drawn
 * on row 3.
 *
 * So the ring is made the only answer twice over, on both halves of the
 * event:
 *
 * - **The row body and the checkbox handle `onKeyDown` themselves and hand
 *   the event to the table's own handler** — only for the keys
 *   `PressResponder` would otherwise have swallowed on *that* element, which
 *   is not the same set for the two of them. `isValidKeyPress` is `Enter`
 *   anywhere, `Space` only on a `<button>` or a `role="button"`: so the row
 *   body delegates both and the checkbox delegates `Enter` alone.
 *   Everything else — `j`/`k`/`f`, `x`, and `Space` on the checkbox — is
 *   left to bubble to the scroller on its own. That condition is the whole
 *   correctness argument: delegating a key the responder does not swallow
 *   runs the table's handler twice for one press, which on `Space` meant
 *   toggling the ringed row and then untoggling it, so the key did nothing
 *   at all. `react-native-web`'s `Pressable` calls its own key handler
 *   first and then the one it was passed, so the delegate runs regardless
 *   of the `stopPropagation` above it.
 * - **The press that key would otherwise complete is cancelled**, and the
 *   two controls need two different cancellations because
 *   `react-native-web` renders them as two different elements.
 *   `accessibilityRole="button"` becomes a **native `<button>`**, so the
 *   browser itself fires a `click` for `Enter`: the delegate's own
 *   `preventDefault()` is what stops it, and that is the same call the
 *   handler already makes for every key it claims. The checkbox is a
 *   `<div role="checkbox">`, which the browser activates for nothing — there
 *   `PressResponder` completes the press itself, from a document-level
 *   `keyup` listener, so the press is refused instead (`isKeyboardPress`:
 *   a press whose event is a key event is the keyboard's, and the
 *   keyboard's answer to "which row" is the ring). Without both, `Enter`
 *   opens the ringed row *and* re-presses the focused one a moment later.
 *   A real pointer click carries a `click` event through neither path and is
 *   untouched.
 *
 * **The header cells stay in the tab order, and that is deliberate.** They
 * are the sort controls; reaching them with the keyboard is the whole
 * behaviour §7 asks for. `Enter` on a focused header cell sorts that column
 * and nothing else — the cells sit outside the scroller that carries
 * `onKeyDown`, so the event has no path to the row handler even before
 * `PressResponder` stops it.
 *
 * **`Space` (or `x`) selects the ringed row**, which is what makes
 * `categorize_batch` reachable without a mouse at all: `j`/`k` to walk,
 * `Space` to check, `Enter` to open. A row that carries no checkbox (a
 * transfer, an adjustment — `transactions_category_shape`) is skipped by
 * the key exactly as it is by the pointer.
 *
 * **The keys are matched case-insensitively.** `event.key` is `"J"` with
 * Shift held or Caps Lock on, and S10 §7 and the design card both *write*
 * these keys as capitals — a reader who types what the spec printed got
 * nothing at all before.
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
 * **The sort types come from `@waltning/core/ledger-table`; only the
 * selection shape is restated.** `packages/client` and `packages/ui` are
 * siblings on the architecture floor — neither depends on the other — so a
 * type both need lives in `core`, and `SortState`/`SortDirection` now do
 * (L3, round 2: they used to be declared twice, in two packages, with
 * nothing checking they agreed). `LedgerTableColumn` stays here because a
 * column is a rendered thing and `core` has no business naming one.
 * `LedgerTableSelection` is still restated: it is a bundle of callbacks, not
 * a value, and `TransactionType`'s own precedent (independently declared
 * here and in `create-phone-ledger.ts`) is the pattern — the two packages
 * agree on a structural shape, and TypeScript's structural typing makes the
 * boundary invisible to the screen that hands a client hook's result to this
 * prop.
 */

import { type SortKey, type SortState, sortRows } from "@waltning/core/ledger-table";
import type * as money from "@waltning/core/money";
import { Fragment, useCallback, useRef, useState } from "react";
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
import { BrandIcon } from "./brand-icon";
import { TRANSACTION_AMOUNT_KIND, type TransactionType } from "./transaction-row";

/**
 * The six columns this table draws. **Owned here, not in `core`** — a column
 * is a rendered thing with a header, a width and a label, and `core` deals
 * in row fields (`SortKey`) rather than in columns. `SORT_KEY` below is the
 * one-line map between the two vocabularies.
 */
export type LedgerTableColumn = "date" | "payee" | "category" | "account" | "scope" | "amount";
/** `null` — the caller's own order, untouched (`@waltning/core/ledger-table`'s own doc). */
export type LedgerTableSortState = SortState<LedgerTableColumn>;

export type LedgerTableRow = {
  id: string;
  date: string;
  payee: string;
  category: string;
  account: string;
  scope: string;
  /** A decimal `Money` string — the field `sortLedgerTableRows` orders the amount column on. */
  amountValue: money.Money;
  currency: string;
  decimals: number;
  type: TransactionType;
  isBusiness: boolean;
  /**
   * `SPEC.md` §14.4b, S10 §4 — the catalogue key this row resolved to
   * offline, or `null` when nothing matched.
   *
   * **Required, not optional, unlike `TransactionRow`'s own.** That prop is
   * optional so a caller which has not read the field yet draws no badge at
   * all rather than a fallback monogram it never asked for; this table has
   * exactly one caller (`apps/mobile/src/ledger-screen.tsx`), it reads the
   * field, and a row shape with a hole in it is how the phone list and the
   * desk table would drift apart on the same data.
   */
  brandKey: string | null;
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

/**
 * One column, one row field. Five of the six are the same word twice; the
 * sixth is the whole reason this map exists — the `amount` *column* draws a
 * figure with its currency, and the `"amount"` *key* tells
 * `@waltning/core/ledger-table` to compare the pair through
 * `compareByCurrencyThenAmount` rather than a lone decimal string.
 */
const SORT_KEY: Record<LedgerTableColumn, SortKey<LedgerTableRow>> = {
  date: "date",
  payee: "payee",
  category: "category",
  account: "account",
  scope: "scope",
  amount: "amount",
};

/**
 * `rows` in the order `sort` names, or `rows` itself when nothing is sorted.
 *
 * The one place a `LedgerTableColumn` becomes a `SortKey`. Exported because
 * both callers of this component sort before they render — the screen
 * (`apps/mobile/src/ledger-screen.tsx`) and the stories — and a second
 * hand-written copy of the ordering is exactly what moving the algorithm
 * into `core` set out to delete.
 */
export function sortLedgerTableRows(
  rows: readonly LedgerTableRow[],
  sort: LedgerTableSortState,
): readonly LedgerTableRow[] {
  if (sort === null) return rows;
  return sortRows(rows, SORT_KEY[sort.column], sort.direction);
}

/**
 * The DOM `keydown` `react-native-web` forwards. `View`'s React Native type
 * names no `onKeyDown` at all, so the shape is stated here once and used by
 * both the scroller's handler and each row's delegate rather than written
 * out twice.
 */
type TableKeyEvent = { key: string; preventDefault: () => void };

/** The bag that carries it onto a `View` or a `Pressable` — see `keyboardProps`. */
type TableKeyProps = { onKeyDown: (event: TableKeyEvent) => void };

/**
 * The keys `react-native-web`'s `PressResponder` treats as a press, and
 * therefore the keys it calls `stopPropagation()` on — which is what keeps
 * them from reaching the scroller by themselves, and the whole reason a row
 * delegates anything at all.
 *
 * **It is `isValidKeyPress` restated, `buttonLike` included.** That
 * predicate is `key === 'Enter' || (isSpacebar && isButtonish)`, where
 * `isButtonish` is a `<button>` element or `role="button"` — so `Enter` is
 * swallowed anywhere, and `Space` is swallowed only on the row body
 * (`accessibilityRole="button"`, a native `<button>`), never on the
 * checkbox (`<div role="checkbox">`).
 *
 * Getting that second half wrong is not a missing delegation, it is a
 * doubled one: `Space` on a focused checkbox bubbles to the scroller on its
 * own *and* was handed over by the delegate, so the ringed row was toggled
 * twice and the net effect of pressing `Space` was nothing at all. One
 * handler run per key press is the rule, and the condition for delegating
 * is exactly "the responder above me would otherwise have eaten this".
 *
 * `j`/`k`/`f` and `x` are swallowed by nothing and are delegated by nobody.
 *
 * **`"Spacebar"` — the legacy key name — is not matched here, because it
 * cannot arrive.** `react-native-web`'s own `isValidKeyPress` still accepts it
 * beside `" "`, which reads as a value this predicate has to accept too; but
 * every handler in this file is a React one, and React DOM normalises a
 * synthetic keyboard event's `key` through its own table before any handler
 * sees it — `normalizeKey` maps `Spacebar` to `" "`, alongside `Esc`, `Left`
 * and the rest of the legacy names (`react-dom` 19.2.3). So does the
 * responder's own `onKeyDown`, which `Pressable` calls with that same
 * synthetic event just before this one. The two predicates are handed the
 * identical string and cannot disagree.
 *
 * The legacy name survives only on the raw `keyup` `PressResponder` listens
 * for at the document, which is a native event and never reaches this file —
 * `isKeyboardPress` refuses that press by event type, whatever its key says.
 * A branch for `"Spacebar"` here would be unreachable code that looks like a
 * guarantee; the two tests named for it assert what actually happens, so they
 * go red if that ever stops being true.
 */
function isDelegatedKey(key: string, buttonLike: boolean): boolean {
  if (key === "Enter") return true;
  return buttonLike && key === " ";
}

/**
 * Whether this press is one `react-native-web` synthesised from a key rather
 * than from a pointer.
 *
 * `PressResponder` starts a press on `keydown` and *completes* it from a
 * document-level `keyup` listener, calling `onPress` with that raw
 * `KeyboardEvent`; a real click arrives as a React synthetic `click`. So the
 * event's own `type` is the whole test. Without it, `Enter` on a focused row
 * would do two things at once: the delegate opens the ringed row on
 * `keydown`, and this press opens the *focused* one a moment later on
 * `keyup` (M1, round 3).
 *
 * `type` is on `BaseSyntheticEvent`, which `GestureResponderEvent` extends —
 * no cast, and no `unknown`: it is one of the few members that is honestly
 * declared on both sides of this seam.
 */
function isKeyboardPress(event: GestureResponderEvent): boolean {
  return event.type === "keyup" || event.type === "keydown";
}

/**
 * Note on where this is *not* needed: the row body is a native `<button>`
 * (`react-native-web` renders `accessibilityRole="button"` as one), so
 * `PressResponder`'s `keyup` path deliberately stands aside for it —
 * `isNativeInteractiveElement` — and the press arrives as the browser's own
 * `click` instead. Refusing that by event type would refuse real clicks too;
 * the delegate's `preventDefault()` on the `keydown` is what stops the
 * activation before a `click` exists at all.
 */

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
/** The `BrandIcon` column — a 20px badge centred, with the header holding the same width open. */
const BRAND_WIDTH = 28;
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
   * `Space` / `x` — the keyboard's own checkbox. `rangeExtend` is false
   * unconditionally: a range needs an anchor and a target, and one key press
   * on one ringed row is a plain toggle in every list that has this gesture.
   */
  const handleToggleActive = useCallback(() => {
    if (activeId === null) return;
    const row = rowsRef.current.find((candidate) => candidate.id === activeId);
    if (row === undefined || !row.selectable) return;
    selection.toggleRow(activeId, false);
  }, [activeId, selection]);

  /**
   * Every key the table answers to, wherever inside it the key was pressed
   * — the scroller has it as `onKeyDown`, and each row hands over the two
   * keys `react-native-web` would otherwise swallow (the file doc's own
   * "one tab stop" paragraphs).
   */
  const handleTableKeyDown = useCallback(
    (event: TableKeyEvent) => {
      // `Enter` is matched before the fold — it is the one key here whose
      // own name is more than one character, and lowercasing it would make
      // it collide with nothing but read as if it might.
      if (event.key === "Enter") {
        event.preventDefault();
        handleOpenActive();
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "j") {
        event.preventDefault();
        moveActive(1);
      } else if (key === "k") {
        event.preventDefault();
        moveActive(-1);
      } else if (key === " " || key === "x") {
        // `preventDefault` before anything else — `Space` scrolls the
        // nearest scroller by default, and the nearest scroller is this
        // table, so the ring would leave the viewport as it was checked.
        event.preventDefault();
        handleToggleActive();
      } else if (key === "f" || key === "/") {
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
    [handleOpenActive, moveActive, handleToggleActive, onFocusRail],
  );

  /**
   * `View`'s React Native type has no `onKeyDown` — the file doc explains
   * why this stays a separately-typed prop bag rather than a literal JSX
   * attribute the stricter type would refuse.
   */
  const keyboardProps: TableKeyProps = { onKeyDown: handleTableKeyDown };

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
        onKeyDown={handleTableKeyDown}
      />
    ),
    [activeId, selection, handlePressRow, handleToggleSelect, handleTableKeyDown],
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
        <Fragment key={column}>
          <LedgerTableHeaderCell column={column} sort={sort} onSortColumn={onSortColumn} />
          {/* The brand badge's own width, held open in the header so the
              four columns after it line up with their body cells — see the
              row's `brandCell` comment. Unlabelled, like the checkbox
              column: a mark has no header word of its own, and `Payee`
              already names the identity column it leads into. */}
          {column === "date" ? <View style={styles.brandCell} /> : null}
        </Fragment>
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
  /**
   * The amount column groups by currency before it compares amounts
   * (`@waltning/core/ledger-table`'s own `compareByCurrencyThenAmount` —
   * H3, round 1),
   * because 200 EUR and 200 PLN are not two figures on one axis. That is a
   * surprising order to meet undeclared, so while the column is sorted the
   * header says which order it is in. `accessibilityLabel` stays the bare
   * column name — the sort order is a caption, not a second control.
   */
  const orderNote = active && column === "amount" ? t("transactions.sortedByCurrency") : null;

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
      {orderNote === null ? null : <Text style={styles.headerNote}>{orderNote}</Text>}
    </Pressable>
  );
}

type LedgerTableRowViewProps = {
  row: LedgerTableRow;
  active: boolean;
  selected: boolean;
  onPress: (id: string) => void;
  onToggleSelect: (id: string, event: { shiftKey?: boolean }) => void;
  /** The table's own key handler — see `isDelegatedKey` and the file doc. */
  onKeyDown: (event: TableKeyEvent) => void;
};

function LedgerTableRowView({
  row,
  active,
  selected,
  onPress,
  onToggleSelect,
  onKeyDown,
}: LedgerTableRowViewProps) {
  const styles = useStyles();
  const handlePress = useCallback(() => onPress(row.id), [onPress, row.id]);
  /**
   * Two delegates, because the row holds two elements the responder treats
   * differently (`isDelegatedKey`). The row body is a native `<button>`, so
   * `Enter` *and* `Space` are swallowed there and both are handed over; the
   * checkbox is a `<div role="checkbox">`, where only `Enter` is — `Space`
   * bubbles to the scroller by itself, and delegating it too would run the
   * table's handler twice for one press and toggle the ringed row back to
   * where it started. Everything else is left alone in both.
   */
  const handleBodyKeyDown = useCallback(
    (event: TableKeyEvent) => {
      if (isDelegatedKey(event.key, true)) onKeyDown(event);
    },
    [onKeyDown],
  );
  const handleCheckboxKeyDown = useCallback(
    (event: TableKeyEvent) => {
      if (isDelegatedKey(event.key, false)) onKeyDown(event);
    },
    [onKeyDown],
  );
  // Prop bags, not JSX attributes — `Pressable`'s React Native type declares
  // no `onKeyDown` even though `react-native-web` forwards one
  // (`threshold-slider.tsx`'s own precedent, and this file's `keyboardProps`
  // above).
  const bodyKeyboardProps: TableKeyProps = { onKeyDown: handleBodyKeyDown };
  const checkboxKeyboardProps: TableKeyProps = { onKeyDown: handleCheckboxKeyDown };
  // The one narrow `unknown` step this file needs — the file doc explains
  // why: `GestureResponderEvent` genuinely carries `shiftKey` on web, but
  // its type does not say so, and `unknown` is the sanctioned way through a
  // seam like that (`CLAUDE.md`: "a loose type at a seam is where contracts
  // leak" — the leak is in `react-native`'s own type, not this file's).
  const handleToggle = useCallback(
    (event: GestureResponderEvent) => {
      // `Enter`/`Space` on this checkbox are answered by the table's own
      // handler, on the ringed row. `PressResponder` would complete a second
      // press here on `keyup` — naming this row rather than the ringed one —
      // and unlike the row body there is no native activation to
      // `preventDefault` away (see `isKeyboardPress`).
      if (isKeyboardPress(event)) return;
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
          <LedgerRowCheckbox
            checked={selected}
            label={row.payee}
            onPress={handleToggle}
            keyboardProps={checkboxKeyboardProps}
          />
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={row.payee || row.account}
        // The file doc's own "one tab stop" paragraph — the container holds
        // focus, `activeId` holds the ring, and there is only ever one
        // "current row" between them. `tabIndex`, not `focusable={false}`:
        // `react-native-web`'s `Pressable` writes `tabIndex` itself from its
        // own `disabled` prop unless one is passed, which overrides
        // `focusable` outright (`Pressable/index.js`'s `_tabIndex`) — and
        // `focusable` warns as deprecated besides.
        tabIndex={-1}
        onPress={handlePress}
        {...bodyKeyboardProps}
        style={styles.rowBody}
      >
        <Text style={[styles.cellText, styles.dateCell]}>{row.date.slice(5)}</Text>
        {/*
          §14.4b, S10 §4 — the same `BrandIcon` and the same catalogue
          `TransactionRow` draws on the phone, in the identity column, ahead
          of the payee it belongs to. `size={20}`, the "widget" size, rather
          than the row's own 24: this is a `bodySm` table row, and a 24px
          badge is taller than the text beside it.

          Passed unconditionally, never `brandKey === undefined ? null : …`
          — that branch exists on `TransactionRow` for a caller which has not
          read the field yet, and `LedgerTableRow.brandKey` is required, so
          there is no such caller here. An unmatched payee gets the monogram
          fallback, which is what "never blank" means.

          **Its own fixed-width cell, with an empty twin in the header.**
          Every other column is fixed or `flex: 1` in both rows, so a badge
          added to the body alone would take its width out of the three
          flexible columns and slide `category`, `account`, `scope` and
          `amount` left of the headers that name them.
        */}
        <View style={styles.brandCell}>
          <BrandIcon brandKey={row.brandKey} payee={row.payee} size={20} />
        </View>
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
  /** `Enter`/`Space` handed back to the table — see the file doc (M1, round 3). */
  keyboardProps: TableKeyProps;
};

/**
 * A bare selection box — not `primitives/checkbox.tsx`'s `<Checkbox>`, which
 * always renders a visible label beside its box (`copy`'s own `flex: 1`).
 * That is right for a settings list and wrong for a 32px table column; this
 * carries the same accessible name through `accessibilityLabel` instead of
 * a rendered one, and draws the same two-bar mark `Checkbox`'s own doc
 * describes, at table density rather than row density.
 */
function LedgerRowCheckbox({ checked, label, onPress, keyboardProps }: LedgerRowCheckboxProps) {
  const t = useT();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={t("transactions.selectRow", { payee: label || t("transactions.payee") })}
      accessibilityState={{ checked }}
      aria-checked={checked}
      // Out of the tab order with the row body — see the file doc's "one tab
      // stop" paragraph. `Space` on the ringed row is what replaces tabbing
      // to this control, and it does not move focus off the scroller.
      tabIndex={-1}
      onPress={onPress}
      {...keyboardProps}
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
  headerNote: { color: theme.textMuted, ...text.ui("caption") },
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
  brandCell: { width: BRAND_WIDTH, alignItems: "center", justifyContent: "center" },
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
