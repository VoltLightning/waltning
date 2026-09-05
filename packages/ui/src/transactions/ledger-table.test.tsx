/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import * as money from "@waltning/core/money";
import { describe, expect, it, vi } from "vitest";
import { LedgerTable, type LedgerTableRow, type LedgerTableSelection } from "./ledger-table";

function row(overrides: Partial<LedgerTableRow> & { id: string }): LedgerTableRow {
  return {
    date: "2026-08-24",
    payee: "Corner Bakery",
    category: "Eating out",
    account: "Cash",
    scope: "Mine",
    amountValue: money.toMoney("-48.90"),
    currency: "PLN",
    decimals: 2,
    type: "expense",
    isBusiness: false,
    selectable: true,
    ...overrides,
  };
}

function selectionOf(selectedIds: readonly string[] = []): LedgerTableSelection {
  const set = new Set(selectedIds);
  return {
    selectedIds: set,
    isSelected: (id) => set.has(id),
    toggleRow: vi.fn(),
    clear: vi.fn(),
    count: set.size,
  };
}

const ROWS: LedgerTableRow[] = [
  row({ id: "1", payee: "Corner Bakery", date: "2026-08-24" }),
  row({ id: "2", payee: "Rewe", date: "2026-08-23", category: "Groceries" }),
  row({
    id: "3",
    payee: "",
    date: "2026-08-22",
    type: "transfer",
    selectable: false,
    scope: "Mine",
  }),
];

function noop() {}

