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
  /** Where a row sits in its day, which decides its borders and so its height. */
  place?: "only" | "first" | "middle" | "last";
  /** The entry's own identity, for a height measured for *it* (`exact` below). */
  key?: string;
};

/** One height per kind, measured once each. `firstDay` is the ungapped header. */
export type EntryHeights = {
  day: number;
  firstDay: number;
  /**
   * **Four rows, because a row's borders depend on where it sits in its day**
   * — and a single `row` height was out by a point or two on every row, which
   * is a day of drift inside a couple of screens.
   */
  rowOnly: number;
  rowFirst: number;
  rowMiddle: number;
  rowLast: number;
  quiet: number;
  run: number;
};

export type ListGeometry = {
  /** Each day block's top in the content, ascending. */
  tops: readonly number[];
  /**
   * The strip cell each of those tops stands for.
   *
   * **Lossy on purpose, and therefore not what the date is read from.** The
   * strip runs a bounded distance either side of the anchor, so every day
   * beyond it maps to the same end cell — which is right for *placing* the
   * strip (it genuinely cannot show those days) and catastrophic for naming
   * one. `dates` is the same list without that clamp.
   */
  marks: readonly number[];
  /**
   * The day each top stands for, unclamped.
   *
   * **What the settle reports** — indexed by the strip's own `blockAt`, so the
   * day that is named and the day the ring lands on are one rule. Reading the
   * day back out of `marks` made
   * every day past the strip's reach report the strip's end day instead: on a
   * list holding a collapsed run, a third of one flick reported a day that was
   * not on screen, and deeper in it was out by a month. The error was
   * invisible — a real date, just the wrong one — and it persisted, because a
   * settle fires once per stop and the wrong anchor is then quietly accepted.
   */
  dates: readonly string[];
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
  rowOnly: 56,
  rowFirst: 55,
  rowMiddle: 55,
  rowLast: 56,
  quiet: 34,
  run: 44,
};

/**
 * The two arrays, from the entries the list is rendering.
 *
 * `cellOf` maps a date to its cell in the strip — the screen's, because what
 * the strip's run is (`ledger-days.ts`'s `ribbonRun`; the matched days under a
 * search) is not this file's business. A date the strip does not hold clamps
 * to its nearer end, which keeps the interpolation monotonic.
 *
 * `leading` is the content's own top padding, so the first day's top is where
 * it actually is rather than zero.
 *
 * `exact` is the height of each entry that has actually been laid out, by key.
 * **The kind's height is a fallback, not the truth**: a transfer draws two
 * accounts and a foreign row draws its rate, so rows of one kind are not all
 * one height — and a table that said they were put every day below an odd row
 * out by the difference, which the e2e suite found 2,500pt down as the ring on
 * the 1st over a list on the 2nd. A cell that has been on screen has been
 * measured; only cells nobody has scrolled to yet are estimated, and by the
 * time anyone does, they are not.
 */
