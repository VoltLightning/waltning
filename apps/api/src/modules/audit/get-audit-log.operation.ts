/**
 * `get_audit_log(entity, id)` — S09's audit history.
 *
 * **Not offline-eligible.** `audit_log` is server-only
 * (`architecture/14-local-first.md`); the phone's own `getAuditLog` always
 * answers `unavailable_on_device` because there is nothing local to read.
 * This is where the read is real.
 */

import { z } from "zod";
import { AUDIT_ENTITIES } from "../../registry/audit-entities.ts";
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
    "as SQL spells it (e.g. 'transactions', 'account_groups'); id is that row's own id.",
  input: z.object({
    // `z.enum` over the schema's own table names, not `z.string()`. The value
    // goes straight into a `where entity = $1`, so an unrecognised spelling —
    // `accountGroups` for `account_groups`, a typo, a table that does not
    // exist — returns an empty history that is indistinguishable from a row
    // with nothing recorded against it. As an enum it is a validation error
    // instead, and the tool's JSON Schema carries the permitted names, so the
    // agent reads them rather than guessing.
    entity: z.enum(AUDIT_ENTITIES),
    // `audit_log.entity_id` is a uuid: a natural key (`PLN`, a currency code)
    // must fail here, by name, rather than reach Postgres as bad uuid syntax.
    entityId: z.uuid(),
  }),
  handler: (input, ctx: OperationContext) => listAuditLog(ctx.db, input.entity, input.entityId),
});
