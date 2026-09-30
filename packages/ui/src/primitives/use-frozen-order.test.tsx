/** @vitest-environment jsdom */
import { renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useFrozenOrder } from "./use-frozen-order";

type Row = { id: string; n: number };
const idOf = (row: Row) => row.id;
const row = (id: string, n: number): Row => ({ id, n });

function ids(rows: readonly Row[]) {
  return rows.map((r) => r.id);
}

it("keeps the first order when the incoming order changes, with current data", () => {
  const { result, rerender } = renderHook(({ rows }) => useFrozenOrder(rows, idOf), {
    initialProps: { rows: [row("a", 100), row("b", 90)] },
  });
  expect(ids(result.current)).toEqual(["a", "b"]);

  rerender({ rows: [row("b", 90), row("a", 80)] });
  expect(ids(result.current)).toEqual(["a", "b"]);
  expect(result.current[0]?.n).toBe(80);
});

it("drops what is gone and appends what is new, never moving what is placed", () => {
  const { result, rerender } = renderHook(({ rows }) => useFrozenOrder(rows, idOf), {
    initialProps: { rows: [row("a", 3), row("b", 2), row("c", 1)] },
  });
  rerender({ rows: [row("d", 9), row("c", 5), row("a", 4)] });
  expect(ids(result.current)).toEqual(["a", "c", "d"]);
});
