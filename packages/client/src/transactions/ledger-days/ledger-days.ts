import { type AccountingDate, addDays, daysBetween } from "@waltning/core/date";
import type { CurrencyCode, Money, PivotPerUnit } from "@waltning/core/money";
import * as money from "@waltning/core/money";

/**
 * S04 §3 — what the continuous list actually draws.
 *
 * `groupByDay` (S10's) groups contiguous rows and stops there, which is all a
 * filtered list needs: a filtered list has no gaps to explain, because a day
 * with no matching row is a day the filter excluded. **S04's list has gaps
 * that mean something** — a day with nothing on it is a day you spent
 * nothing — so it draws the days *between* its rows as well as the days with
 * rows on them, and it carries a total per day.
 *
 * Those two additions are why this is its own model rather than a flag on the
 * other: a quiet run and a day total are both about the absence of rows, and
 * `groupByDay` deliberately never asks what is not there.
 */

/** The two legs of a row, as this model needs them. `null` where a leg cannot be priced. */
export type LedgerDayRow = {
  date: AccountingDate;
  amount: Money;
  currency: CurrencyCode;
  fxRate: PivotPerUnit;
  fxRateEstimated: boolean;
  toAmount: Money | null;
  toCurrency: CurrencyCode | null;
  toFxRate: PivotPerUnit | null;
};

/**
 * A day's total, or a stated reason there is not one.
 *
 * **`unpriced` is not zero and not a rounding note.** A transfer into a
 * currency the ledger could not price has no rate on its destination leg
 * (`toFxRate` is null by schema), so a total that added the legs it *could*
 * price would be a smaller number presented as the day's figure. S04 §5:
 * a day whose rate has not arrived shows **no total at all**.
 */
export type DayTotal =
  | {
      kind: "total";
      /** Signed, in the pivot currency, both legs of a transfer counted. */
      pivot: Money;
      /** Some leg was converted, so the figure is a conversion — render it with `≈`. */
      approximate: boolean;
      /** Some contributing rate was inferred rather than observed. */
      estimated: boolean;
    }
  | { kind: "unpriced" }
  /**
   * The rows are a filtered subset, so the day has no figure of its own to
   * state. **A distinct kind from `unpriced`**, which means *a rate has not
   * arrived* and is rendered with that explanation: a filtered day is not
   * missing a rate, and telling the reader it is would be a wrong reason
   * attached to a right blank.
   */
  | { kind: "filtered" };

export type LedgerItem<Row extends LedgerDayRow> =
  | { kind: "day"; date: AccountingDate; rows: readonly Row[]; total: DayTotal }
  /** One quiet day. `from` and `to` are the same date. */
  | { kind: "quiet"; from: AccountingDate; to: AccountingDate; days: number };

/**
 * Money on a row is in the row's own currency; a day total is one figure, so
 * every leg is taken to the pivot at **its own row's rate** — which is the
 * rate for that row's accounting date (P1), already stored on the row rather
 * than looked up. Nothing here reads a rate table, which is what keeps a day
 * total class **R** and therefore readable offline.
 */
function totalOf(rows: readonly LedgerDayRow[], pivotCurrency: CurrencyCode): DayTotal {
  let pivot = money.ZERO;
  let approximate = false;
  let estimated = false;

  for (const row of rows) {
    // A leg in the pivot currency is added as it stands; anything else is a
    // conversion, and a figure built from one is approximate by construction.
    // Asked of the currency rather than of the rate: a rate that happens to
    // be 1 is a pegged currency, not the pivot, and rounding it to "exact"
    // would be a claim about the money rather than about the arithmetic.
    pivot = money.add(pivot, money.toPivot(row.amount, row.fxRate));
    if (row.currency !== pivotCurrency) approximate = true;
    if (row.fxRateEstimated) estimated = true;

    if (row.toAmount === null) continue;
    if (row.toFxRate === null) return { kind: "unpriced" };
    pivot = money.add(pivot, money.toPivot(row.toAmount, row.toFxRate));
    if (row.toCurrency !== pivotCurrency) approximate = true;
  }

  return { kind: "total", pivot, approximate, estimated };
}

