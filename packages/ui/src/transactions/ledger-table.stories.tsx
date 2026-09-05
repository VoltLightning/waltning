/**
 * `LedgerTable` — S10 §3 (web ≥1024px), a month scanned rather than scrolled.
 *
 * **`useLedgerTableSort`/`useLedgerTableSelection` are not imported here.**
 * They live in `@waltning/client`, which `packages/ui` may not depend on
 * (the architecture floor: siblings, neither imports the other) — every
 * interactive story below wires the same three-state cycle and shift-click
 * range logic by hand, in `useState`, the way a real screen wires the real
 * hooks. The stories exercise the component's contract; the hooks' own
 * behaviour is `use-ledger-table-sort.test.ts` and `use-ledger-table-
 * selection.test.ts`'s job.
 *
 * **No thousand-row story.** The gate task's own performance claim is
 * `ledger-table-sort.perf.test.ts`'s job — a real `FlatList` mounted a
 * thousand rows tall inside Storybook's auto-height harness grows without
 * ever settling, which is `visual/stories.spec.ts`'s screenshot-stability
 * wait timing out on an image that never stops changing size. A real desk
 * screen never hits this: the device's own fixed viewport is the bound
 * `<GroundPanel>` inherits, which `frame`'s fixed `height` below restores
 * for every other story here.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
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
    const amount = ((i * 37) % 950) + 5.5;
    const isExpense = i % 5 !== 0;
    rows.push({
      id: `row-${i}`,
      date: `2026-${month}-${String(day).padStart(2, "0")}`,
      payee: PAYEES[i % PAYEES.length] ?? "",
      category: CATEGORIES[i % CATEGORIES.length] ?? "",
      account: ACCOUNTS[i % ACCOUNTS.length] ?? "",
      scope: SCOPES[i % SCOPES.length] ?? "",
      amountValue: money.toMoney(isExpense ? `-${amount.toFixed(2)}` : amount.toFixed(2)),
      currency: "PLN",
      decimals: 2,
      type: isExpense ? "expense" : "income",
      isBusiness: i % 7 === 0,
      selectable: true,
    });
  }
  return rows;
}

const FORTY_ROWS = generateRows(40);

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The same three-state cycle `use-ledger-table-sort.ts` implements — restated for the story. */
function nextSort(current: LedgerTableSortState, column: LedgerTableColumn): LedgerTableSortState {
  if (current === null || current.column !== column) return { column, direction: "asc" };
  if (current.direction === "asc") return { column, direction: "desc" };
  return null;
}

function sortRows(rows: readonly LedgerTableRow[], sort: LedgerTableSortState): LedgerTableRow[] {
  if (sort === null) return [...rows];
  const sign = sort.direction === "asc" ? 1 : -1;
  const column = sort.column;
  return [...rows].sort((a, b) => {
    const primary =
      column === "amount"
        ? money.cmp(a.amountValue, b.amountValue)
        : compareStrings(a[column], b[column]);
    return primary !== 0 ? primary * sign : compareStrings(a.id, b.id);
  });
}

type DemoTableProps = { rows: readonly LedgerTableRow[]; initialSelected?: readonly string[] };

function DemoTable({ rows, initialSelected = [] }: DemoTableProps) {
  const styles = useStyles();
  const [sort, setSort] = useState<LedgerTableSortState>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set(initialSelected));
  const [anchorId, setAnchorId] = useState<string | null>(null);

  const sorted = useMemo(() => sortRows(rows, sort), [rows, sort]);

  const onSortColumn = useCallback((column: LedgerTableColumn) => {
    setSort((current) => nextSort(current, column));
  }, []);

  const toggleRow = useCallback(
    (id: string, rangeExtend: boolean) => {
      if (rangeExtend && anchorId !== null) {
        const ids = sorted.map((row) => row.id);
        const a = ids.indexOf(anchorId);
        const b = ids.indexOf(id);
        if (a !== -1 && b !== -1) {
          const [start, end] = a <= b ? [a, b] : [b, a];
          setSelectedIds(new Set(ids.slice(start, end + 1)));
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

/** Sorted by amount, ascending — the header click cycle from a clean start. */
export const SortedByAmount: Story = {
  render: () => {
    const [sort, setSort] = useState<LedgerTableSortState>({ column: "amount", direction: "asc" });
    const sorted = useMemo(() => sortRows(FORTY_ROWS, sort), [sort]);
    const onSortColumn = useCallback((column: LedgerTableColumn) => {
      setSort((current) => nextSort(current, column));
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

/** A shift-click range, pre-selected — rows 3 through 9 of the populated set. */
export const RangeSelected: Story = {
  render: () => (
    <DemoTable rows={FORTY_ROWS} initialSelected={FORTY_ROWS.slice(2, 9).map((row) => row.id)} />
  ),
};

/** "Categorise n selected" behind one confirm — S10 §7 web. */
export const CategorizeConfirm: Story = {
  render: () => {
    const styles = useStyles();
    const selectedRows = FORTY_ROWS.slice(2, 6);
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
