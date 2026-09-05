import { id } from "@waltning/core/id";
import { describe, expect, it } from "vitest";
import { readAuditLog } from "./read-audit-log.ts";

/**
 * `audit_log` is not a replicated table (`architecture/14-local-first.md`) —
 * see `read-audit-log.ts`'s own doc. This pins the one behaviour that file
 * promises: empty, for any entity and any id, always.
 */
describe("readAuditLog", () => {
  it("is always empty — the phone holds no audit_log rows for any entity", () => {
    expect(
      readAuditLog("transactions", id<"transactions">("11111111-1111-4111-8111-111111111111")),
    ).toEqual([]);
    expect(
      readAuditLog("accounts", id<"accounts">("22222222-2222-4222-8222-222222222222")),
    ).toEqual([]);
  });
});