export function listGeometry(
  entries: readonly GeometryEntry[],
  heights: EntryHeights,
  cellOf: (date: string) => number,
  leading = 0,
  exact?: ReadonlyMap<string, number>,
): ListGeometry {
  const tops: number[] = [];
  const marks: number[] = [];
  const dates: string[] = [];
  let at = leading;

  for (const entry of entries) {
    const measured = entry.key === undefined ? undefined : exact?.get(entry.key);
    if (entry.kind === "row") {
      at +=
        measured ??
        (entry.place === "only"
          ? heights.rowOnly
          : entry.place === "first"
            ? heights.rowFirst
            : entry.place === "last"
              ? heights.rowLast
              : heights.rowMiddle);
      continue;
    }
    if (entry.date !== null) {
      tops.push(at);
      marks.push(cellOf(entry.date));
      dates.push(entry.date);
    }
    at +=
      measured ??
      (entry.kind === "quiet"
        ? heights.quiet
        : entry.kind === "run"
          ? heights.run
          : entry.first === true
            ? heights.firstDay
            : heights.day);
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
  const lastDate = dates.at(-1);
  if (lastTop !== undefined && lastMark !== undefined && lastDate !== undefined && at > lastTop) {
    tops.push(at);
    /*
      **Which way the marks are going, read from the marks rather than
      assumed.** The obvious spelling — the difference between the last two —
      is `0` exactly when the bottom of the list is past the strip's reach and
      the tail of `marks` is a run of one clamped cell, which is the common
      case rather than a corner. The sentinel then repeated that cell and the
      last day got no sweep, which is the defect the sentinel exists to remove.
      Taken from the last difference that is not zero it is right there, and
      still `0` for a strip with one cell — where no sweep is the correct
      answer, and where the earlier spelling hard-coded `-1` and produced a
      mark of `-1` for a run that has no direction at all.
    */
    let step = 0;
    for (let i = marks.length - 1; i > 0; i -= 1) {
      const difference = (marks[i] ?? 0) - (marks[i - 1] ?? 0);
      if (difference !== 0) {
        step = difference > 0 ? 1 : -1;
        break;
      }
    }
    marks.push(lastMark + step);
    // The sentinel is a position, not a day: it stands at the end of the last
    // day's block, so the day it names is that same last day.
    dates.push(lastDate);
  }

  return { tops, marks, dates };
}

/**
 * Which block a day lives in — its own, or the collapsed run that swallowed it.
 *
 * `dates` runs newest-first and names each block by its *newer* end, so the
 * block holding a day is the last one that starts on or after it. A tap on the
 * 9th, where the 7th to the 11th are one *nothing recorded* row, goes to that
 * row — which is where the 9th is — rather than being told the day is not in
 * the list and paying for a reload of rows that are already on screen.
 *
 * `-1` for a day outside what is loaded, in either direction: that is a jump.
 */
export function blockOf(date: string, dates: readonly string[]): number {
  const newest = dates[0];
  const oldest = dates.at(-1);
  if (newest === undefined || oldest === undefined) return -1;
  if (date > newest || date < oldest) return -1;
  let at = -1;
  for (let i = 0; i < dates.length; i += 1) {
    const block = dates[i];
    if (block === undefined || block < date) break;
    // The sentinel repeats the last day's date and stands at the *end* of its
    // block: a tap on the oldest loaded day went to the bottom of the list.
    if (at >= 0 && dates[at] === block) continue;
    at = i;
  }
  return at;
}

/** How near a day's top counts as *on* it, in points — a scroller's rounding. */
export const ARRIVED_SLACK = 2;

/**
 * How long after a scroll to a day was sent a stop still counts as *its* stop.
 * Each leg is an animated scroll of a third of a second; past this, a list
 * that has stopped somewhere else was put there by the reader.
 */
export const FINISH_WITHIN_MS = 2000;

/**
 * Where to send the list **again**, after a scroll that was meant to land on
 * `date` came to rest at `at` — or `null` when it is there, or is no longer
 * this scroll's to finish.
 *
 * **A day's position is only known once the rows above it have been drawn,
 * and neither is the list's own height.** Everything nobody has scrolled past
 * is summed at its kind's estimated height (`listGeometry`'s `exact`), and a
 * virtualised list cannot be scrolled past the content it has laid out — so a
 * tap on a day a month up the list was sent to a confident guess, stopped
 * where the drawn content ran out, and named the day it found there: the 16th,
 * for a tap on the 15th. Getting part of the way draws those rows, which
 * measures them and lengthens the list; so the scroll is checked at each stop
 * against the geometry it produced, and sent on.
 *
 * `sinceSent` is what keeps this from fighting a hand: a stop long after the
 * scroll was sent is the reader's, and is left where it is.
 */
export function correctionFor(
  date: string,
  at: number,
  geometry: ListGeometry,
  sinceSent: number,
): number | null {
  if (sinceSent > FINISH_WITHIN_MS) return null;
  const top = geometry.tops[blockOf(date, geometry.dates)];
  if (top === undefined) return null;
  const gap = top - at;
  return gap > ARRIVED_SLACK || gap < -ARRIVED_SLACK ? top : null;
}
