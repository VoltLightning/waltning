/**
 * `get_audit_log(entity, id)` — S09's audit history.
 *
 * **Not offline-eligible.** `audit_log` is server-only
 * (`architecture/14-local-first.md`); the phone's own `getAuditLog` always
 * answers `unavailable_on_device` because there is nothing local to read.
 * This is where the read is real.
 */

import { z } from "zod";
import type { OperationContext } from "../../registry/context.ts";
import { defineOperation } from "../../registry/define.ts";
import { listAuditLog } from "./audit.service.ts";

export const getAuditLog = defineOperation({
  name: "get_audit_log",
  kind: "read",
  autoEligible: true,
  offlineEligible: false,
  opVersion: 1,
  description:
    "The audit history for one entity — every recorded change, newest first, with the actor " +
    "(user, agent, import or migration) and the before/after values. entity names the table " +
    "(e.g. 'transactions'); id is that row's own id.",
  input: z.object({
    entity: z.string().min(1),
    entityId: z.string().min(1),
  }),
  handler: (input, ctx: OperationContext) => listAuditLog(ctx.db, input.entity, input.entityId),
});
