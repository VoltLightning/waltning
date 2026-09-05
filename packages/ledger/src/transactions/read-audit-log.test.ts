import { id } from "@waltning/core/id";
import { describe, expect, it } from "vitest";
import { readAuditLog } from "./read-audit-log.ts";

/**
 * `audit_log` is not a replicated table (`architecture/14-local-first.md`) —
 * see `read-audit-log.ts`'s own doc. This pins the behaviour that file
 * promises: a status, never a bare empty array standing in for "no data" —
 * and arguments checked for shape, not against the replica's table list.
 */
describe("readAuditLog", () => {
  it("answers unavailable_on_device for a table this device caches", () => {
    expect(
      readAuditLog("transactions", id<"transactions">("11111111-1111-4111-8111-111111111111")),
    ).toEqual({ status: "unavailable_on_device" });
    expect(
      readAuditLog("accounts", id<"accounts">("22222222-2222-4222-8222-222222222222")),
    ).toEqual({ status: "unavailable_on_device" });
  });

  it("answers unavailable_on_device for a server-only entity too, rather than throwing", () => {
    // `receipts` is a real, audited server table this replica does not carry
    // (`architecture/14-local-first.md`). The device cannot answer it — which
    // is exactly what `unavailable_on_device` says. A throw here would claim
    // the caller asked for something that does not exist, which is false.
    expect(
      readAuditLog("receipts", id<"transactions">("33333333-3333-4333-8333-333333333333")),
    ).toEqual({ status: "unavailable_on_device" });
    expect(readAuditLog("agent_sessions", "44444444-4444-4444-8444-444444444444")).toEqual({
      status: "unavailable_on_device",
    });
  });

  it("throws for a blank argument rather than answering silently", () => {
    expect(() => readAuditLog("transactions", "")).toThrow(/entityId/);
    expect(() => readAuditLog("transactions", "   ")).toThrow(/entityId/);
    expect(() => readAuditLog("", "44444444-4444-4444-8444-444444444444")).toThrow(/entity/);
  });
});
