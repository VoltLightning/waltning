import { describe, expect, it } from "vitest";
import {
  compareByCurrencyThenAmount,
  cycleSortState,
  type LedgerSelectableRow,
  type SortableRow,
  type SortState,
  selectableRange,
  sortRows,
} from "./ledger-table.ts";
import { toMoney } from "./money.ts";

/** The row `packages/ui`'s table sorts — declared here so the keys under test are real field names. */
type TestRow = SortableRow & { date: string; payee: string };

function row(overrides: Partial<TestRow> & { id: string }): TestRow {
  return {
    date: "2026-01-01",
    payee: "",
    amountValue: toMoney("0"),
    currency: "PLN",
    ...overrides,
  };
}

describe("sortRows", () => {
  it("sorts a string field ascending and descending", () => {
    const rows = [
      row({ id: "1", payee: "Zed" }),
      row({ id: "2", payee: "Abe" }),
      row({ id: "3", payee: "Mid" }),
    ];

    expect(sortRows(rows, "payee", "asc").map((r) => r.payee)).toEqual(["Abe", "Mid", "Zed"]);
    expect(sortRows(rows, "payee", "desc").map((r) => r.payee)).toEqual(["Zed", "Mid", "Abe"]);
  });

  it("sorts the amount key by decimal value, never by string or float comparison", () => {
    const rows = [
      row({ id: "1", amountValue: toMoney("9") }),
      row({ id: "2", amountValue: toMoney("10") }),
      row({ id: "3", amountValue: toMoney("-48.90") }),
    ];

    // A lexical or float-unsafe compare would put "10" before "9"; the
    // decimal comparator does not.
    expect(sortRows(rows, "amount", "asc").map((r) => r.id)).toEqual(["3", "1", "2"]);
  });

  /** H3 (DESK3 review round 1) — currency groups first, amount only breaks ties within one. */
  it("sorts the amount key by currency first, then by amount within it", () => {
    const rows = [
      row({ id: "eur-high", currency: "EUR", amountValue: toMoney("500") }),
      row({ id: "pln-low", currency: "PLN", amountValue: toMoney("10") }),
      row({ id: "eur-low", currency: "EUR", amountValue: toMoney("5") }),
      row({ id: "pln-high", currency: "PLN", amountValue: toMoney("9999") }),
    ];

    // EUR sorts before PLN lexically; within each currency, ascending by amount.
    expect(sortRows(rows, "amount", "asc").map((r) => r.id)).toEqual([
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

    expect(sortRows(rows, "amount", "asc").map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(sortRows(rows, "amount", "desc").map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input array", () => {
    const rows = [row({ id: "b" }), row({ id: "a" })];
    const original = [...rows];
    sortRows(rows, "date", "asc");
    expect(rows).toEqual(original);
  });
});

describe("compareByCurrencyThenAmount", () => {
  /**
   * The comparator is exported under its own name so a header can state the
   * order it is showing — so it is worth one test of its own, independent of
   * whichever key `sortRows` happens to route to it.
   */
  it("orders by currency before it looks at the figure at all", () => {
    const eur = { amountValue: toMoney("9999"), currency: "EUR" };
    const pln = { amountValue: toMoney("1"), currency: "PLN" };
    expect(compareByCurrencyThenAmount(eur, pln)).toBeLessThan(0);
  });

  it("compares figures as decimals within one currency", () => {
    const nine = { amountValue: toMoney("9"), currency: "PLN" };
    const ten = { amountValue: toMoney("10"), currency: "PLN" };
    // A lexical compare would put "10" before "9".
    expect(compareByCurrencyThenAmount(nine, ten)).toBeLessThan(0);
    expect(compareByCurrencyThenAmount(nine, nine)).toBe(0);
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
    // Annotated with the caller's own column vocabulary, the way a screen
    // instantiates it — inference off the first call alone would narrow to
    // the one literal it saw.
    let sort: SortState<"amount" | "date"> = cycleSortState(null, "amount");
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
