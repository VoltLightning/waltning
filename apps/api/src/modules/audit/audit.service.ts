/**
 * `get_audit_log(entity, id)` — the read half of §11.0's audit trail.
 *
 * `audit_log` is server-only (`architecture/14-local-first.md`'s "roughly
 * thirteen tables are shared" names it explicitly excluded), so unlike every
 * other read in this module this one has no phone-side counterpart to keep
 * in parity with — `@waltning/ledger`'s own `read-audit-log.ts` always
 * answers `unavailable_on_device` for exactly this reason. Here, where the
 * table actually exists, the read is real.
 */

import type { JsonValue } from "@waltning/core/json";
import type { DbHandle } from "@waltning/db/client";
import { auditLog } from "@waltning/db/schema";
import type { Actor } from "@waltning/schema/enums";
import { and, desc, eq } from "drizzle-orm";

export type AuditLogRow = {
  id: string;
  entity: string;
  entityId: string;
  action: string;
  actor: Actor;
  before: JsonValue | null;
  after: JsonValue | null;
  at: Date;
};

/** `audit_log_entity_idx` covers `(entity, entity_id)` — no new index needed. */
export async function listAuditLog(
  db: DbHandle,
  entity: string,
  entityId: string,
): Promise<AuditLogRow[]> {
  const rows = await db
    .select({
      id: auditLog.id,
      entity: auditLog.entity,
      entityId: auditLog.entityId,
      action: auditLog.action,
      actor: auditLog.actor,
      before: auditLog.before,
      after: auditLog.after,
      at: auditLog.at,
    })
    .from(auditLog)
    .where(and(eq(auditLog.entity, entity), eq(auditLog.entityId, entityId)))
    .orderBy(desc(auditLog.at));

  // `before`/`after` are `jsonb`, which drizzle hands back as its own driver
  // type rather than this module's `JsonValue` — narrowed here, once, at the
  // boundary where it actually arrives off the wire, rather than trusted
  // silently at every caller.
  return rows.map((row) => ({
    ...row,
    before: row.before as JsonValue | null,
    after: row.after as JsonValue | null,
  }));
}
