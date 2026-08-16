/**
 * Counterparty writes.
 *
 * Services compute; Postgres enforces. The duplicate-name check below exists
 * for the error message, not for the guarantee — `counterparties_name_uq` is
 * on the *normalized* name and is what actually holds when this check races
 * another writer.
 */

import { counterparties, type Database } from "@waltning/db";
import { DomainError } from "../common/errors.ts";

export type NewCounterparty = {
  name: string;
  kind: "person" | "company";
  settlementCurrency?: string | undefined;
  contact?: string | undefined;
  note: string;
};

export type CounterpartyRow = {
  id: string;
  name: string;
  kind: "person" | "company";
};

/** Postgres error code for a unique-constraint violation. */
const UNIQUE_VIOLATION = "23505";

/**
 * Drizzle wraps driver errors in a `DrizzleQueryError` whose message is the
 * SQL, putting the driver's `code` on `.cause`. Reading `e.code` therefore
 * finds nothing and every constraint violation falls through as `internal` —
 * which is what happened here until a test asked for the duplicate case.
 * Walking the chain is what makes the mapping actually fire.
 */
type CausedError = { code?: string; cause?: CausedError };

function pgErrorCode(e: CausedError): string | undefined {
  for (let cur: CausedError | undefined = e, depth = 0; cur && depth < 5; depth++) {
    if (typeof cur.code === "string") return cur.code;
    cur = cur.cause;
  }
  return undefined;
}

export async function insertCounterparty(
  db: Database,
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
    // `catch` binds `unknown` — the one place the language leaves no choice.
    // Narrowed here, once, so nothing downstream deals in it.
    if (pgErrorCode(e as CausedError) === UNIQUE_VIOLATION) {
      throw new DomainError(
        "validation",
        `a counterparty named "${input.name}" already exists`,
        // Names match ignoring case and surrounding whitespace, so the
        // conflicting row may not look identical to what was typed.
        { field: "name", constraint: "counterparties_name_uq" },
      );
    }
    throw e;
  }
}
