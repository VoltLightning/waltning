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
  | { kind: "unpriced" };

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
export function toLedgerItems<Row extends LedgerDayRow>(
  rows: readonly Row[],
  pivotCurrency: CurrencyCode,
): readonly LedgerItem<Row>[] {
  const days: { date: AccountingDate; rows: Row[] }[] = [];
  for (const row of rows) {
    const current = days.at(-1);
    if (current !== undefined && current.date === row.date) current.rows.push(row);
    else days.push({ date: row.date, rows: [row] });
  }

  const items: LedgerItem<Row>[] = [];
  days.forEach((day, index) => {
    items.push({
      kind: "day",
      date: day.date,
      rows: day.rows,
      total: totalOf(day.rows, pivotCurrency),
    });

    const next = days[index + 1];
    if (next === undefined) return;
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
 * The days of a loaded list, classed for the ribbon.
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
    if (day.total.kind === "unpriced") {
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

  return fillQuietDays(marked);
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
function fillQuietDays(marked: readonly RibbonDayModel[]): readonly RibbonDayModel[] {
  const first = marked[0];
  const last = marked[marked.length - 1];
  if (first === undefined || last === undefined) return marked;

  // The list runs newest first, so the span is from the last to the first.
  const from = first.date <= last.date ? first.date : last.date;
  const to = first.date <= last.date ? last.date : first.date;
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
  // Back into the order the caller had them in.
  return first.date <= last.date ? run : run.reverse();
}
