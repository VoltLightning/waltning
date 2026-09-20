/**
 * Where each day sits in the list's scrolling content — the two arrays the
 * day strip is scrubbed by (S04 §7).
 *
 * **Arithmetic, not `onLayout`.** A measured map of day positions goes stale
 * the moment `maintainVisibleContentPosition` prepends an older page: every
 * position below the insertion moves, and a strip driven by the old numbers is
 * confidently wrong rather than visibly broken. Positions are therefore
 * *derived* from the entries the list is rendering, every time that list
 * changes, from a table of per-kind heights measured once.
 *
 * **Heights are measured; positions are computed.** The two are different
 * problems and only the first needs a renderer. A row is a fixed 54 and a day
 * header is a fixed block, so one measurement of each is the whole table — and
 * measuring rather than reading the tokens is what makes the strip right at a
 * font scale the constants were not written at.
 *
 * **The anchor points are day blocks, not entries.** A day's rows belong to
 * its day, so the strip should sweep one cell across the whole block rather
 * than jumping at the header. And a `QuietRun` collapses a stretch of empty
 * days into **one row** — the list draws a week of nothing as a single line
 * where the strip draws seven cells — which is exactly why the marks are a
 * second array rather than the index of the first.
 */

/** The kinds the List page renders. A row is the only one that repeats. */
export type GeometryKind = "day" | "row" | "quiet" | "run";

/** One entry, reduced to what a position can be computed from. */
export type GeometryEntry = {
  kind: GeometryKind;
  /**
   * The day this entry stands for, or `null` for a row — a row is part of the
   * day above it and is never an anchor point of its own.
   *
   * For a run this is its **newer** end: the list runs backwards, so that is
   * the end the reader meets first.
   */
  date: string | null;
  /** The first day header draws no gap above it. */
  first?: boolean;
};

/** One height per kind, measured once each. `firstDay` is the ungapped header. */
export type EntryHeights = {
  day: number;
  firstDay: number;
  row: number;
  quiet: number;
  run: number;
};

export type ListGeometry = {
  /** Each day block's top in the content, ascending. */
  tops: readonly number[];
  /** The strip cell each of those tops stands for. */
  marks: readonly number[];
};

/**
 * What the list is before anything has been measured.
 *
 * **Not zeroes.** A table of zeroes puts every day at the same offset, and the
 * strip then reads the first frame as *the whole ledger is at the top* and
 * places itself accordingly — a visible jump one frame later when the real
 * heights arrive. These are the design's own figures (`02-tokens`: a 54pt row,
 * S04 §4: the day header's block), so the first frame is approximately right
 * and the correction is invisible.
 */
export const ESTIMATED_HEIGHTS: EntryHeights = {
  day: 54,
  firstDay: 40,
  row: 54,
  quiet: 34,
  run: 44,
};

/**
 * The two arrays, from the entries the list is rendering.
 *
 * `cellOf` maps a date to its cell in the strip — the screen's, because the
 * strip's run is clipped to `RIBBON_REACH` and this file has no opinion about
 * that. A date the strip does not hold clamps to its nearer end, which is what
 * keeps the interpolation monotonic across a jump the strip cannot follow.
 *
 * `leading` is the content's own top padding, so the first day's top is where
 * it actually is rather than zero.
 */
export function listGeometry(
  entries: readonly GeometryEntry[],
  heights: EntryHeights,
  cellOf: (date: string) => number,
  leading = 0,
): ListGeometry {
  const tops: number[] = [];
  const marks: number[] = [];
  let at = leading;

  for (const entry of entries) {
    if (entry.kind === "row") {
      at += heights.row;
      continue;
    }
    if (entry.date !== null) {
      tops.push(at);
      marks.push(cellOf(entry.date));
    }
    at +=
      entry.kind === "quiet"
        ? heights.quiet
        : entry.kind === "run"
          ? heights.run
          : entry.first === true
            ? heights.firstDay
            : heights.day;
  }

  /*
    **The sentinel, which is what makes the last day behave like the others.**
    Every day's sweep runs from its own top to the next one's; the last has no
    next, so without this the strip stops dead the moment the reader enters the
    final day and sits there for the whole of it. One more point, at the end of
    the content and one cell further along, gives it the same treatment as
    every day above it.
  */
  const lastTop = tops.at(-1);
  const lastMark = marks.at(-1);
  if (lastTop !== undefined && lastMark !== undefined && at > lastTop) {
    tops.push(at);
    // The list runs newest-first, so *further along* is one cell back.
    marks.push(
      lastMark + (marks.length > 1 ? Math.sign(lastMark - (marks.at(-2) ?? lastMark)) : -1),
    );
  }

  return { tops, marks };
}
