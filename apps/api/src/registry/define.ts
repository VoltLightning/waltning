/**
 * Declaring an operation, with the audit row, replay protection and error
 * translation attached.
 *
 * `@waltning/core`'s `defineOperation` can do none of them: it has no database,
 * and it must not have one — the phone imports `core`. Putting them in the
 * tRPC router would mean the agent, which calls the registry directly and never
 * travels that path, silently produces no audit trail and no receipt. Putting
 * them in each handler means one will eventually forget, which is the whole
 * reason `operations.md` says the registry emits these rather than the
 * implementation.
 *
 * So they all attach **at declaration time**: this wraps the handler before
 * the operation exists, and `invoke` runs the wrapper. There is no version of
 * the operation without them. §11.2's approval gate joined them for exactly
 * that reason — it had been written, tested, and called by nothing.
 *
 * **One transaction covers all three.** The write, its audit row and its
 * receipt commit together or not at all. Any other arrangement leaves a window
 * where a crash produces a receipt for work that rolled back — a replay would
 * then return a response for something that never happened — or effects with
 * no receipt, which replay silently twice.
 */

import type { JsonValue } from "@waltning/core/json";
import { type GateFields, gateDecision } from "@waltning/core/registry/gate";
import {
  defineOperation as defineCoreOperation,
  type Operation,
  type OperationKind,
} from "@waltning/core/registry/operation";
import { auditLog } from "@waltning/db/schema";
import type { z } from "zod";
import { DomainError } from "../common/errors.ts";
import { toDomainError } from "../common/pg-errors.ts";
import type { OperationContext } from "./context.ts";
import { findReceipt, requestHash, writeReceipt } from "./idempotency.ts";

/**
 * Turns a Postgres refusal into the domain error it means.
 *
 * Wrapped here rather than in each service for the same reason the audit row is
 * here: a service that forgets produces a refusal wearing the wrong code, and
 * nothing fails — the write is still refused, so it reads as working. A guard
 * arriving as `internal` is retried by the drain, and `period_closed` is the
 * one that never resolves on its own.
 *
 * A service that can word the message better throws its own `DomainError`
 * first, and that passes straight through.
 */
async function translating<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof DomainError) throw e;
    throw toDomainError(e) ?? e;
  }
}

/**
 * §11.2's approval gate, at the only point that cannot be bypassed.
 *
 * `gateDecision` has existed, tested, since the gate was designed — and was
 * called by nothing. §11.2 says every write gates by default; the code had no
 * default at all, so the guarantee held exactly as far as whoever wrote the
 * next caller remembered it. That is the same failure mode this file already
 * argues against for the audit row, one rule further down.
 *
 * **Only agent calls are gated**, and that is the rule rather than an
 * optimisation: a person pressing save has already approved it — that *is* the
 * approval — while an agent acting under a bounded grant has not. Gating user
 * writes would make the approval card meaningless by showing it for everything.
 *
 * Refusing is the whole mechanism for now. Presenting the card and applying the
 * approved call belong to the agent loop, which does not exist; what must be
 * true before it does is that a gated write **cannot run**, and now it cannot.
 */
function gate(
  // `GateFields` rather than the same four fields written out again — this
  // file having restated them is what showed the placeholder generics in
  // `gate.ts` were not carrying their weight.
  op: GateFields,
  input: unknown,
  ctx: OperationContext,
): void {
  if (ctx.actor !== "agent") return;

  const decision = gateDecision(op, input, ctx.grant ?? null, ctx.now);
  if (!decision.gated) return;

  throw new DomainError(
    "approval_required",
    decision.reason === "tax-sensitive-field"
      ? `${op.name} writes ${decision.fields.join(", ")} — approval is required whatever grant is in force (§11.2)`
      : `${op.name} requires approval before an agent may run it (${decision.reason})`,
    { reason: decision.reason, fields: decision.fields },
  );
}

export function defineOperation<Input extends z.ZodTypeAny, Output, Kind extends OperationKind>(
  op: Omit<Operation<Input, Output, OperationContext, Kind>, "invoke">,
): Operation<Input, Output, OperationContext, Kind> {
  // Reads have nothing to audit and nothing to replay: running one twice is
  // the same as running it once, which is what makes it a read. They still get
  // error translation — a read can hit a guard through a view or a function,
  // and "which rule refused this" is not a property of being a write.
  if (op.kind === "read" || !op.audit) {
    const readInner = op.handler.bind(op);
    return defineCoreOperation({
      ...op,
      handler: (input, ctx) => translating(async () => readInner(input, ctx)),
    });
  }

  const audit = op.audit;
  const inner = op.handler.bind(op);

  return defineCoreOperation({
    ...op,
    async handler(input, ctx) {
      gate(op, input, ctx);

      return translating(() =>
        ctx.db.transaction(async (tx) => {
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
        }),
      );
    },
  });
}
