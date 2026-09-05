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
 * This function still exists, typed against `audit_log`'s real columns
 * (`SPEC.md` §6.2 — `entity`, `entity_id`, `action`, `actor`, `before`,
 * `after`, `at`), so the session and the phone-ledger port can carry the
 * same `getAuditLog` shape every other read has and a real handler can
 * replace this one later without moving where it is called from. Until
 * then it always answers empty — not partial, not stale, because there is
 * no local copy to be either of those things. S09 §6 states that plainly
 * rather than as a maybe: `AuditHistory` reads empty and says so offline,
 * every time, regardless of `entity` or `entityId`.
 */

import type { IdTable } from "@waltning/core/id";
import type { JsonValue } from "@waltning/core/json";

/** `SPEC.md` §6.2's own enumeration, plus `system` — §15.1's continuous invariants write `actor = 'system'` on a violation, a value §6.2's own list omits. */
export type AuditActor = "user" | "agent" | "import" | "migration" | "system";

/** One `audit_log` row, field-for-field (`SPEC.md` §6.2). */
export type LocalAuditEntry = {
  id: string;
  entity: IdTable;
  entityId: string;
  action: string;
  actor: AuditActor;
  before: JsonValue | null;
  after: JsonValue | null;
  at: string;
};

/** Always empty on the phone — see this file's own doc above. */
export function readAuditLog(_entity: IdTable, _entityId: string): readonly LocalAuditEntry[] {
  return [];
}
