/**
 * Counterparty writes.
 *
 * Services compute; Postgres enforces. The duplicate-name check below exists
 * for the error message, not for the guarantee — `counterparties_name_uq` is
 * on the *normalized* name and is what actually holds when this check races
 * another writer.
 *
 * `defineOperation` already translates any Postgres refusal into a domain
 * error, so this `catch` is not what makes the failure survive — without it the
 * duplicate would still arrive as `validation`, just carrying Postgres's own
 * wording. It exists because the useful sentence here mentions case and
 * whitespace, and the shared translator has no way to know that.
 *
 * **`name_folded` is never set here (R2 H2).** It is `GENERATED ALWAYS AS
 * (…) STORED` in `packages/db/src/schema.ts` now — Postgres refuses an
 * insert that supplies a value for a generated column outright, so this
 * would not compile past the type and would not run past the database
 * either way. `fold()` still runs on the phone (`create-counterparty.executor.ts`),
 * where SQLite has no generated columns to lean on.
 */

import type { CurrencyCode } from "@waltning/core/money";
import type { DbHandle } from "@waltning/db/client";
import { counterparties } from "@waltning/db/schema";
import { DomainError } from "../../common/errors.ts";
import { pgErrorCode, UNIQUE_VIOLATION } from "../../common/pg-errors.ts";

export type NewCounterparty = {
  name: string;
  kind: "person" | "company";
  settlementCurrency?: CurrencyCode | undefined;
  contact?: string | undefined;
  note: string;
};

export type CounterpartyRow = {
  id: string;
  name: string;
  kind: "person" | "company";
};

export async function insertCounterparty(
  db: DbHandle,
  input: NewCounterparty,
): Promise<CounterpartyRow> {
  try {
    const [row] = await db
      .insert(counterparties)
      .values({
        name: input.name,
        kind: input.kind,
        settlementCurrency: input.settlementCurrency ?? null,
        contact: input.contact ?? null,
        note: input.note,
      })
      .returning({
        id: counterparties.id,
        name: counterparties.name,
        kind: counterparties.kind,
      });

    if (!row) throw new Error("insert returned no row");
    return row;
  } catch (e) {
    if (pgErrorCode(e) === UNIQUE_VIOLATION) {
      throw new DomainError(
        "validation",
        `a counterparty named "${input.name}" already exists`,
        // Names match ignoring case and surrounding whitespace, so the
        // conflicting row may not look identical to what was typed.
        {
          fieldErrors: [{ path: "name", message: "that name is already taken" }],
          constraint: "counterparties_name_uq",
        },
      );
    }
    throw e;
  }
}
