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
  type Money,
  type PivotPerUnit,
  toMoney,
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
  .transform((v): Money => toMoney(v));

/** A rate you multiply by to reach the pivot (`computations.md` §4). */
export const zPivotPerUnit = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, "expected a rate as a string")
  .transform((v): PivotPerUnit => v as PivotPerUnit);

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