/**
 * Rows, newest first, into the items S04 draws.
 *
 * **Quiet days are only drawn between two days that have rows**, never past
 * either end. The list is paged, so the day after the newest row and the day
 * before the oldest are not known to be empty — they are known to be
 * *unloaded*, and drawing "nothing" over them would be the list asserting
 * something it has not read. A caller that knows its own end (today, or the
 * opening balance) draws that boundary itself; §6 says what each one says.
 *
 * **A run collapses; a single day does not.** One empty day is a line, and
 * a run of them is one row naming the span — twenty-five days is not
 * twenty-five rows (S04 §6). The threshold is exactly two, because the row
 * that says *"3 – 4 August · 2 days · nothing"* is already shorter than the
 * two lines it replaces.
 *
 * Rows must arrive sorted newest-first, the reader's own order; this walks
 * contiguous runs rather than re-sorting, so out-of-order rows surface as
 * out-of-order items instead of a silent re-sort hiding the bug.
 */
export type LedgerItemOptions = {
  /**
   * The rows are a *filtered* set — S04 §7's search — so the gaps between them
   * are days the filter excluded, not days the ledger is quiet on.
   *
   * **A filtered list says less, on purpose.** This file's own header draws the
   * line: S10's grouping "stops there, which is all a filtered list needs",
   * because "a filtered list has no gaps to explain". Run a filtered set
   * through the unfiltered rules and both of this module's answers become
   * false — a day holding six rows of which one matched reports that one row's
   * amount as *the day's total*, and a day full of rows that did not match
   * collapses into a `QuietRun` labelled *nothing recorded*. Neither is a
   * rounding error; both are the list stating something it did not read.
   *
   * So under a filter: no day totals, and no quiet days. The days that appear
   * are the days that matched.
   */
  filtered?: boolean;
  /**
   * The day the list is anchored on — S04 §6's cold open (today) or a jump.
   *
   * **The anchor is always an item, quiet if it has to be.** Both halves of the
   * list are read outward from it, so every day between it and the nearest row
   * on either side is *known* quiet, not unloaded — the one place a quiet day
   * may be drawn past a loaded row. Without it, a cold open on a day with no
   * entries drew a list and a ribbon that began two days ago, with today
   * nowhere on the screen that is named for it; and a jump to a quiet day
   * landed on a page reading *nothing on or before*, over a ledger holding rows
   * three days newer. Under a filter it is not drawn: the anchor is a date the
   * query did not match, and the filtered list says nothing about those.
   *
   * `ribbonDays` takes it too, and separately: the page hands the list no
   * anchor until both halves have answered — a quiet line drawn before the
   * read is a statement nothing has read — while the strip above it names the
   * day from the first frame, over an empty ledger included.
   */
  anchor?: AccountingDate;
};

export function toLedgerItems<Row extends LedgerDayRow>(
  rows: readonly Row[],
  pivotCurrency: CurrencyCode,
  options: LedgerItemOptions = {},
): readonly LedgerItem<Row>[] {
  const days: { date: AccountingDate; rows: Row[] }[] = [];
  for (const row of rows) {
    const current = days.at(-1);
    if (current !== undefined && current.date === row.date) current.rows.push(row);
    else days.push({ date: row.date, rows: [row] });
  }

  // The anchor takes its place among the days, newest first, as a day with
  // no rows — so the gap rule below draws the quiet run on each side of it
  // exactly as it would between two loaded days.
  const anchor = options.filtered === true ? undefined : options.anchor;
  if (anchor !== undefined && !days.some((day) => day.date === anchor)) {
    const at = days.findIndex((day) => day.date < anchor);
    days.splice(at === -1 ? days.length : at, 0, { date: anchor, rows: [] });
  }

  const items: LedgerItem<Row>[] = [];
  days.forEach((day, index) => {
    if (day.rows.length === 0) {
      items.push({ kind: "quiet", from: day.date, to: day.date, days: 1 });
    } else {
      items.push({
        kind: "day",
        date: day.date,
        rows: day.rows,
        // `unpriced` is the shape that already means *no honest figure here*,
        // and a filtered day has none: the rows on screen are a subset chosen by
        // a query, so their sum is not the day's own.
        total: options.filtered === true ? { kind: "filtered" } : totalOf(day.rows, pivotCurrency),
      });
    }

    const next = days[index + 1];
    if (next === undefined || options.filtered === true) return;
    // `next` is the OLDER day — rows arrive newest-first — so the earlier
    // date is the first argument. Backwards here counts every gap negative
    // and draws no quiet days at all, which looks exactly like a ledger
    // with no quiet days in it.
    const gap = daysBetween(next.date, day.date) - 1;
    if (gap <= 0) return;
    items.push({
      kind: "quiet",
      from: addDays(day.date, -1),
      to: addDays(next.date, 1),
      days: gap,
    });
  });
  return items;
}

