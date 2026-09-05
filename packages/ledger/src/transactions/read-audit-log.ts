/**
 * `get_audit_log(entity, id)` — S09's audit history (`operations.md`).
 *
 * **There is nothing here to query.** `architecture/14-local-first.md`'s
 * "roughly thirteen tables are shared" names `audit_log` explicitly
 * server-only, beside the tax tables, `receipts` and the agent tables — a
 * table with no Postgres-vs-SQLite parity to keep, because there is no
 * SQLite side of it at all. `ledgerSchema` carries no `audit_log`, and
 * nothing in this package writes one: every executor's audit row is the
 * registry's job on the server (`registry/operation.ts`), never the local
 * executor's.
 *
 * **The result is a status, never a bare empty array.** `[]` for "no rows
 * yet" and `[]` for "this can never have rows" are the same value for two
 * different facts, and a caller (`AuditHistory`, once D5 builds it) needs to
 * tell them apart to render "not available on this device" rather than a
 * silent empty list. So this answers `{ status: "unavailable_on_device" }`
 * every time — never a nullish stand-in for "didn't work" — with
 * `LocalAuditEntry` (`SPEC.md` §6.2's columns) kept beside it so a real
 * handler's `{ status: "ok", rows }` slots into the same type once one
 * exists, without moving where this is called from.
 *
 * **`entity` is validated against the schema, not trusted.** A caller still
 * picks any `IdTable` at the type level (the vocabulary every other read on
 * this session already uses), but at run time this checks the name against
 * `ledgerSchema`'s own keys — the actual table set this ledger holds, not a
 * second list copied by hand and left to drift from it. `entityId` is
 * checked non-blank for the same reason: an argument this function ignored
 * would be a nullish "didn't work" one layer further out, where nobody is
 * looking for it.
 */

import type { IdTable } from "@waltning/core/id";
import type { JsonValue } from "@waltning/core/json";
import type { Actor } from "@waltning/schema/enums";
import { ledgerSchema } from "../schema-map.ts";

/**
 * The table names this ledger actually holds, derived from the schema map
 * rather than restated — the set `entity` is checked against below.
 */
const AUDITED_ENTITIES: ReadonlySet<string> = new Set(Object.keys(ledgerSchema));

/**
 * One `audit_log` row, field-for-field (`SPEC.md` §6.2).
 *
 * `actor` is `@waltning/schema`'s own `Actor` — `user` · `agent` · `import` ·
 * `migration`. **Known gap, not fixed here**: §15.1's continuous invariants
 * write `actor = 'system'` on a violation, a value the `ACTOR` pgEnum does
 * not carry, so that write would fail against the schema as declared today.
 * Reported as its own finding rather than widened in this file, which owns
 * a read and not the enum.
 */
export type LocalAuditEntry = {
  id: string;
  entity: IdTable;
  entityId: string;
  action: string;
  actor: Actor;
  before: JsonValue | null;
  after: JsonValue | null;
  at: string;
};

export type AuditLogResult =
  | { status: "unavailable_on_device" }
  | { status: "ok"; rows: readonly LocalAuditEntry[] };

/**
 * Always `{ status: "unavailable_on_device" }` — see this file's own doc
 * above. Throws on an `entity` this ledger's schema does not name, or a
 * blank `entityId`: an argument is checked, then answered, never ignored.
 */
export function readAuditLog(entity: IdTable, entityId: string): AuditLogResult {
  if (!AUDITED_ENTITIES.has(entity)) {
    throw new Error(`get_audit_log: "${entity}" is not a table this ledger's schema holds`);
  }
  if (entityId.trim() === "") {
    throw new Error(`get_audit_log: entityId must not be blank (entity: "${entity}")`);
  }
  return { status: "unavailable_on_device" };
}
