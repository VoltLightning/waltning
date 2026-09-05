import { toMoney } from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { type SortableLedgerRow, sortLedgerRows } from "./ledger-table-sort.ts";

function row(overrides: Partial<SortableLedgerRow> & { id: string }): SortableLedgerRow {
  return {
    date: "2026-01-01",
    payee: "",
    category: "",
    account: "",
    scope: "",
    amountValue: toMoney("0"),
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