/**
 * How far the ribbon reaches either side of the day it is centred on, in days.
 *
 * **The strip is a neighbourhood, not the ledger.** It fills every day between
 * the first and the last it holds, and the anchor is one of them — so a jump
 * to 1950 in a ledger that begins in 2026 asked for twenty-seven thousand
 * cells in a plain `ScrollView`, each with two `Intl` formats behind it. The
 * list survives the same input because it collapses the gap into one row; the
 * ribbon cannot, because the distance is what it draws, so it draws less of
 * it. Forty-five is a quarter each way: further than a thumb scrolls a strip,
 * and ninety-one cells at most, whatever the ledger's shape.
 */
export const RIBBON_REACH = 45;

/** One day as `DayRibbon` draws it — no words, because words are the screen's. */
export type RibbonDayModel = {
  date: AccountingDate;
  /** `none` · `some` · `heavy` — how much moved, not which way. */
  activity: "none" | "some" | "heavy";
  /** Which way the day netted. `flat` is movement that left nothing behind. */
  direction: "out" | "in" | "flat";
  /** The day's own total, for the label the screen writes. `null` where it could not be priced. */
  pivot: Money | null;
  entries: number;
};

/**
 * The days of a loaded list, classed for the ribbon, **earliest first**.
 *
 * **The strip runs the way time does, whatever order the list is in.** The
 * list is reverse-chronological because a ledger is read from the top, and
 * that is a fact about a *vertical* axis — handed to a horizontal strip
 * unchanged it drew `11 10 9 8 7` left to right, which is a week running
 * backwards beside a `MonthGrid` on the next page of the same screen running
 * forwards. S04 §4 says the ribbon is continuous and clipped at both edges and
 * does not say which way it runs; every calendar this product draws, and the
 * reading direction of both languages it ships, say earliest at the left.
 * `DayRibbon` scrolls the current day into view, which is what makes the newer
 * end reachable without it being the end you start at.
 *
 * **`heavy` is relative to what is on screen, not to an absolute figure.**
 * A ledger where the largest day is 200 zł and one where it is 20 000 would
 * otherwise draw every mark the same size — one all small, the other all
 * large — and the mark exists precisely to say *this day was unusual for
 * you*. Half the largest visible day is the threshold: it makes the biggest
 * day heavy by construction and leaves the ordinary ones small.
 *
 * **Direction is the day's net, and a day that nets to zero with rows on it
 * is `flat`.** That is a day of transfers between your own accounts: money
 * moved and none of it left, which is neither an expense nor income and must
 * not be painted as either.
 *
 * A day whose total could not be computed is `some` and `flat` — something
 * happened, and the screen may not say what.
 */
