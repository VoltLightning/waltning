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

/** Shape only. A real calendar check happens where a date is chosen, not here. */
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
