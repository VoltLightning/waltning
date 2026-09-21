import { describe, expect, it } from "vitest";
import {
  blockOf,
  correctionFor,
  ESTIMATED_HEIGHTS,
  FINISH_WITHIN_MS,
  type GeometryEntry,
  listGeometry,
} from "./list-geometry.ts";

// Four row heights, deliberately all different: a rule that read the wrong
// one for a place would land on a number no other combination produces.
const H = {
  day: 50,
  firstDay: 40,
  rowOnly: 58,
  rowFirst: 57,
  rowMiddle: 54,
  rowLast: 56,
  quiet: 30,
  run: 44,
};

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
const row = (place: GeometryEntry["place"] = "middle"): GeometryEntry => ({
  kind: "row",
  date: null,
  place,
});

describe("listGeometry", () => {
  it("puts each day block where the entries above it end", () => {
    // 14th (first header, 2 rows), then the 13th (header, 1 row).
    const entries = [day("2026-08-14", true), row(), row(), day("2026-08-13"), row()];
    const { tops } = listGeometry(entries, H, stripOf(["2026-08-13", "2026-08-14"]), 8);
    expect(tops[0]).toBe(8);
    expect(tops[1]).toBe(8 + H.firstDay + 2 * H.rowMiddle);
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
    expect(tops.at(-1)).toBe(H.firstDay + H.rowMiddle + H.day + 2 * H.rowMiddle);
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

describe("the days a settle can name", () => {
  it("are unclamped, where the strip's cells are not", () => {
    // The strip runs a bounded distance either side of the anchor, so `cellOf`
    // clamps every day past it onto the end cell — right for *placing* the
    // strip, catastrophic for *naming* a day. `dates` is indexed by the same
    // block (`scrub.ts`'s `blockAt`) and carries the day itself.
    const strip = stripOf(["2026-06-30", "2026-07-01", "2026-07-02"]);
    const { marks, dates } = listGeometry(
      [
        day("2026-07-02", true),
        day("2026-07-01"),
        day("2026-06-30"),
        day("2026-06-01"),
        day("2026-05-26"),
      ],
      H,
      strip,
    );
    expect(marks.slice(2, 5)).toEqual([0, 0, 0]);
    expect(dates.slice(2, 5)).toEqual(["2026-06-30", "2026-06-01", "2026-05-26"]);
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

describe("blockOf", () => {
  // Newest first; the 11th names a run that swallowed the 11th down to the 7th.
  const dates = ["2026-08-14", "2026-08-13", "2026-08-11", "2026-08-06"];

  it("finds a day's own block", () => {
    expect(blockOf("2026-08-14", dates)).toBe(0);
    expect(blockOf("2026-08-06", dates)).toBe(3);
  });

  it("finds the collapsed run a day was swallowed by", () => {
    // A tap on the 9th goes to the run's row — where the 9th *is* — rather
    // than being called "not in the list" and paying for a reload.
    expect(blockOf("2026-08-09", dates)).toBe(2);
    expect(blockOf("2026-08-07", dates)).toBe(2);
    expect(blockOf("2026-08-12", dates)).toBe(1);
  });

  it("finds the last day's own block, not the sentinel that repeats its date", () => {
    // The sentinel stands at the end of the content. Found instead of the day,
    // a tap on the oldest loaded day scrolled to the bottom of the list.
    expect(blockOf("2026-08-06", [...dates, "2026-08-06"])).toBe(3);
  });

  it("says a day outside what is loaded is a jump", () => {
    expect(blockOf("2026-08-15", dates)).toBe(-1);
    expect(blockOf("2026-08-05", dates)).toBe(-1);
    expect(blockOf("2026-08-14", [])).toBe(-1);
  });
});

describe("a row's height depends on where it sits in its day", () => {
  it("sums each place's own height", () => {
    // The first row carries the card's top edge, the last its bottom, the ones
    // between a hairline, an only child both. Summed as one `row` height every
    // position below was out by a point or two *per row* — a day of drift in a
    // couple of screens, found as the ring on the 1st over a list on the 2nd.
    const entries: readonly GeometryEntry[] = [
      day("2026-08-14", true),
      row("first"),
      row("middle"),
      row("last"),
      day("2026-08-13"),
      row("only"),
      day("2026-08-12"),
    ];
    const strip = stripOf(["2026-08-12", "2026-08-13", "2026-08-14"]);
    const { tops } = listGeometry(entries, H, strip);
    expect(tops[1]).toBe(H.firstDay + H.rowFirst + H.rowMiddle + H.rowLast);
    expect(tops[2]).toBe((tops[1] ?? 0) + H.day + H.rowOnly);
  });
});

describe("an entry that is not its kind's height", () => {
  it("is summed at the height it was measured at", () => {
    // A transfer draws two accounts and a foreign row its rate, so rows of one
    // kind are not all one height — and every day below an odd row was out by
    // the difference. The kind's height is the fallback for a cell nobody has
    // scrolled to yet, never the truth about one that has been on screen.
    const entries: readonly GeometryEntry[] = [
      day("2026-08-14", true),
      { kind: "row", date: null, place: "only", key: "transfer-1" },
      day("2026-08-13"),
    ];
    const strip = stripOf(["2026-08-13", "2026-08-14"]);
    const usual = listGeometry(entries, H, strip);
    const exact = listGeometry(entries, H, strip, 0, new Map([["transfer-1", 92]]));
    expect(usual.tops[1]).toBe(H.firstDay + H.rowOnly);
    expect(exact.tops[1]).toBe(H.firstDay + 92);
  });
});

describe("a scroll to a day, checked on arrival", () => {
  // The 14th (one row), then the 13th. Estimated, the row is 58; drawn, it is
  // a transfer and 92 — so the 13th is 34pt further down than it was thought.
  const entries: readonly GeometryEntry[] = [
    day("2026-08-14", true),
    { kind: "row", date: null, place: "only", key: "transfer-1" },
    day("2026-08-13"),
    row("only"),
  ];
  const strip = stripOf(["2026-08-13", "2026-08-14"]);
  const guessed = listGeometry(entries, H, strip);
  const measured = listGeometry(entries, H, strip, 0, new Map([["transfer-1", 92]]));
  const aimed = guessed.tops[1] ?? 0;

  it("is finished when getting there moved the day", () => {
    // **The one a hand reported**: a tap on the 15th left the list on the 16th.
    expect(correctionFor("2026-08-13", aimed, measured, 400)).toBe(measured.tops[1]);
  });

  it("is sent on when the list stopped short, where its drawn content ran out", () => {
    // A virtualised list clamps to what it has laid out. Read as *the reader
    // moved it*, the scroll was abandoned at the first leg.
    expect(correctionFor("2026-08-13", aimed - 80, measured, 400)).toBe(measured.tops[1]);
  });

  it("is left alone once it is there", () => {
    const there = measured.tops[1] ?? 0;
    expect(correctionFor("2026-08-13", there, measured, 400)).toBeNull();
    expect(correctionFor("2026-08-13", there + 1, measured, 400)).toBeNull();
  });

  it("is the reader's stop, not this scroll's, once enough time has passed", () => {
    // Hauling the list back to a day tapped a while ago would be the list
    // fighting the hand on it.
    expect(correctionFor("2026-08-13", aimed + 300, measured, FINISH_WITHIN_MS + 1)).toBeNull();
  });

  it("is dropped for a day the list no longer holds", () => {
    expect(correctionFor("2026-01-01", aimed, measured, 400)).toBeNull();
  });
});
