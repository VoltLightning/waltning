/**
 * Zod schemas that produce branded values.
 *
 * **This is where a brand gets established, and there is nowhere else it can
 * be.** Inside the system a value is branded because a column or a signature
 * says so; at the edge — a request body, a route parameter, a pagination cursor
 * — there is only a string, and something has to look at it.
 *
 * Every registry operation already declares a Zod input (§11.0), and it is
 * already the thing that decides whether a request is acceptable. Making it
 * also decide the *type* means the two cannot disagree: a field that validates
 * as a currency code arrives as a `CurrencyCode`, and one that does not never
 * arrives at all.
 *
 * The alternative was branding inside each service, which is a cast per field
 * per handler, at the point where the value has already been trusted.
 */

import { z } from "zod";
import { type AccountingDate, accountingDate } from "./date.ts";
import type { Id, IdTable } from "./id.ts";
import {
  type CurrencyCode,
  currencyCode,
  dec,
  type Money,
  type PivotPerUnit,
  RATE_MAX_EXCLUSIVE,
  RATE_MIN_EXCLUSIVE,
  rateInBounds,
  toMoney,
  type UnitsPerPivot,
} from "./money.ts";

/**
 * A decimal amount.
 *
 * Parsed through `toMoney`, so what reaches a handler is normalised to the
 * storage scale — a request sending `"18"` and one sending `"18.00000000"`
 * produce the same value, and neither produces a `number`.
 */
export const zMoney = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, "expected a decimal amount as a string")
  .transform((v): Money => toMoney(v))
  .refine((v) => dec(v).abs().lt("1000000000000"), "amount exceeds numeric(20,8)");

/**
 * `fee` (S31 §9.1) — the institution's own stated-fee line, reported
 * verbatim by `computations.md` §12.2. `zMoney` alone stays sign-permissive
 * because `amountOriginal` legitimately carries a negative sign for an
 * `adjustment` row (`transactions_amount_positive`); a fee has no such case
 * — a negative one is never a fee, it is a rebate wearing the wrong sign
 * (M2). **`transactions_fee_positive` (`0009_transactions_to_amount_and_fee_positive.sql`)
 * is `fee > 0`, strictly — "no fee" is `NULL`, never a typed `0`.** A caller
 * that means "no fee" must omit the field (or drop a typed `0` before this
 * schema ever sees it, the way `transfer-screen.tsx` does); this schema has
 * no way to turn a value into `NULL` itself.
 *
 * **Refused on the ORIGINAL string, before `zMoney`'s own rounding, and
 * again after.** `-0.0000000001` is strictly negative before `toMoney`
 * rounds it to `numeric(20,8)` — and rounds to `"-0.00000000"` after, which
 * `dec(v).gte(0)` used to read as non-negative, admitting a fee that was
 * genuinely typed negative. Checking the pre-round string catches that
 * direction; checking again after catches the opposite one — a tiny
 * *positive* fee (`"0.000000001"`) that rounds down to exactly zero, which
 * is "no fee" wearing a fee's own field.
 */
export const zFee = z
  .string()
  .refine((v) => !/^-?\d+(\.\d+)?$/.test(v) || dec(v).gt(0), "a fee must be greater than zero")
  .pipe(zMoney)
  .refine(
    (v) => dec(v).gt(0),
    "a fee must be greater than zero — a value that rounds to zero at storage scale is not a fee",
  );

/**
 * A rate you multiply by to reach the pivot (`computations.md` §4).
 *
 * **Refused at zero or below.** A rate is pivot per unit and must be
 * positive: zero or negative makes `toPivotByDivision`'s reciprocal
 * (`toPivot`/`fromPivot`) produce `Infinity` or a flipped sign, branded as
 * `Money` — a bug the type system would otherwise wave through, because
 * nothing about the brand says "positive".
 *
 * **H2 — and bounded, `RATE_MIN_EXCLUSIVE < rate < RATE_MAX_EXCLUSIVE`
 * (`1e-12 < rate < 999999999999`).** Positive alone is not enough:
 * `numeric(24,12)` cannot hold `1e12`, and `money.reciprocal` throws on
 * anything whose flip truncates to `0.000000000000` — a throw that used to
 * land inside `create_transaction`'s `apply`, *after* `writeLocally` had
 * already committed the outbox entry, leaving an entry no replay could ever
 * apply. `money.ts`'s own `RATE_MIN_EXCLUSIVE`/`RATE_MAX_EXCLUSIVE` argue
 * what each bound buys; refusing here is what keeps that throw unreachable
 * from a parsed input.
 */
