/**
 * Replay protection, against real Postgres — C22.
 *
 * The defect this closes is not theoretical and it is nasty. Edit a synced
 * row's `is_business` offline; the drain commits; the connection drops before
 * the 200; the entry retries carrying the `updated_at` its own first
 * application already advanced. The entry is then permanently blocked by a
 * conflict with itself, and the interface reports that another device changed
 * the field. Nothing did.
 */

import { auditLog, counterparties, outboxReceipts } from "@waltning/db/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Scratch, scratchDatabase } from "../../../../packages/db/src/test/scratch.ts";
import type { OperationContext } from "./context.ts";
import { requestHash } from "./idempotency.ts";
import { registry } from "./index.ts";

let s: Scratch;
const base = (): Omit<OperationContext, "db"> => ({
  actor: "user",
  requestId: "test",
  now: new Date("2026-08-17T10:00:00Z"),
});

const ctxFor = (entryId?: string): OperationContext => ({
  ...base(),
  db: s.db,
  ...(entryId ? { idempotency: { entryId } } : {}),
});

const createCounterparty = registry.create_counterparty;

beforeAll(async () => {
  s = await scratchDatabase("idempotency");
});

afterAll(async () => {
  await s?.drop();
});

const ENTRY = "11111111-1111-7111-8111-111111111111";

describe("a repeated entry id", () => {
  it("returns the stored response without applying the write twice", async () => {
    const first = await createCounterparty.invoke({ name: "Marek", kind: "person" }, ctxFor(ENTRY));
    const second = await createCounterparty.invoke(
      { name: "Marek", kind: "person" },
      ctxFor(ENTRY),
    );

    // Verbatim: same id, not a second row, and not a duplicate-name refusal
    // either — which is what a naive retry would have produced.
    expect(second).toEqual(first);

    const rows = await s.db.select().from(counterparties);
    expect(rows.filter((r) => r.name === "Marek")).toHaveLength(1);
  });

  it("writes exactly one audit row across the retry", async () => {
    const rows = await s.db.select().from(auditLog);
    expect(rows.filter((r) => r.entity === "counterparties")).toHaveLength(1);
  });

  it("leaves exactly one receipt", async () => {
    const receipts = await s.db.select().from(outboxReceipts);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]?.op).toBe("create_counterparty");
  });
});

describe("a repeated entry id carrying a different request", () => {
  it("is refused rather than applied", async () => {
    // Two different intentions cannot share one entry id. Applying the second
    // silently would lose the first, and returning the first's response would
    // be a lie about what happened.
    await expect(
      createCounterparty.invoke({ name: "Someone Else", kind: "company" }, ctxFor(ENTRY)),
    ).rejects.toThrow(/already used for a different request/);

    const rows = await s.db.select().from(counterparties);
    expect(rows.some((r) => r.name === "Someone Else")).toBe(false);
  });
});

describe("without an entry id", () => {
  it("applies every call — an interactive write is not a replay", async () => {
    await createCounterparty.invoke({ name: "Tomek", kind: "person" }, ctxFor());
    await expect(
      createCounterparty.invoke({ name: "Tomek", kind: "person" }, ctxFor()),
    ).rejects.toThrow(/already exists/);

    // The second was refused by the unique index, not by a receipt — the user
    // is watching, and a second tap is a second intention.
    const receipts = await s.db.select().from(outboxReceipts);
    expect(receipts.every((r) => r.entryId !== null)).toBe(true);
  });
});

describe("atomicity", () => {
  /**
   * The reason all three writes share one transaction. A receipt for work that
   * rolled back would make a replay return a response for something that never
   * happened; effects without a receipt would replay twice.
   */
  it("writes no receipt and no audit row when the handler fails", async () => {
    const before = {
      receipts: (await s.db.select().from(outboxReceipts)).length,
      audit: (await s.db.select().from(auditLog)).length,
      rows: (await s.db.select().from(counterparties)).length,
    };

    const failing = "22222222-2222-7222-8222-222222222222";
    await expect(
      // Duplicate name: the database refuses it after the receipt check has
      // already passed, so the rollback has to take the receipt with it.
      createCounterparty.invoke({ name: "  marek  ", kind: "person" }, ctxFor(failing)),
    ).rejects.toThrow(/already exists/);

    expect((await s.db.select().from(outboxReceipts)).length).toBe(before.receipts);
    expect((await s.db.select().from(auditLog)).length).toBe(before.audit);
    expect((await s.db.select().from(counterparties)).length).toBe(before.rows);
  });

  it("lets the same entry retry successfully after a failure", async () => {
    // Nothing was recorded, so the id is still free — which is the point of
    // rolling the receipt back with the effects.
    const failing = "22222222-2222-7222-8222-222222222222";
    const row = await createCounterparty.invoke({ name: "Kasia", kind: "person" }, ctxFor(failing));
    expect(row.name).toBe("Kasia");
  });
});

describe("the request hash", () => {
  it("ignores property order, so a differently serialized retry is still a replay", () => {
    expect(requestHash("op", { a: 1, b: { c: 2, d: 3 } })).toBe(
      requestHash("op", { b: { d: 3, c: 2 }, a: 1 }),
    );
  });

  it("separates different payloads and different operations", () => {
    expect(requestHash("op", { a: 1 })).not.toBe(requestHash("op", { a: 2 }));
    expect(requestHash("op_a", { a: 1 })).not.toBe(requestHash("op_b", { a: 1 }));
  });
});
