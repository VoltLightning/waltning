import { id } from "@waltning/core/id";
import { describe, expect, it } from "vitest";
import { readAuditLog } from "./read-audit-log.ts";

/**
 * `audit_log` is not a replicated table (`architecture/14-local-first.md`) —
 * see `read-audit-log.ts`'s own doc. This pins the behaviour that file
 * promises: a status, never a bare empty array standing in for "no data" —
 * and arguments that are checked, not silently ignored.
 */
describe("readAuditLog", () => {
  it("answers unavailable_on_device for any table the ledger's schema holds", () => {
    expect(
      readAuditLog("transactions", id<"transactions">("11111111-1111-4111-8111-111111111111")),
    ).toEqual({ status: "unavailable_on_device" });
    expect(
      readAuditLog("accounts", id<"accounts">("22222222-2222-4222-8222-222222222222")),
    ).toEqual({ status: "unavailable_on_device" });
    expect(
      readAuditLog("categories", id<"categories">("33333333-3333-4333-8333-333333333333")),
    ).toEqual({ status: "unavailable_on_device" });
  });

  it("throws for an entity this ledger's schema does not hold, rather than answering silently", () => {
    // `agentSessions` is a real `IdTable` value (server-only, per
    // `architecture/14-local-first.md`) — exactly the case the schema check
    // exists to catch, a valid-looking argument this ledger cannot honour.
    expect(() => readAuditLog("agentSessions", "1")).toThrow(/agentSessions/);
  });

  it("throws for a blank entityId rather than answering silently", () => {
    expect(() => readAuditLog("transactions", "")).toThrow(/entityId/);
    expect(() => readAuditLog("transactions", "   ")).toThrow(/entityId/);
  });
});