export function ribbonDays<Row extends LedgerDayRow>(
  items: readonly LedgerItem<Row>[],
  options: LedgerItemOptions = {},
): readonly RibbonDayModel[] {
  const days = items.filter((item) => item.kind === "day");
  let largest = money.ZERO;
  for (const day of days) {
    if (day.total.kind !== "total") continue;
    const size = money.abs(day.total.pivot);
    if (money.cmp(size, largest) > 0) largest = size;
  }
  const half = money.mul(largest, 0.5);

  const marked = days.map((day): RibbonDayModel => {
    // Two kinds with no figure, and the ribbon draws them the same: a day that
    // held rows, with nothing to say about how much. A filtered day has a
    // figure the query is not entitled to state; an unpriced one has none at
    // all. Neither can be sized, and both are `some`.
    if (day.total.kind !== "total") {
      return {
        date: day.date,
        activity: "some",
        direction: "flat",
        pivot: null,
        entries: day.rows.length,
      };
    }
    const size = money.abs(day.total.pivot);
    const activity = money.isZero(size)
      ? day.rows.length === 0
        ? ("none" as const)
        : ("some" as const)
      : money.cmp(size, half) >= 0
        ? ("heavy" as const)
        : ("some" as const);
    const direction = money.isZero(day.total.pivot)
      ? ("flat" as const)
      : money.isPositive(day.total.pivot)
        ? ("in" as const)
        : ("out" as const);
    return {
      date: day.date,
      activity,
      direction,
      pivot: day.total.pivot,
      entries: day.rows.length,
    };
  });

  /*
    **A filtered ribbon is not continuous, and cannot be.** `fillQuietDays`
    invents a cell for every date between two it holds, marked `none` with zero
    entries — which the screen then names *"3 September, nothing"*. Under a
    filter those are days the query excluded, and most of them hold rows: the
    ribbon would assert the ledger was quiet on a day the reader can see six
    transactions on by clearing the search.

    §7.2's continuity is a property of the *unfiltered* list, where a gap
    between two loaded days really is a gap in the ledger. `toLedgerItems` stops
    emitting quiet items under the same option and for the same reason.
  */
  // Earliest first, in both branches: a filtered ribbon is not continuous but
  // it is still a strip, and a strip that changed direction when a search was
  // typed would be two controls wearing one name.
  const strip = [...marked].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (options.filtered === true) return strip;
  // The span is every item's and the anchor's, not only the busy days': the
  // anchor may sit past the last row on either side — or be the only thing
  // there is, over a ledger holding nothing — and a strip that ran only
  // between rows left the day the screen is named for with no cell.
  let from: AccountingDate | undefined = options.anchor;
  let to: AccountingDate | undefined = options.anchor;
  for (const item of items) {
    const [low, high] = item.kind === "day" ? [item.date, item.date] : [item.to, item.from];
    if (from === undefined || low < from) from = low;
    if (to === undefined || high > to) to = high;
  }
  if (from === undefined || to === undefined) return strip;
  // Clipped to `RIBBON_REACH` either side of the anchor — or of the newest day,
  // for a caller with no anchor — so the cell count is bounded by the constant
  // and not by how far apart two loaded days happen to be.
  const centre = options.anchor ?? to;
  const nearest = addDays(centre, -RIBBON_REACH);
  const furthest = addDays(centre, RIBBON_REACH);
  return fillQuietDays(strip, from < nearest ? nearest : from, to > furthest ? furthest : to);
}

/**
 * **The ribbon is continuous** (S04 §7.2): a cell for every day between the
 * first and the last the list has loaded, whether or not the ledger has
 * anything for it.
 *
 * A strip built only from the days that hold rows is not a strip — a ledger
 * with one transaction drew one cell, which reads as a broken control rather
 * than as a quiet month, and the gaps between two marks said nothing about
 * whether they were a day or a fortnight apart. The list itself collapses a
 * quiet run into one row, because a list of nothings is unreadable; the ribbon
 * cannot, because the distance *is* what it draws.
 *
 * A day with nothing on it is `none` and `flat`, which is the mark's absence —
 * the same shape a month grid's empty cell has.
 */
function fillQuietDays(
  marked: readonly RibbonDayModel[],
  from: AccountingDate,
  to: AccountingDate,
): readonly RibbonDayModel[] {
  const held = new Map(marked.map((day) => [day.date as string, day]));

  const run: RibbonDayModel[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    run.push(
      held.get(date) ?? {
        date,
        activity: "none",
        direction: "flat",
        pivot: money.ZERO,
        entries: 0,
      },
    );
  }
  return run;
}
