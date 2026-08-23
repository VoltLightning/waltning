/**
 * What a handler is given.
 *
 * Deliberately not the tRPC context: a handler must run identically whether it
 * was reached over HTTP or by the agent calling the registry directly. Anything
 * request-shaped — headers, cookies, the raw request — stops it being the same
 * operation on both paths, which is the drift §11.0 exists to prevent.
 */

import type { AutoGrant } from "@waltning/core/registry/gate";
import type { DbHandle } from "@waltning/db/client";
import type { Idempotency } from "./idempotency.ts";

export type Actor = "user" | "agent" | "import" | "migration";

export type OperationContext = {
  db: DbHandle;
  /** Written to every audit row the registry emits. */
  actor: Actor;
  /** One id per request, joining the audit row to the operational log. */
  requestId: string;
  now: Date;
  /**
   * Present when the call arrived from a device outbox, absent for interactive
   * use. An interactive call has no entry id to be idempotent against — the
   * user is watching the result, and a second tap is a second intention.
   */
  idempotency?: Idempotency | undefined;
  /**
   * The bounded auto-mode grant in force (§11.2), for agent calls.
   *
   * `null` or absent means the default — every write gates. It is read only
   * when `actor` is `"agent"`: a user pressing save is direct intent and has
   * nothing to approve. Passing a grant on a user call changes nothing, which
   * is deliberate — the gate must not become a way to *lift* a check.
   */
  grant?: AutoGrant;
};
