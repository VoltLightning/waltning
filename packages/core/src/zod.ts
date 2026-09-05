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
 */
export const zPivotPerUnit = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, "expected a rate as a string")
  .refine((v) => dec(v).gt(0), "a rate is pivot per unit and must be positive")
  .transform((v): PivotPerUnit => v as PivotPerUnit);

/**
 * A rate you divide by to reach the pivot — `fx_rates`' own direction
 * (`computations.md` §4). The reciprocal brand of `zPivotPerUnit`; the two
 * are separate schemas for the same reason `PivotPerUnit` and `UnitsPerPivot`
 * are separate types — see `rate.type-test.ts`.
 *
 * **Refused at zero or below**, same reason as `zPivotPerUnit`: a zero rate
 * makes `toPivotByDivision` divide by zero and return `Infinity` branded as
 * `Money`.
 */
export const zUnitsPerPivot = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, "expected a rate as a string")
  .refine((v) => dec(v).gt(0), "a rate is units per pivot and must be positive")
  .transform((v): UnitsPerPivot => v as UnitsPerPivot);

/**
 * A bare `YYYY-MM-DD`.
 *
 * The regex and `accountingDate` say the same thing twice on purpose: the regex
 * is what produces a *field-level* error the form can render
 * (`architecture/12`), and the transform is what produces the type.
 */
export const zAccountingDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected a date as YYYY-MM-DD, with no time and no zone")
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
