import { describe, expect, it } from "vitest";
import { dayAt, ESTIMATED_HEIGHTS, type GeometryEntry, listGeometry } from "./list-geometry.ts";

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
    expect(listGeometry([], H, stripOf([]))).toEqual({ tops: [], marks: [], dates: [] });
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

describe("the day a settle reports", () => {
  /**
   * The strip runs a bounded distance either side of the anchor
   * (`RIBBON_REACH`), so `cellOf` clamps every day past it onto the end cell.
   * That is right for *placing* the strip and catastrophic for *naming* a day:
   * reading the date back out of `marks` hands back a real date that is not
   * the one on screen, and S04 §3 — *scroll to 25 May on List and Calendar has
   * 25 May marked* — quietly stops holding.
   */
  const strip = stripOf(["2026-06-30", "2026-07-01", "2026-07-02"]);
  const entries: readonly GeometryEntry[] = [
    day("2026-07-02", true),
    day("2026-07-01"),
    day("2026-06-30"),
    // Past the strip's reach — every one of these clamps onto cell 0.
    day("2026-06-01"),
    day("2026-05-26"),
  ];

  it("names the day on screen, not the cell the strip clamped it to", () => {
    const { tops, marks, dates } = listGeometry(entries, H, strip);
    // The clamp is real and stays: three different days share one cell.
    expect(marks.slice(2, 5)).toEqual([0, 0, 0]);
    // And the dates do not.
    expect(dates.slice(2, 5)).toEqual(["2026-06-30", "2026-06-01", "2026-05-26"]);
    // The bottom of the list is the 26th, and that is what a settle there says.
    expect(dayAt(tops.at(-1) ?? 0, tops, dates)).toBe("2026-05-26");
  });

  it("names the block the reader is inside, for the whole of it", () => {
    // **The whole block, not its first half.** Rounding to the nearer anchor
    // crosses at the midpoint of a day, so the second half of every day block
    // reported the *next* day — that day's header still below the fold, this
    // day's rows filling the screen. On a six-row day that is 182 of its 364
    // points, and §3's own worked example fails 200pt into it.
    const { tops, dates } = listGeometry(entries, H, strip);
    const first = tops[0] ?? 0;
    const second = tops[1] ?? 0;
    for (const through of [0, 0.1, 0.49, 0.5, 0.51, 0.9, 0.999]) {
      expect(dayAt(first + (second - first) * through, tops, dates)).toBe("2026-07-02");
    }
    // And the next block is the next day, from its very top.
    expect(dayAt(second, tops, dates)).toBe("2026-07-01");
  });

  it("clamps at both ends and answers for an empty list", () => {
    const { tops, dates } = listGeometry(entries, H, strip);
    expect(dayAt(-500, tops, dates)).toBe("2026-07-02");
    expect(dayAt(99999, tops, dates)).toBe("2026-05-26");
    expect(dayAt(0, [], [])).toBeNull();
    expect(dayAt(Number.NaN, tops, dates)).toBeNull();
  });
});

describe("the sentinel's direction", () => {
  it("is read from the marks, not from the last pair", () => {
    // When the bottom of the list is past the strip's reach the tail of
    // `marks` is a run of one clamped cell, so the difference between the last
    // two is zero — and the sentinel repeated that cell, leaving the last day
    // with no sweep, which is the defect the sentinel exists to remove.
    const strip = stripOf(["2026-06-30", "2026-07-01", "2026-07-02"]);
    const entries: readonly GeometryEntry[] = [
      day("2026-07-02", true),
      day("2026-06-01"),
      day("2026-05-26"),
    ];
    const { marks } = listGeometry(entries, H, strip);
    expect(marks.slice(0, 3)).toEqual([2, 0, 0]);
    expect(marks.at(-1), "one cell further in the direction the run was going").toBe(-1);
  });

  it("has no direction, and asks for none, when the strip holds one cell", () => {
    // The earlier spelling hard-coded `-1` here and produced a mark of `-1`
    // for a run with no direction at all.
    const { marks } = listGeometry([day("2026-07-02", true), row()], H, stripOf(["2026-07-02"]));
    expect(marks).toEqual([0, 0]);
  });

  it("keeps the marks monotonic in every shape above", () => {
    const strip = stripOf(["2026-06-30", "2026-07-01", "2026-07-02"]);
    const { marks } = listGeometry(
      [day("2026-07-02", true), day("2026-07-01"), day("2026-06-01"), day("2026-05-26")],
      H,
      strip,
    );
    for (let i = 1; i < marks.length; i += 1) {
      expect(marks[i]).toBeLessThanOrEqual(marks[i - 1] ?? 0);
    }
  });
});
