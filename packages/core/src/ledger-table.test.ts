import { describe, expect, it } from "vitest";
import {
  cycleSortState,
  type LedgerSelectableRow,
  type SortableLedgerRow,
  selectableRange,
  sortLedgerRows,
} from "./ledger-table.ts";
import { toMoney } from "./money.ts";

function row(overrides: Partial<SortableLedgerRow> & { id: string }): SortableLedgerRow {
  return {
    date: "2026-01-01",
    payee: "",
    category: "",
    account: "",
    scope: "",
    amountValue: toMoney("0"),
    currency: "PLN",
    ...overrides,
  };
}

describe("sortLedgerRows", () => {
  it("passes rows through untouched when sort is null — the caller's own order", () => {
    const rows = [row({ id: "b", payee: "Zed" }), row({ id: "a", payee: "Abe" })];
    expect(sortLedgerRows(rows, null)).toBe(rows);
  });

  it("sorts a string column ascending and descending", () => {
    const rows = [
      row({ id: "1", payee: "Zed" }),
      row({ id: "2", payee: "Abe" }),
      row({ id: "3", payee: "Mid" }),
    ];

    expect(sortLedgerRows(rows, { column: "payee", direction: "asc" }).map((r) => r.payee)).toEqual(
      ["Abe", "Mid", "Zed"],
    );
    expect(
      sortLedgerRows(rows, { column: "payee", direction: "desc" }).map((r) => r.payee),
    ).toEqual(["Zed", "Mid", "Abe"]);
  });

  it("sorts amount by decimal value, never by string or float comparison", () => {
    const rows = [
      row({ id: "1", amountValue: toMoney("9") }),
      row({ id: "2", amountValue: toMoney("10") }),
      row({ id: "3", amountValue: toMoney("-48.90") }),
    ];

    // A lexical or float-unsafe compare would put "10" before "9"; the
    // decimal comparator does not.
    expect(sortLedgerRows(rows, { column: "amount", direction: "asc" }).map((r) => r.id)).toEqual([
      "3",
      "1",
      "2",
    ]);
  });

  /** H3 (DESK3 review round 1) — currency groups first, amount only breaks ties within one. */
  it("sorts amount by currency first, then by amount within it", () => {
    const rows = [
      row({ id: "eur-high", currency: "EUR", amountValue: toMoney("500") }),
      row({ id: "pln-low", currency: "PLN", amountValue: toMoney("10") }),
      row({ id: "eur-low", currency: "EUR", amountValue: toMoney("5") }),
      row({ id: "pln-high", currency: "PLN", amountValue: toMoney("9999") }),
    ];

    // EUR sorts before PLN lexically; within each currency, ascending by amount.
    expect(sortLedgerRows(rows, { column: "amount", direction: "asc" }).map((r) => r.id)).toEqual([
      "eur-low",
      "eur-high",
      "pln-low",
      "pln-high",
    ]);
  });

  it("breaks a tie on id, ascending, regardless of the sorted direction", () => {
    const rows = [
      row({ id: "c", amountValue: toMoney("5") }),
      row({ id: "a", amountValue: toMoney("5") }),
      row({ id: "b", amountValue: toMoney("5") }),
    ];

    expect(sortLedgerRows(rows, { column: "amount", direction: "asc" }).map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(sortLedgerRows(rows, { column: "amount", direction: "desc" }).map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("does not mutate the input array", () => {
    const rows = [row({ id: "b" }), row({ id: "a" })];
    const original = [...rows];
    sortLedgerRows(rows, { column: "date", direction: "asc" });
    expect(rows).toEqual(original);
  });
});

describe("cycleSortState", () => {
  it("cycles a column asc → desc → natural on repeated clicks", () => {
    let sort = cycleSortState(null, "payee");
    expect(sort).toEqual({ column: "payee", direction: "asc" });

    sort = cycleSortState(sort, "payee");
    expect(sort).toEqual({ column: "payee", direction: "desc" });

    sort = cycleSortState(sort, "payee");
    expect(sort).toBeNull();
  });

  it("switching to a different column always starts at asc", () => {
    let sort = cycleSortState(null, "amount");
    sort = cycleSortState(sort, "amount");
    expect(sort).toEqual({ column: "amount", direction: "desc" });

    sort = cycleSortState(sort, "date");
    expect(sort).toEqual({ column: "date", direction: "asc" });
  });
});

describe("selectableRange", () => {
  const ROWS: LedgerSelectableRow[] = [
    { id: "a", selectable: true },
    { id: "b", selectable: true },
    { id: "transfer", selectable: false },
    { id: "c", selectable: true },
    { id: "d", selectable: true },
  ];

  /** H6 (DESK3 review round 1) — a non-selectable row inside the span is skipped, not selected. */
  it("skips a non-selectable row inside the span", () => {
    expect(selectableRange(ROWS, "a", "d")).toEqual(["a", "b", "c", "d"]);
  });

  it("works backwards from a later anchor to an earlier target", () => {
    expect(selectableRange(ROWS, "d", "a")).toEqual(["a", "b", "c", "d"]);
  });

  it("a single-row range is just that row", () => {
    expect(selectableRange(ROWS, "b", "b")).toEqual(["b"]);
  });

  it("returns null when the anchor is no longer a selectable row", () => {
    expect(selectableRange(ROWS, "transfer", "d")).toBeNull();
  });

  it("returns null when the target is not among the rows at all", () => {
    expect(selectableRange(ROWS, "a", "ghost")).toBeNull();
  });
});
