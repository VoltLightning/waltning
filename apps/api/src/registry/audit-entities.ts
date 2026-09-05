/**
 * The names `audit_log.entity` may hold — derived from `@waltning/db/schema`,
 * in one place.
 *
 * The registry writes the audit row on a handler's behalf
 * (`registry/operation.ts`), copying `AuditSpec.entity` straight into
 * `audit_log.entity`. Drizzle gives two spellings of every table: the
 * camelCase TypeScript property (`accountGroups`) and the SQL identifier the
 * row is actually stored under (`account_groups`). They are equally easy to
 * type and only one of them can ever match.
 *
 * Both sides of that hazard read this list: `registry.test.ts` holds every
 * declared `AuditSpec.entity` to it, and `get_audit_log` validates its input
 * against it. Deriving it here rather than in either place is what makes "the
 * same set" a fact instead of a coincidence.
 *
 * **What the enum closes is the misspelling.** `accountGroups`, `transaction`,
 * a table that never existed — each is a validation error going in and a test
 * failure going out, rather than an empty history. It does **not** close the
 * larger class it resembles: `currencies` is a real table this list carries and
 * nothing audits it today, so `get_audit_log("currencies", …)` is accepted and
 * answers empty, exactly as a row with nothing recorded against it does. Only
 * the operations that declare an `AuditSpec` write rows at all, and this list
 * knows nothing of them. Telling "no history" from "nothing is ever recorded
 * here" needs a different answer shape, and no caller has asked for one.
 *
 * **The guarantee is a runtime one.** The set is built by walking the schema
 * module's exports when this file is first imported, so its type is
 * `readonly string[]` and `z.enum` over it carries no literal union: nothing
 * here makes a mistyped `AuditSpec.entity` a compile error. `registry.test.ts`
 * is what fails, at test time, and it is the only thing that does.
 *
 * A table added to the schema joins the set with no edit here; a table removed
 * leaves it. That is the point — the list is the database's, not a copy.
 */

import * as dbSchema from "@waltning/db/schema";
import { getTableName, is, Table } from "drizzle-orm";

/**
 * Narrowed with drizzle's own `is()` rather than a hand-written predicate: the
 * schema module exports more than tables (enums, relations, helpers), so a
 * `value is Table` annotation is not assignable to that union. `is()` is the
 * runtime check *and* the narrowing, which is what it is for.
 */
function deriveSqlTableNames(): readonly string[] {
  const names: string[] = [];
  for (const value of Object.values(dbSchema)) {
    if (is(value, Table)) names.push(getTableName(value));
  }
  return names.sort();
}

/**
 * Every SQL table name in the server's schema, sorted.
 *
 * Sorted so the JSON Schema `get_audit_log` hands the model is stable across
 * runs — an enum whose order tracks module evaluation order is a diff on every
 * unrelated schema edit.
 */
export const AUDIT_ENTITIES: readonly string[] = deriveSqlTableNames();

if (AUDIT_ENTITIES.length === 0) {
  // Reachable only if `@waltning/db/schema` stops exporting tables, at which
  // point `z.enum([])` would accept nothing and every audit read would fail
  // validation with no explanation. Fail loudly at import instead.
  throw new Error("no tables found in @waltning/db/schema — audit entity names cannot be derived");
}
