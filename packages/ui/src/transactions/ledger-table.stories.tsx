/**
 * `LedgerTable` — S10 §3 (web ≥1024px), a month scanned rather than scrolled.
 *
 * **These stories run the shipped algorithms, not a copy of them** (DESK3
 * review round 1, M). They used to restate the sort cycle, the comparator
 * and the shift-click range by hand — which made `SortedByAmount` and
 * `RangeSelected` two screenshots certifying *the story file's* logic while
 * looking exactly like proof of the component's. `sortRows`,
 * `cycleSortState` and `selectableRange` live in `@waltning/core/ledger-
 * table` — the one package both `packages/client` and `packages/ui` already
 * depend on, since the two are siblings on the architecture floor and
 * neither may import the other — so the stories below call the identical
 * functions `useLedgerTableSort` and `useLedgerTableSelection` wrap, through
 * `ledger-table.tsx`'s own `sortLedgerTableRows` (the one place a column
 * becomes a sort key). What is left restated is only the `useState` those
 * two hooks hold, which is what a screen supplies and a story must therefore
 * stand in for.
 *
 * **No thousand-row story.** The gate task's own performance claim is
 * `packages/core/src/ledger-table.perf.test.ts`'s and the desk screen's own
 * thousand-row render test's job — a real `FlatList` mounted a
 * thousand rows tall inside Storybook's auto-height harness grows without
 * ever settling, which is `visual/stories.spec.ts`'s screenshot-stability
 * wait timing out on an image that never stops changing size. A real desk
 * screen never hits this: the device's own fixed viewport is the bound
 * `<GroundPanel>` inherits, which `frame`'s fixed `height` below restores
 * for every other story here.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { cycleSortState, selectableRange } from "@waltning/core/ledger-table";
import * as money from "@waltning/core/money";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { EmptyState } from "../states/empty-state";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";
import { CategorizeSelectionConfirm } from "./categorize-selection-confirm";
import { LedgerSelectionBar } from "./ledger-selection-bar";
import {
  LedgerTable,
  type LedgerTableColumn,
  type LedgerTableRow,
  type LedgerTableSelection,
  type LedgerTableSortState,
  sortLedgerTableRows,
} from "./ledger-table";

const PAYEES = [
  "Corner Bakery",
  "Rewe",
  "Monthly invoice",
  "Cash withdrawal",
  "Electric co-op",
  "Gym membership",
  "Bookshop",
  "Pharmacy",
  "Ride share",
  "Streaming service",
];
const CATEGORIES = ["Eating out", "Groceries", "Consulting", "Utilities", "Health", "Leisure"];
const ACCOUNTS = ["Bank A · PLN", "Cash", "Bank B · EUR"];
const SCOPES = ["Mine", "Shared", "Business"];

function generateRows(count: number): LedgerTableRow[] {
  const rows: LedgerTableRow[] = [];
  for (let i = 0; i < count; i++) {
    const day = 28 - (i % 28);
    const month = i % 28 < 14 ? "08" : "07";
    // A decimal string from the start — `CLAUDE.md`'s money rule holds in a
    // story fixture too, and `toFixed` on a float is the shape it bans.
    const cents = String(((i * 37) % 95000) + 550).padStart(3, "0");
    const amount = `${cents.slice(0, -2)}.${cents.slice(-2)}`;
    const isExpense = i % 5 !== 0;
    // Every sixth row is a transfer — `transactions_category_shape` gives it
    // no checkbox, which is what makes `RangeSelected` a real test of H6's
    // "the range skips it" rather than a fixture where every row is alike.
    const isTransfer = i % 6 === 5;
    rows.push({
      id: `row-${i}`,
      date: `2026-${month}-${String(day).padStart(2, "0")}`,
      payee: PAYEES[i % PAYEES.length] ?? "",
      category: CATEGORIES[i % CATEGORIES.length] ?? "",
      account: ACCOUNTS[i % ACCOUNTS.length] ?? "",
      scope: SCOPES[i % SCOPES.length] ?? "",
      amountValue: money.toMoney(isExpense ? `-${amount}` : amount),
      // Two currencies, on purpose — the amount sort groups by currency
      // before it compares amounts (H3), so a single-currency fixture would
      // screenshot a sort whose defining property never showed.
      currency: i % 4 === 3 ? "EUR" : "PLN",
      decimals: 2,
      type: isTransfer ? "transfer" : isExpense ? "expense" : "income",
      isBusiness: i % 7 === 0,
      selectable: !isTransfer,
    });
  }
  return rows;
}

const FORTY_ROWS = generateRows(40);

/**
 * Rows 3 through 9 as a shift-click would actually resolve them — through
 * `selectableRange`, so the transfer inside the span is skipped rather than
 * painted selected with no checkbox to unselect it (H6). `?? []` covers the
 * impossible branch where an id is not in its own fixture.
 */
