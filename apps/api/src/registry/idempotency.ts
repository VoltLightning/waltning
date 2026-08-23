/**
 * Replay protection for outbox entries — C22, `architecture/08`.
 *
 * The whole point is the transaction boundary. The receipt is written **in the
 * same transaction as the effects**, so a receipt cannot exist for work that
 * rolled back, and work cannot exist without a receipt. Anything less and a
 * crash between the two leaves the two ledgers disagreeing in whichever
 * direction the code happened to order them.
 *
 * Checked **first**, before the handler runs, and for every write — not only
 * inserts. The old claim rested on the `external_id` unique index, which fires
 * only on INSERT, so every update and delete had no protection at all.
 */

import { createHash } from "node:crypto";
import type { JsonValue } from "@waltning/core/json";
import type { Transaction } from "@waltning/db/client";
import { outboxReceipts } from "@waltning/db/schema";
import { eq } from "drizzle-orm";
import { DomainError } from "../common/errors.ts";

/** Present when the call came from a device outbox; absent for interactive use. */
export type Idempotency = {
  /** The client-minted entry id — the idempotency key. */
  entryId: string;
};

/**
 * A stable hash of the request payload.
 *
 * Keys are sorted, so two payloads that differ only in property order hash the
 * same — otherwise a retry serialized differently would look like a different
 * intention and be refused. Sorting is recursive because nested objects have
 * the same problem.
 *
 * **The `\0` separates the operation name from its payload.** It is defence in
 * depth rather than the thing doing the work: `canonical` always emits a
 * self-delimiting JSON value, and a proper suffix of one is not a valid one, so
 * `("ab", "c")` and `("a", "bc")` were never going to collide anyway. The
 * separator is what keeps that true if `canonical` is ever changed to emit
 * something less strict. Do not delete it on the grounds that no test proves it
 * necessary — none can, and that is the point of a floor.
 *
 * It was written as a *literal* NUL byte,
 * which is byte-identical at run time and costly everywhere else: git classified
 * this file as binary, so it has never shown a diff in review and never will,
 * and the byte is invisible in every editor. Anything that normalises the file
 * drops it silently — and then every hash changes at once, `findReceipt` sees
 * a different request for every entry already queued, and refuses each retry as
 * a mismatch. The escape is the same two bytes to `sha256` and survives being
 * read by a human.
 */
export function requestHash(op: string, input: unknown): string {
  return createHash("sha256")
    .update(`${op}\0${canonical(input)}`)
    .digest("hex");
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  // No cast: the two guards above already narrow `value` to a non-null object,
  // and `Object.entries` asks for nothing more. The assertion restated what the
  // lines above prove, which means the two were free to disagree.
  const entries = Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

export type ReplayOutcome<Output> = { replayed: true; response: Output } | { replayed: false };

/**
 * Look for a receipt.
 *
 * Takes a `Transaction`, not a context or a `DbHandle`, and that is the whole
 * safety property: a pooled handle is not assignable, so writing the receipt
 * outside the transaction that carries the effects **fails to compile**. It was
 * previously a `ctx`, and passing the un-transacted one passed every test —
 * the mistake is only observable under concurrency, which is exactly the kind
 * a test will not catch and a type will.
 *
 * A repeat with the same hash returns the stored response verbatim, without
 * re-evaluating the version check — which is what makes a timeout safe to
 * retry and the drain's report stable across retries.
 *
 * A repeat with a *different* hash is a genuine violation: two different
 * intentions cannot share one entry id, and silently applying the second would
 * lose the first.
 */
export async function findReceipt<Output>(
  tx: Transaction,
  entryId: string,
  hash: string,
): Promise<ReplayOutcome<Output>> {
  const [receipt] = await tx
    .select({ requestHash: outboxReceipts.requestHash, response: outboxReceipts.response })
    .from(outboxReceipts)
    .where(eq(outboxReceipts.entryId, entryId))
    .limit(1);

  if (!receipt) return { replayed: false };

  if (receipt.requestHash !== hash) {
    throw new DomainError(
      "validation",
      "this outbox entry id was already used for a different request",
      {
        fieldErrors: [{ path: "entryId", message: "already used for a different request" }],
      },
    );
  }

  return { replayed: true, response: receipt.response as Output };
}

export async function writeReceipt(
  tx: Transaction,
  entryId: string,
  op: string,
  hash: string,
  response: JsonValue,
): Promise<void> {
  await tx.insert(outboxReceipts).values({ entryId, op, requestHash: hash, response });
}
