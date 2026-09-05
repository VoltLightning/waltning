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
 * different facts, and a caller (`AuditHistory`, once one is built) needs to
 * tell them apart to render "not available on this device" rather than a
 * silent empty list. So this answers `{ status: "unavailable_on_device" }`
 * every time — never a nullish stand-in for "didn't work" — with
 * `LocalAuditEntry` (`SPEC.md` §6.2's columns) kept beside it so a real
 * handler's `{ status: "ok", rows }` slots into the same type once one
 * exists, without moving where this is called from.
 *
 * **`entity` is `string`, matching the audit row it names** —
 * `registry/operation.ts`'s own `AuditSpec.entity: string` and `audit_log`'s
 * `entity` column (`SPEC.md` §6.2) are both untyped free text, because the
 * real table set includes `currencies` and `fx_rates` — natural-keyed, with
 * no branded row id, so `@waltning/core/id`'s `IdTable` (a list of tables a
 * *row* is branded against) omits them by construction. A first version of
 * this file typed `entity: IdTable`, which quietly made S18's own audited
 * manual-rate trail unaskable — `getAuditLog("fx_rates", …)` would not have
 * compiled. `string` is the honest width.
 *
 * **The check is on the argument's shape, not on a table list.** A second
 * version checked `entity` against the *replica's* tables (`getTableName()`
 * over `ledgerSchema`) and threw for anything else — which made this
 * function answer the wrong question. `audit_log.entity` names rows on the
 * **server**, where `receipts`, `tax_*` and the agent tables all exist and
 * are all audited; the replica's thirteen-table subset is a fact about what
 * this device caches, not about what an audit trail may name. So
 * `get_audit_log("receipts", …)` is a perfectly well-formed question with a
 * real server-side answer, and the honest reply from the phone is the same
 * `unavailable_on_device` every other entity gets — not a throw claiming the
 * caller asked for something that does not exist. What is left is a shape
 * check: `entity` and `entityId` must be non-blank strings, because a blank
 * one is a caller bug rather than a question, and an argument this function
 * ignored would be a nullish "didn't work" one layer further out.
 *
 * **`entity` carries the SQL table name, not the camelCase property** —
 * `account_groups`, never `accountGroups`. That is what an executor's
 * `AuditSpec.entity` actually writes into `audit_log.entity`
 * (`create-counterparty.operation.ts`'s `entity: "counterparties"`), so it
 * is the only spelling a lookup here could ever match. Pinned over the whole
 * registry by `apps/api/src/registry/registry.test.ts` rather than restated
 * as a list this file would have to keep in step.
 */

import type { JsonValue } from "@waltning/core/json";
import type { Actor } from "@waltning/schema/enums";

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
  entity: string;
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
 * Always `{ status: "unavailable_on_device" }` — for every entity, including
 * the server-only ones, see this file's own doc above. Throws only on a blank
 * `entity` or `entityId`: an argument is checked for being a question at all,
 * then answered, never ignored.
 */
export function readAuditLog(entity: string, entityId: string): AuditLogResult {
  if (entity.trim() === "") {
    throw new Error("get_audit_log: entity must not be blank");
  }
  if (entityId.trim() === "") {
    throw new Error(`get_audit_log: entityId must not be blank (entity: "${entity}")`);
  }
  return { status: "unavailable_on_device" };
}
