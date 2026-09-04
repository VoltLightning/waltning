/**
 * Accounting dates — bare `YYYY-MM-DD`, and a brand rather than a `string`.
 *
 * `CLAUDE.md`: *"Accounting dates are bare `YYYY-MM-DD` strings. No `Date`
 * arithmetic, no timezone conversion on them; `capturedTz` is a separate
 * field."*
 *
 * As a plain `string` that rule was unenforceable, and the way it breaks is
 * specific and easy: `new Date().toISOString()` is a string, so it compiled
 * into a `date` column. What lands is `2026-03-12T22:00:00.000Z` — which is
 * both the wrong shape and, for anyone east of UTC, **the wrong day**. That is
 * the failure `capturedTz` exists to prevent, arriving through the type system
 * instead of through a timezone.
 *
 * Postgres would reject the shape at the column, so this is not about data
 * corruption on the server. It is about the phone, where SQLite stores it as
 * TEXT and will accept anything at all — and about every function that takes a
 * date and never touches a database.
 */

declare const DATE: unique symbol;

/** A bare calendar date, `YYYY-MM-DD`, in no timezone. */
export type AccountingDate = string & { readonly [DATE]: "AccountingDate" };

/**
 * Shape only, deliberately — this parser is also used by callers that already
 * know their own arithmetic is on a real day (`addDays`, `shiftMonth`), where
 * a second calendar check would be redundant. **M3:** the calendar itself is
 * checked at the contract edge instead, by `zod.ts#zAccountingDate` (month
 * 1–12, day within the month, leap years) — the one place a hand-typed or
 * wire-carried date is chosen and has not yet been shown to be real.
 */
const SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse a bare date.
 *
 * **Throws rather than returning null**, because every caller is at a boundary
 * where the alternative is storing a wrong day. A date that fails this is a bug
 * in the caller, not a value to route around.
 *
 * Rejects an ISO timestamp explicitly, since that is the mistake this exists
 * for and `"2026-03-12T22:00:00Z".slice(0, 10)` is what someone reaches for
 * next — which is the *silent* version of the same bug, because it converts a
 * UTC instant to a UTC day and the ledger's day is local.
 */
export function accountingDate(value: string): AccountingDate {
  if (!SHAPE.test(value)) {
    throw new Error(
      `not a bare accounting date: ${JSON.stringify(value)} — ` +
        "expected YYYY-MM-DD with no time and no zone",
    );
  }
  return value as AccountingDate;
}

/** Whether a string is a bare date, for a boundary that must not throw. */
export const isAccountingDate = (value: string): value is AccountingDate => SHAPE.test(value);

/**
 * Today, in a named zone.
 *
 * **The zone is required**, and that is the whole point of the signature. The
 * ledger's "today" is a local calendar day: a capture at 01:00 in Warsaw is the
 * 12th, and `new Date().toISOString().slice(0, 10)` calls it the 11th. C28
 * records that exact failure — land at 01:00 with the phone still on the old
 * zone and every capture is dated yesterday, permanently.
 */
export function todayIn(timeZone: string, now = new Date()): AccountingDate {
  // `en-CA` renders as `YYYY-MM-DD`, which is the format wanted rather than a
  // coincidence worth relying on quietly — `formatToParts` would be the same
  // thing with more code.
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  return accountingDate(formatted);
}

/**
 * Add (or, for a negative `n`, subtract) whole days to a bare accounting
 * date. Used by the capture grammar (`capture/dates.ts`) to turn "yesterday"
 * and a weekday name into a date, without touching a clock.
 *
 * **Calendar arithmetic, not clock arithmetic — the distinction this file's
 * header exists to draw.** `Date.UTC` here is not a timezone; it is a Gregorian
 * day-count device applied to three numbers that already name a calendar day,
 * with no `now`, no local zone and no `toISOString` anywhere in the path. That
 * is different from `todayIn`'s hazard, which comes from asking a *clock* what
 * day it is in the wrong zone — there is no clock here to get wrong.
 */
export function addDays(date: AccountingDate, n: number): AccountingDate {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(year, month - 1, day + n));
  return accountingDate(shifted.toISOString().slice(0, 10));
}

/**
 * Whole calendar days from `a` to `b` — positive when `b` is later.
 *
 * §7.7's carry-forward cap (`readRate`) and §17's coverage percentage
 * (`readCoverage`) both ask "how many days apart", never "how many
 * milliseconds" — so this is the same `Date.UTC` day-count device `addDays`
 * uses, not a subtraction of two instants that would need a timezone this
 * file does not have. `money.ts`'s `ageInDays` is this, named for §7's
 * ageing — a company's debt is *old* as of `today`, never *overdue*.
 */
export function daysBetween(a: AccountingDate, b: AccountingDate): number {
  const [ay, am, ad] = a.split("-").map(Number) as [number, number, number];
  const [by, bm, bd] = b.split("-").map(Number) as [number, number, number];
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / msPerDay);
}

declare const YEAR_MONTH: unique symbol;

/** A bare calendar month, `YYYY-MM`, in no timezone — `AccountingDate` minus the day. */
export type YearMonth = string & { readonly [YEAR_MONTH]: "YearMonth" };

const YEAR_MONTH_SHAPE = /^\d{4}-\d{2}$/;

/** Parse a bare year-month. Throws, matching `accountingDate` — see there for why. */
export function yearMonth(value: string): YearMonth {
  if (!YEAR_MONTH_SHAPE.test(value)) {
    throw new Error(
      `not a bare year-month: ${JSON.stringify(value)} — expected YYYY-MM with no day`,
    );
  }
  const month = Number(value.slice(5, 7));
  if (month < 1 || month > 12) {
    throw new Error(`not a calendar month: ${JSON.stringify(value)}`);
  }
  return value as YearMonth;
}

/**
 * Step a bare year-month by whole months — `PeriodHeader`'s arrows, and month
 * granularity is all arc 1 offers (`S04-today.md` §9; week/year/range are
 * `PeriodPicker`'s, S25).
 *
 * **Calendar arithmetic, not clock arithmetic — `addDays`'s distinction,
 * applied one field over.** `Date.UTC` here is a Gregorian month-count device
 * over two numbers that already name a calendar month, with no `now`, no
 * local zone and no `toISOString`. The day is fixed at 1 so there is no
 * month-length to get wrong: `2026-01-31` shifted forward is not asked to mean
 * "the 31st of February."
 */
export function shiftMonth(month: YearMonth, n: number): YearMonth {
  const [year, mo] = month.split("-").map(Number) as [number, number];
  const shifted = new Date(Date.UTC(year, mo - 1 + n, 1));
  const yyyy = String(shifted.getUTCFullYear()).padStart(4, "0");
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  return yearMonth(`${yyyy}-${mm}`);
}
