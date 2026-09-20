import { describe, expect, it } from "vitest";
import { ESTIMATED_HEIGHTS, type GeometryEntry, listGeometry } from "./list-geometry.ts";

const H = { day: 50, firstDay: 40, row: 54, quiet: 30, run: 44 };

/** The strip, earliest-first, as a lookup from date to cell. */
function stripOf(dates: readonly string[]): (date: string) => number {
  const at = new Map(dates.map((date, i) => [date, i]));
  return (date) => {
    const found = at.get(date);
    if (found !== undefined) return found;
    // Outside the strip's reach: clamp to the nearer end, which is what keeps
    // the interpolation monotonic across a jump the strip cannot follow.
    return date < (dates[0] ?? "") ? 0 : dates.length - 1;
  };
}

const day = (date: string, first = false): GeometryEntry => ({ kind: "day", date, first });
const row = (): GeometryEntry => ({ kind: "row", date: null });

describe("listGeometry", () => {
  it("puts each day block where the entries above it end", () => {
    // 14th (first header, 2 rows), then the 13th (header, 1 row).
    const entries = [day("2026-08-14", true), row(), row(), day("2026-08-13"), row()];
    const { tops } = listGeometry(entries, H, stripOf(["2026-08-13", "2026-08-14"]), 8);
    expect(tops[0]).toBe(8);
    expect(tops[1]).toBe(8 + H.firstDay + 2 * H.row);
  });

  it("reads the strip's order out of cellOf, not out of the index", () => {
    // The list is newest-first and the strip earliest-first, so the marks
    // descend while the tops ascend. Nothing in this file knows that; the
    // screen's `cellOf` does.
    const entries = [day("2026-08-14", true), day("2026-08-13"), day("2026-08-12")];
    const strip = stripOf(["2026-08-12", "2026-08-13", "2026-08-14"]);
    const { marks } = listGeometry(entries, H, strip);
    expect(marks.slice(0, 3)).toEqual([2, 1, 0]);
  });

  it("gives a row no anchor point of its own", () => {
    // A row belongs to the day above it: the strip sweeps one cell across the
    // whole block rather than jumping at the header.
    const entries = [day("2026-08-14", true), row(), row(), row()];
    const { tops } = listGeometry(entries, H, stripOf(["2026-08-14"]));
    // One day, plus the sentinel.
    expect(tops).toHaveLength(2);
  });

  it("gives a collapsed run one anchor and the days it swallowed", () => {
    // `QuietRun` draws a week of nothing as ONE row while the strip draws
    // seven cells. The sweep across that row has to cover all of them, which
    // it does because the *next* mark is seven cells further along.
    const strip = stripOf([
      "2026-08-06",
      "2026-08-07",
      "2026-08-08",
      "2026-08-09",
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
    ]);
    const entries: readonly GeometryEntry[] = [
      day("2026-08-13", true),
      { kind: "run", date: "2026-08-12" },
      day("2026-08-06"),
    ];
    const { tops, marks } = listGeometry(entries, H, strip);
    expect(marks[1]).toBe(6);
    expect(marks[2]).toBe(0);
    // One row's worth of scrolling, six cells of strip.
    expect((tops[2] ?? 0) - (tops[1] ?? 0)).toBe(H.run);
  });

  it("ends with a sentinel, so the last day sweeps like every other", () => {
    // Without it the strip stops dead as the reader enters the final day and
    // sits there for the whole of it.
    const entries = [day("2026-08-14", true), row(), day("2026-08-13"), row(), row()];
    const { tops, marks } = listGeometry(entries, H, stripOf(["2026-08-13", "2026-08-14"]));
    expect(tops.at(-1)).toBe(H.firstDay + H.row + H.day + 2 * H.row);
    // One cell further along, in the direction the marks were already going.
    expect(marks.at(-1)).toBe(-1);
  });

  it("does not invent a sentinel for a list with nothing in it", () => {
    expect(listGeometry([], H, stripOf([]))).toEqual({ tops: [], marks: [] });
  });

  it("keeps the tops ascending, whatever the list holds", () => {
    const entries: readonly GeometryEntry[] = [
      day("2026-08-14", true),
      row(),
      { kind: "quiet", date: "2026-08-13" },
      { kind: "run", date: "2026-08-12" },
      day("2026-08-06"),
      row(),
      row(),
    ];
    const { tops } = listGeometry(entries, H, stripOf(["2026-08-06", "2026-08-12", "2026-08-14"]));
    for (let i = 1; i < tops.length; i += 1) {
      expect(tops[i]).toBeGreaterThan(tops[i - 1] ?? 0);
    }
  });

  it("estimates with the design's own figures rather than with zeroes", () => {
    // A table of zeroes puts every day at one offset, so the strip reads the
    // first frame as "the whole ledger is at the top" and jumps a frame later.
    for (const value of Object.values(ESTIMATED_HEIGHTS)) {
      expect(value).toBeGreaterThan(0);
    }
  });
});