export const zPivotPerUnit = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, "expected a rate as a string")
  .refine((v) => dec(v).gt(0), "a rate is pivot per unit and must be positive")
  .refine(
    rateInBounds,
    `a rate must lie strictly between ${RATE_MIN_EXCLUSIVE} and ${RATE_MAX_EXCLUSIVE}`,
  )
  .transform((v): PivotPerUnit => v as PivotPerUnit);

/**
 * A rate you divide by to reach the pivot — `fx_rates`' own direction
 * (`computations.md` §4). The reciprocal brand of `zPivotPerUnit`; the two
 * are separate schemas for the same reason `PivotPerUnit` and `UnitsPerPivot`
 * are separate types — see `rate.type-test.ts`.
 *
 * **Refused at zero or below**, same reason as `zPivotPerUnit`: a zero rate
 * makes `toPivotByDivision` divide by zero and return `Infinity` branded as
 * `Money`. **And bounded the same way (H2), `RATE_MIN_EXCLUSIVE < rate <
 * RATE_MAX_EXCLUSIVE` (`1e-12 < rate < 999999999999`)** — see
 * `zPivotPerUnit` above and `money.ts`'s `RATE_MIN_EXCLUSIVE`.
 */
export const zUnitsPerPivot = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, "expected a rate as a string")
  .refine((v) => dec(v).gt(0), "a rate is units per pivot and must be positive")
  .refine(
    rateInBounds,
    `a rate must lie strictly between ${RATE_MIN_EXCLUSIVE} and ${RATE_MAX_EXCLUSIVE}`,
  )
  .transform((v): UnitsPerPivot => v as UnitsPerPivot);

/**
 * A real Gregorian day, not merely the `YYYY-MM-DD` shape — `Date.UTC` rolls
 * `2026-02-30` forward into March rather than refusing it, so a value that
 * survives the round trip unchanged was a real day; one that does not was
 * never on a calendar. No clock is read — every number here comes from the
 * string itself. The same check `packages/ui/src/primitives/date-field.tsx`'s
 * `isRealCalendarDate` already runs at the UI's own edit boundary; M3 gives
 * every *contract* boundary the same guarantee, not only the one screen.
 */
function isRealCalendarDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const rolled = new Date(Date.UTC(year, month - 1, day));
  return (
    rolled.getUTCFullYear() === year &&
    rolled.getUTCMonth() === month - 1 &&
    rolled.getUTCDate() === day
  );
}

/**
 * A bare `YYYY-MM-DD`, on a real calendar.
 *
 * **M3 — a calendar check, not shape alone.** The regex alone accepts
 * `2026-02-31`; `accountingDate` (`date.ts`) is deliberately shape-only, so
 * this schema — the edge every registry operation's date field parses
 * through — is where month 1–12, the day within that month, and leap years
 * are actually checked. `date.ts`'s own comment states why the line sits
 * here and not there.
 */
export const zAccountingDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected a date as YYYY-MM-DD, with no time and no zone")
  .refine(isRealCalendarDate, "not a real calendar date")
  .transform((v): AccountingDate => accountingDate(v));

/** An ISO 4217 code. Upper-cased first, so `pln` is accepted and `PLN` is stored. */
export const zCurrencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(z.string().regex(/^[A-Z]{3}$/, "expected a three-letter currency code"))
  .transform((v): CurrencyCode => currencyCode(v));

/**
 * The id of a row in `Table`.
 *
 * A function rather than a constant, because the brand carries the table and a
 * shared `zId` would hand every operation the same untargeted id — which is the
 * situation this replaces.
 */
export const zId = <Table extends IdTable>() =>
  z.uuid().transform((v): Id<Table> => v as Id<Table>);
