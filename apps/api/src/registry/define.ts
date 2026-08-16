/**
 * Declaring an operation, with the audit row and replay protection attached.
 *
 * `@waltning/core`'s `defineOperation` cannot do either: it has no database,
 * and it must not have one — the phone imports `core`. Putting them in the
 * tRPC router would mean the agent, which calls the registry directly and never
 * travels that path, silently produces no audit trail and no receipt. Putting
 * them in each handler means one will eventually forget, which is the whole
 * reason `operations.md` says the registry emits these rather than the
 * implementation.
 *
 * So both attach **at declaration time**: this wraps the handler before the
 * operation exists, and `invoke` runs the wrapper. There is no version of the
 * operation without them.
 *
 * **One transaction covers all three.** The write, its audit row and its
 * receipt commit together or not at all. Any other arrangement leaves a window
 * where a crash produces a receipt for work that rolled back — a replay would
 * then return a response for something that never happened — or effects with
 * no receipt, which replay silently twice.
 */

import {
  defineOperation as defineCoreOperation,
  type JsonValue,
  type Operation,
  type OperationKind,
} from "@waltning/core";
import { auditLog } from "@waltning/db";
import type { z } from "zod";
import type { OperationContext } from "./context.ts";
import { findReceipt, requestHash, writeReceipt } from "./idempotency.ts";

export function defineOperation<Input extends z.ZodTypeAny, Output, Kind extends OperationKind>(
  op: Omit<Operation<Input, Output, OperationContext, Kind>, "invoke">,
): Operation<Input, Output, OperationContext, Kind> {
  // Reads have nothing to audit and nothing to replay: running one twice is
  // the same as running it once, which is what makes it a read.
  if (op.kind === "read" || !op.audit) return defineCoreOperation(op);

  const audit = op.audit;
  const inner = op.handler.bind(op);

  return defineCoreOperation({
    ...op,
    async handler(input, ctx) {
      return ctx.db.transaction(async (tx) => {
        // The handler must write through the *transaction*, not the pooled
        // handle it was given — otherwise its effects commit separately and
        // the atomicity above is decorative.
        const txCtx: OperationContext = { ...ctx, db: tx };

        const entryId = ctx.idempotency?.entryId;
        const hash = entryId ? requestHash(op.name, input) : undefined;

        if (entryId && hash) {
          const found = await findReceipt<Output>(tx, entryId, hash);
          // Returned verbatim, without re-running the handler or re-evaluating
          // any version check. A retry after a lost response must be
          // indistinguishable from the first call.
          if (found.replayed) return found.response;
        }

        const output = await inner(input, txCtx);

        await txCtx.db.insert(auditLog).values({
          entity: audit.entity,
          entityId: audit.entityId(input, output),
          action: audit.action,
          actor: ctx.actor,
          before: audit.before?.(input, output) ?? null,
          after: audit.after?.(input, output) ?? null,
        });

        if (entryId && hash) {
          await writeReceipt(tx, entryId, op.name, hash, output as JsonValue);
        }

        return output;
      });
    },
  });
}