describe("LedgerTable", () => {
  it("renders every row's date, payee, category, account, scope and amount", () => {
    render(
      <LedgerTable
        rows={ROWS}
        sort={null}
        onSortColumn={noop}
        selection={selectionOf()}
        onOpenRow={noop}
      />,
    );

    expect(screen.getByText("Corner Bakery")).toBeDefined();
    expect(screen.getByText("Rewe")).toBeDefined();
    expect(screen.getByText("Groceries")).toBeDefined();
    expect(screen.getAllByText("Cash").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Mine").length).toBeGreaterThan(0);
  });

  it("clicking a column header asks the caller to sort by it", () => {
    const onSortColumn = vi.fn();
    render(
      <LedgerTable
        rows={ROWS}
        sort={null}
        onSortColumn={onSortColumn}
        selection={selectionOf()}
        onOpenRow={noop}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Payee" }));
    expect(onSortColumn).toHaveBeenCalledWith("payee");
  });

  it("shows a sort indicator only on the active column", () => {
    render(
      <LedgerTable
        rows={ROWS}
        sort={{ column: "amount", direction: "asc" }}
        onSortColumn={noop}
        selection={selectionOf()}
        onOpenRow={noop}
      />,
    );

    expect(screen.getByText("Amount ↑")).toBeDefined();
  });

  it("clicking a row opens it", () => {
    const onOpenRow = vi.fn();
    render(
      <LedgerTable
        rows={ROWS}
        sort={null}
        onSortColumn={noop}
        selection={selectionOf()}
        onOpenRow={onOpenRow}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Corner Bakery" }));
    expect(onOpenRow).toHaveBeenCalledWith("1");
  });

  it("renders no checkbox for a row that cannot join a batch categorize", () => {
    render(
      <LedgerTable
        rows={ROWS}
        sort={null}
        onSortColumn={noop}
        selection={selectionOf()}
        onOpenRow={noop}
      />,
    );

    // Two selectable rows (Corner Bakery, Rewe), one transfer that is not.
    expect(screen.getAllByRole("checkbox").length).toBe(2);
  });

  it("an ordinary checkbox click toggles without a range", () => {
    const selection = selectionOf();
    render(
      <LedgerTable
        rows={ROWS}
        sort={null}
        onSortColumn={noop}
        selection={selection}
        onOpenRow={noop}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Corner Bakery" }));
    expect(selection.toggleRow).toHaveBeenCalledWith("1", false);
  });

  it("a shift-click on the checkbox reports the range extend", () => {
    const selection = selectionOf();
    render(
      <LedgerTable
        rows={ROWS}
        sort={null}
        onSortColumn={noop}
        selection={selection}
        onOpenRow={noop}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Rewe" }), { shiftKey: true });
    expect(selection.toggleRow).toHaveBeenCalledWith("2", true);
  });

  it("a selected row's checkbox reflects the selection", () => {
    render(
      <LedgerTable
        rows={ROWS}
        sort={null}
        onSortColumn={noop}
        selection={selectionOf(["2"])}
        onOpenRow={noop}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "Select Rewe" }).getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(
      screen.getByRole("checkbox", { name: "Select Corner Bakery" }).getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("renders the caller's empty state and no rows when there are none", () => {
    render(
      <LedgerTable
        rows={[]}
        sort={null}
        onSortColumn={noop}
        selection={selectionOf()}
        onOpenRow={noop}
        emptyState={<span>Nothing here</span>}
      />,
    );

    expect(screen.getByText("Nothing here")).toBeDefined();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  describe("keyboard — J/K move, Enter opens, F asks for the rail", () => {
    function renderTable(onOpenRow = vi.fn(), onFocusRail = vi.fn()) {
      render(
        <LedgerTable
          rows={ROWS}
          sort={null}
          onSortColumn={noop}
          selection={selectionOf()}
          onOpenRow={onOpenRow}
          onFocusRail={onFocusRail}
        />,
      );
      return screen.getByTestId("ledger-table-scroller");
    }

    it("J moves to the first row, then Enter opens it", () => {
      const onOpenRow = vi.fn();
      const container = renderTable(onOpenRow);

      fireEvent.keyDown(container, { key: "j" });
      fireEvent.keyDown(container, { key: "Enter" });
      expect(onOpenRow).toHaveBeenCalledWith("1");
    });

    it("J then J moves to the second row", () => {
      const onOpenRow = vi.fn();
      const container = renderTable(onOpenRow);

      fireEvent.keyDown(container, { key: "j" });
      fireEvent.keyDown(container, { key: "j" });
      fireEvent.keyDown(container, { key: "Enter" });
      expect(onOpenRow).toHaveBeenCalledWith("2");
    });

    it("J does not move past the last row", () => {
      const onOpenRow = vi.fn();
      const container = renderTable(onOpenRow);

      for (let i = 0; i < 10; i++) fireEvent.keyDown(container, { key: "j" });
      fireEvent.keyDown(container, { key: "Enter" });
      expect(onOpenRow).toHaveBeenCalledWith("3");
    });

    it("K from the top stays clamped at the first row", () => {
      const onOpenRow = vi.fn();
      const container = renderTable(onOpenRow);

      fireEvent.keyDown(container, { key: "j" });
      fireEvent.keyDown(container, { key: "k" });
      fireEvent.keyDown(container, { key: "k" });
      fireEvent.keyDown(container, { key: "Enter" });
      expect(onOpenRow).toHaveBeenCalledWith("1");
    });

    it("F asks the caller to focus the rail", () => {
      const onFocusRail = vi.fn();
      const container = renderTable(vi.fn(), onFocusRail);

      fireEvent.keyDown(container, { key: "f" });
      expect(onFocusRail).toHaveBeenCalled();
    });

    it("/ does the same — S10 §7 web names both", () => {
      const onFocusRail = vi.fn();
      const container = renderTable(vi.fn(), onFocusRail);

      fireEvent.keyDown(container, { key: "/" });
      expect(onFocusRail).toHaveBeenCalled();
    });

    it("Enter with no active row yet does nothing", () => {
      const onOpenRow = vi.fn();
      const container = renderTable(onOpenRow);

      fireEvent.keyDown(container, { key: "Enter" });
      expect(onOpenRow).not.toHaveBeenCalled();
    });
  });
});
