/**
 * Declaring an operation, with the audit row attached.
 *
 * `@waltning/core`'s `defineOperation` cannot write the audit row: it has no
 * database, and it must not — the phone imports `core`. But putting the write
 * in the tRPC router would mean the agent, which calls the registry directly
 * and never travels that path, silently produces no audit trail. And putting
 * it in each handler means one will eventually forget, which is the whole
 * reason `operations.md` says the registry emits the row rather than the
 * implementation.
 *
 * So it is attached **at declaration time**: this wraps the handler before the
 * operation exists, and `invoke` runs the wrapper. Every caller gets the audit
 * row because there is no version of the operation without it.
 */

import {
  defineOperation as defineCoreOperation,
  type Operation,
  type OperationKind,
} from "@waltning/core";
import { auditLog } from "@waltning/db";
import type { z } from "zod";
import type { OperationContext } from "./context.ts";

export function defineOperation<Input extends z.ZodTypeAny, Output, Kind extends OperationKind>(
  op: Omit<Operation<Input, Output, OperationContext, Kind>, "invoke">,
): Operation<Input, Output, OperationContext, Kind> {
  // Reads have nothing to audit; `defineOperation` in core rejects a read that
  // claims otherwise, so `audit` being absent here is already guaranteed.
  if (op.kind === "read" || !op.audit) return defineCoreOperation(op);

  const audit = op.audit;
  const inner = op.handler.bind(op);

  return defineCoreOperation({
    ...op,
    async handler(input, ctx) {
      const output = await inner(input, ctx);

      // After the handler, so a failed write leaves no audit row claiming it
      // happened. Not in a transaction with it yet — that arrives with the
      // idempotency middleware, which has to own the transaction boundary for
      // `outbox_receipts` anyway.
      await ctx.db.insert(auditLog).values({
        entity: audit.entity,
        entityId: audit.entityId(input, output),
        action: audit.action,
        actor: ctx.actor,
        before: audit.before?.(input, output) ?? null,
        after: audit.after?.(input, output) ?? null,
      });

      return output;
    },
  });
}
