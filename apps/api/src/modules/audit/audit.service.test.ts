/**
 * `get_audit_log`, server side — `audit_log` is server-only
 * (`architecture/14-local-first.md`), so this is the one place the read is
 * real; `@waltning/ledger`'s own `read-audit-log.ts` always answers
 * `unavailable_on_device`.
 */

import { id } from "@waltning/core/id";
import { auditLog, counterparties } from "@waltning/db/schema";
import { type Scratch, scratchDatabase } from "@waltning/db/test/scratch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listAuditLog } from "./audit.service.ts";

let s: Scratch;

const MAREK = id<"counterparties">("22222222-2222-2222-2222-000000000001");
const OTHER = id<"counterparties">("22222222-2222-2222-2222-000000000002");

beforeAll(async () => {
  s = await scratchDatabase("audit-log");
  await s.db.insert(counterparties).values([
    { id: MAREK, name: "Marek", kind: "person" },
    { id: OTHER, name: "Someone Else", kind: "person" },
  ]);
  // Explicit, distinct `at` values — two rows inserted in the same
  // statement can otherwise land at the same `defaultNow()` instant, which
  // makes "newest first" nondeterministic rather than actually unproven.
  await s.db.insert(auditLog).values([
    {
      entity: "counterparties",
      entityId: MAREK,
      action: "created",
      actor: "user",
      after: { name: "Marek" },
      at: new Date("2026-08-01T10:00:00Z"),
    },
    {
      entity: "counterparties",
      entityId: MAREK,
      action: "updated",
      actor: "agent",
      before: { name: "Marek" },
      after: { name: "Marek K." },
      at: new Date("2026-08-02T10:00:00Z"),
    },
    // A different entity, and a different row of the same entity — neither
    // should leak into Marek's own history.
    {
      entity: "counterparties",
      entityId: OTHER,
      action: "created",
      actor: "user",
      after: { name: "Someone Else" },
      at: new Date("2026-08-03T10:00:00Z"),
    },
  ]);
}, 60_000);

afterAll(async () => {
  await s?.drop();
});

describe("listAuditLog", () => {
  it("returns only the named entity's own rows, newest first", async () => {
    const rows = await listAuditLog(s.db, "counterparties", MAREK);

    expect(rows.map((r) => r.action)).toEqual(["updated", "created"]);
    expect(rows.every((r) => r.entityId === MAREK)).toBe(true);
    expect(rows[0]?.actor).toBe("agent");
    expect(rows[0]?.before).toEqual({ name: "Marek" });
    expect(rows[0]?.after).toEqual({ name: "Marek K." });
  });

  it("returns nothing for an entity with no recorded history", async () => {
    const rows = await listAuditLog(s.db, "counterparties", "33333333-3333-3333-3333-000000000000");
    expect(rows).toEqual([]);
  });
});