const PRESELECTED_RANGE =
  selectableRange(FORTY_ROWS, FORTY_ROWS[2]?.id ?? "", FORTY_ROWS[8]?.id ?? "") ?? [];

type DemoTableProps = { rows: readonly LedgerTableRow[]; initialSelected?: readonly string[] };

function DemoTable({ rows, initialSelected = [] }: DemoTableProps) {
  const styles = useStyles();
  const [sort, setSort] = useState<LedgerTableSortState>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set(initialSelected));
  const [anchorId, setAnchorId] = useState<string | null>(null);

  const sorted = useMemo(() => sortLedgerTableRows(rows, sort), [rows, sort]);

  const onSortColumn = useCallback((column: LedgerTableColumn) => {
    setSort((current) => cycleSortState(current, column));
  }, []);

  const toggleRow = useCallback(
    (id: string, rangeExtend: boolean) => {
      if (rangeExtend && anchorId !== null) {
        const range = selectableRange(sorted, anchorId, id);
        if (range !== null) {
          setSelectedIds(new Set(range));
          return;
        }
      }
      setSelectedIds((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setAnchorId(id);
    },
    [anchorId, sorted],
  );

  const selection: LedgerTableSelection = useMemo(
    () => ({
      selectedIds,
      isSelected: (id) => selectedIds.has(id),
      toggleRow,
      clear: () => setSelectedIds(new Set()),
      count: selectedIds.size,
    }),
    [selectedIds, toggleRow],
  );

  const handleOpenRow = useCallback((id: string) => {
    console.log("open", id);
  }, []);

  return (
    <View style={styles.frame}>
      <LedgerSelectionBar count={selection.count} onCategorize={noop} onClear={selection.clear} />
      <LedgerTable
        rows={sorted}
        sort={sort}
        onSortColumn={onSortColumn}
        selection={selection}
        onOpenRow={handleOpenRow}
      />
    </View>
  );
}

function noop() {}

const EMPTY_SELECTION: LedgerTableSelection = {
  selectedIds: new Set(),
  isSelected: () => false,
  toggleRow: noop,
  clear: noop,
  count: 0,
};

const meta = {
  title: "Transactions/LedgerTable",
  component: LedgerTable,
  // Every story below renders through its own `render`, ignoring these —
  // present only because `StoryObj` requires `args` covering every one of
  // `LedgerTable`'s required props when `meta` declares none of its own.
  args: {
    rows: FORTY_ROWS,
    sort: null,
    onSortColumn: noop,
    selection: EMPTY_SELECTION,
    onOpenRow: noop,
  },
} satisfies Meta<typeof LedgerTable>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Forty rows — S10 §3's own density claim: "scanned, not scrolled." */
export const Populated: Story = {
  render: () => <DemoTable rows={FORTY_ROWS} />,
};

/**
 * Sorted by amount, ascending — the header click cycle from a clean start,
 * over the shipped `sortLedgerTableRows`. The fixture holds two currencies, so
 * this screenshots the real grouping (EUR block, then PLN) and the header's
 * own "by currency" caption that states it (H3).
 */
export const SortedByAmount: Story = {
  render: () => {
    const [sort, setSort] = useState<LedgerTableSortState>({ column: "amount", direction: "asc" });
    const sorted = useMemo(() => sortLedgerTableRows(FORTY_ROWS, sort), [sort]);
    const onSortColumn = useCallback((column: LedgerTableColumn) => {
      setSort((current) => cycleSortState(current, column));
    }, []);
    const selection: LedgerTableSelection = useMemo(
      () => ({
        selectedIds: new Set(),
        isSelected: () => false,
        toggleRow: noop,
        clear: noop,
        count: 0,
      }),
      [],
    );
    return (
      <LedgerTable
        rows={sorted}
        sort={sort}
        onSortColumn={onSortColumn}
        selection={selection}
        onOpenRow={noop}
      />
    );
  },
};

/** A filter that excludes every row — the table's own empty treatment, driven by the caller's `emptyState`. */
export const FilteredToEmpty: Story = {
  render: () => {
    const selection: LedgerTableSelection = {
      selectedIds: new Set(),
      isSelected: () => false,
      toggleRow: noop,
      clear: noop,
      count: 0,
    };
    return (
      <LedgerTable
        rows={[]}
        sort={null}
        onSortColumn={noop}
        selection={selection}
        onOpenRow={noop}
        emptyState={
          <EmptyState
            variant="filtered"
            title="No matching transactions"
            body="This filter is excluding every row."
            count={412}
            primaryAction={{ label: "Clear filters", onPress: noop }}
          />
        }
      />
    );
  },
};

/**
 * A shift-click range, pre-selected — rows 3 through 9 of the populated set,
 * resolved by the shipped `selectableRange`, which skips a non-selectable
 * row inside the span rather than painting it selected with no checkbox (H6).
 */
export const RangeSelected: Story = {
  render: () => <DemoTable rows={FORTY_ROWS} initialSelected={PRESELECTED_RANGE} />,
};

/** "Categorise n selected" behind one confirm — S10 §7 web. */
export const CategorizeConfirm: Story = {
  render: () => {
    const styles = useStyles();
    // Selectable rows only — a transfer painted "selected" with no checkbox
    // to unselect it is the exact dead end H6 named.
    const selectedRows = FORTY_ROWS.filter((row) => row.selectable).slice(2, 6);
    const selection: LedgerTableSelection = {
      selectedIds: new Set(selectedRows.map((row) => row.id)),
      isSelected: (id) => selectedRows.some((row) => row.id === id),
      toggleRow: noop,
      clear: noop,
      count: selectedRows.length,
    };
    return (
      <View style={styles.frame}>
        <LedgerSelectionBar count={selection.count} onCategorize={noop} onClear={noop} />
        <CategorizeSelectionConfirm
          count={selection.count}
          categoryName="Eating out"
          fromCategories={["Groceries", "Uncategorised"]}
          alreadyMatching={1}
          state="pending"
          onApprove={noop}
          onDecline={noop}
        />
        <LedgerTable
          rows={FORTY_ROWS}
          sort={null}
          onSortColumn={noop}
          selection={selection}
          onOpenRow={noop}
        />
      </View>
    );
  },
};

const useStyles = makeStyles(() => ({
  // A fixed height, not `minHeight` — `FlatList` virtualises against its own
  // *bounded* viewport, and an auto-growing container (Storybook's default)
  // gives it no bound to measure against: `OneThousandRows` mounted more and
  // more of its 1,000 rows on every layout pass chasing a height that kept
  // changing, which is `visual/stories.spec.ts`'s own screenshot-stability
  // wait timing out on an image that never stopped growing. A real desk
  // screen never has this problem — the device's own fixed viewport is the
  // bound `<GroundPanel>` inherits — so this is a story-harness fix, not a
  // change to the component.
  frame: { flex: 1, height: 640, gap: space.md },
}));
