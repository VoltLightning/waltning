/** @vitest-environment jsdom */

import { createEvent, fireEvent, render, screen } from "@testing-library/react";
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

  /**
   * H3 (DESK3 review round 1) — the amount column groups by currency before
   * it compares amounts, which is a surprising order to meet undeclared.
   * The caption appears only while amount is the sorted column.
   */
  it("the amount header says it sorts by currency first, and only while it is sorted", () => {
    const { rerender } = render(
      <LedgerTable
        rows={ROWS}
        sort={{ column: "amount", direction: "desc" }}
        onSortColumn={noop}
        selection={selectionOf()}
        onOpenRow={noop}
      />,
    );
    expect(screen.getByText("by currency, then amount")).toBeDefined();

    rerender(
      <LedgerTable
        rows={ROWS}
        sort={{ column: "payee", direction: "asc" }}
        onSortColumn={noop}
        selection={selectionOf()}
        onOpenRow={noop}
      />,
    );
    expect(screen.queryByText("by currency, then amount")).toBeNull();
  });

  /**
   * M (round 1) — `activeId` and DOM focus were two different "current
   * rows": a row body was tab-focusable *and* `react-native-web` fires its
   * press on `Enter` and stops the event, so the ringed row and the opened
   * row could differ. The container is the table's only tab stop now.
   */
  it("row bodies are out of the tab order — the scroller is the one tab stop", () => {
    render(
      <LedgerTable
        rows={ROWS}
        sort={null}
        onSortColumn={noop}
        selection={selectionOf()}
        onOpenRow={noop}
      />,
    );

    expect(screen.getByTestId("ledger-table-scroller").getAttribute("tabindex")).toBe("0");
    expect(screen.getByRole("button", { name: "Corner Bakery" }).getAttribute("tabindex")).toBe(
      "-1",
    );
  });

  /**
   * M2 (round 2) — the row body was not the only extra tab stop; every
   * checkbox was one too, and each of them fires its own press on `Enter`
   * and stops the event. Counted rather than spot-checked: "the scroller is
   * `0`" passes just as well with three focusable checkboxes beside it.
   */
  it("exactly one element inside the table body is a tab stop", () => {
    render(
      <LedgerTable
        rows={ROWS}
        sort={null}
        onSortColumn={noop}
        selection={selectionOf()}
        onOpenRow={noop}
      />,
    );

    const scroller = screen.getByTestId("ledger-table-scroller");
    const inside = scroller.querySelectorAll('[tabindex="0"]');
    expect(inside).toHaveLength(0);
    expect(scroller.getAttribute("tabindex")).toBe("0");
    // And the checkbox specifically, by name — the one that used to steal it.
    expect(
      screen.getByRole("checkbox", { name: "Select Corner Bakery" }).getAttribute("tabindex"),
    ).toBe("-1");
  });

  /**
   * The header cells are the exception to "one tab stop", and deliberately
   * so: they are the sort controls, and reaching them with the keyboard is
   * what §7 asks for. `Enter` on a focused header sorts that column and
   * cannot open a row — the cells sit *outside* the scroller that carries
   * `onKeyDown`, so the event has no path to the row handler even before
   * `react-native-web`'s own `PressResponder` calls `stopPropagation()`.
   *
   * The containment is what is asserted, rather than a synthesised `Enter`:
   * RNW fires a keyboard press from a document-level `keyup` listener its
   * responder system installs, which `fireEvent` does not drive. The press
   * itself is covered by the click test above; what is peculiar to the
   * keyboard is only *where the event can travel*, and that is structural.
   */
  it("header cells stay focusable, and sit outside the scroller that owns the row keys", () => {
    const onSortColumn = vi.fn();
    const onOpenRow = vi.fn();
    render(
      <LedgerTable
        rows={ROWS}
        sort={null}
        onSortColumn={onSortColumn}
        selection={selectionOf()}
        onOpenRow={onOpenRow}
      />,
    );

    const header = screen.getByRole("button", { name: "Payee" });
    const scroller = screen.getByTestId("ledger-table-scroller");
    expect(header.getAttribute("tabindex")).toBe("0");
    expect(scroller.contains(header)).toBe(false);

    fireEvent.click(header);
    expect(onSortColumn).toHaveBeenCalledWith("payee");
    expect(onOpenRow).not.toHaveBeenCalled();
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

    /**
     * M8 (round 1) — `event.key` is `"J"` with Shift held or Caps Lock on,
     * and S10 §7 and the design card both *print* these keys as capitals. A
     * reader who typed what the spec showed used to get nothing at all.
     */
    it("capital J, K and F work — the spec prints them that way", () => {
      const onOpenRow = vi.fn();
      const onFocusRail = vi.fn();
      const container = renderTable(onOpenRow, onFocusRail);

      fireEvent.keyDown(container, { key: "J", shiftKey: true });
      fireEvent.keyDown(container, { key: "J", shiftKey: true });
      fireEvent.keyDown(container, { key: "K", shiftKey: true });
      fireEvent.keyDown(container, { key: "Enter" });
      expect(onOpenRow).toHaveBeenCalledWith("1");

      fireEvent.keyDown(container, { key: "F", shiftKey: true });
      expect(onFocusRail).toHaveBeenCalled();
    });

    /**
     * M2 (round 2) — `Space` is the keyboard's own checkbox, which is what
     * makes `categorize_batch` reachable with no mouse at all: `j`/`k` to
     * walk, `Space` to check, `Enter` to open.
     */
    it("Space selects the ringed row, and so does x", () => {
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
      const container = screen.getByTestId("ledger-table-scroller");

      fireEvent.keyDown(container, { key: "j" });
      fireEvent.keyDown(container, { key: " " });
      expect(selection.toggleRow).toHaveBeenCalledWith("1", false);

      fireEvent.keyDown(container, { key: "j" });
      fireEvent.keyDown(container, { key: "x" });
      expect(selection.toggleRow).toHaveBeenCalledWith("2", false);
    });

    it("Space on a row that carries no checkbox selects nothing", () => {
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
      const container = screen.getByTestId("ledger-table-scroller");

      // Row 3 is the transfer — `transactions_category_shape` gives it no
      // checkbox, and the key is skipped exactly as the pointer is.
      for (let i = 0; i < 3; i++) fireEvent.keyDown(container, { key: "j" });
      fireEvent.keyDown(container, { key: " " });
      expect(selection.toggleRow).not.toHaveBeenCalled();
    });

    /**
     * The ring decides, not focus. A checkbox can still hold DOM focus —
     * `tabIndex={-1}` takes it out of the *tab* order, not out of the
     * document — and `Enter` must still open the row the ring is on.
     */
    it("j j j then Enter opens row 3, with a checkbox focused the whole time", () => {
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

      screen.getByRole("checkbox", { name: "Select Corner Bakery" }).focus();
      const container = screen.getByTestId("ledger-table-scroller");
      for (let i = 0; i < 3; i++) fireEvent.keyDown(container, { key: "j" });
      fireEvent.keyDown(container, { key: "Enter" });

      expect(onOpenRow).toHaveBeenCalledTimes(1);
      expect(onOpenRow).toHaveBeenCalledWith("3");
    });

    /**
     * M1 (round 3) — the half `tabIndex={-1}` does not cover. A click
     * focuses a `tabIndex={-1}` element, so after checking a row with the
     * mouse DOM focus sits on that checkbox, and `Enter` *there* never
     * reaches the scroller at all: `react-native-web`'s `PressResponder`
     * handles it and calls `stopPropagation()`. Walk to row 2 with `j`,
     * press `Enter`, and row **1** opened under a ring drawn on row 2.
     *
     * Fired on the focused checkbox rather than on the scroller, because
     * that is the whole finding: every other keyboard test here fires on the
     * container and so never meets the responder that swallows the event.
     */
    it("Enter on a focused checkbox opens the ringed row, not the focused one", () => {
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

      const container = screen.getByTestId("ledger-table-scroller");
      const checkbox = screen.getByRole("checkbox", { name: "Select Corner Bakery" });
      checkbox.focus();
      // The ring walks to row 2 while focus stays on row 1's checkbox —
      // `j` is not a key the responder claims, so it bubbles on its own.
      fireEvent.keyDown(container, { key: "j" });
      fireEvent.keyDown(container, { key: "j" });

      fireEvent.keyDown(checkbox, { key: "Enter" });
      expect(onOpenRow).toHaveBeenCalledTimes(1);
      expect(onOpenRow).toHaveBeenCalledWith("2");
    });

    /**
     * And the other half: `react-native-web` completes that press from a
     * document-level `keyup`, which would open the *focused* row a moment
     * after the delegate opened the ringed one. A press whose event is a key
     * event is the keyboard's, and the keyboard's answer is the ring.
     */
    it("the keyup react-native-web presses on afterwards opens nothing more", () => {
      const onOpenRow = vi.fn();
      const selection = selectionOf();
      render(
        <LedgerTable
          rows={ROWS}
          sort={null}
          onSortColumn={noop}
          selection={selection}
          onOpenRow={onOpenRow}
        />,
      );

      const container = screen.getByTestId("ledger-table-scroller");
      const checkbox = screen.getByRole("checkbox", { name: "Select Corner Bakery" });
      checkbox.focus();
      fireEvent.keyDown(container, { key: "j" });
      fireEvent.keyDown(container, { key: "j" });

      fireEvent.keyDown(checkbox, { key: "Enter" });
      fireEvent.keyUp(checkbox, { key: "Enter" });

      expect(onOpenRow).toHaveBeenCalledTimes(1);
      expect(onOpenRow).toHaveBeenCalledWith("2");
      // And the checkbox it was pressed on did not toggle either — that is
      // `Space` on the ringed row's job, not `Enter` on a focused control's.
      expect(selection.toggleRow).not.toHaveBeenCalled();
    });

    /**
     * The row body is the other element a click leaves focused, and it needs
     * the *other* cancellation: `react-native-web` renders
     * `accessibilityRole="button"` as a native `<button>`, so the browser
     * itself would fire a `click` for `Enter` and open the focused row.
     * `preventDefault` on the keydown is what stops that — asserted here as
     * the mechanism, because jsdom does not synthesise the activation click
     * that would otherwise make it visible.
     */
    it("Enter on a focused row body opens the ringed row, and cancels the browser's own click", () => {
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

      const container = screen.getByTestId("ledger-table-scroller");
      const body = screen.getByRole("button", { name: "Corner Bakery" });
      expect(body.tagName).toBe("BUTTON");
      body.focus();
      fireEvent.keyDown(container, { key: "j" });
      fireEvent.keyDown(container, { key: "j" });

      const enter = createEvent.keyDown(body, { key: "Enter" });
      fireEvent(body, enter);

      expect(onOpenRow).toHaveBeenCalledTimes(1);
      expect(onOpenRow).toHaveBeenCalledWith("2");
      expect(enter.defaultPrevented).toBe(true);
    });

    /** A pointer press is untouched: a real click still opens the row clicked. */
    it("a click still opens the row it landed on", () => {
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

      fireEvent.click(screen.getByRole("button", { name: "Rewe" }));
      expect(onOpenRow).toHaveBeenCalledWith("2");
    });

    it("Enter with no active row yet does nothing", () => {
      const onOpenRow = vi.fn();
      const container = renderTable(onOpenRow);

      fireEvent.keyDown(container, { key: "Enter" });
      expect(onOpenRow).not.toHaveBeenCalled();
    });
  });
});
