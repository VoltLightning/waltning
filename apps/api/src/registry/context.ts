/**
 * What a handler is given.
 *
 * Deliberately not the tRPC context: a handler must run identically whether it
 * was reached over HTTP or by the agent calling the registry directly. Anything
 * request-shaped — headers, cookies, the raw request — stops it being the same
 * operation on both paths, which is the drift §11.0 exists to prevent.
 */

import type { Database } from "@waltning/db";

export type Actor = "user" | "agent" | "import" | "migration";

export type OperationContext = {
  db: Database;
  /** Written to every audit row the registry emits. */
  actor: Actor;
  /** One id per request, joining the audit row to the operational log. */
  requestId: string;
  now: Date;
};
