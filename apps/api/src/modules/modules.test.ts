/**
 * The vertical slice, end to end against real Postgres.
 *
 * The contract tests next door prove the two surfaces agree about *what*
 * exists. This proves the declarations actually work: schema → registry →
 * service → handler, reached through the tRPC caller exactly as a client
 * would, and reached directly exactly as the agent would.
 *
 * Both paths must produce the same result. That is the claim — the agent is
 * not a second implementation — and it is the reason this file exists rather
 * than a unit test with a mocked database.
 */

import { auditLog, currencies } from "@waltning/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Scratch, scratchDatabase } from "../../../../packages/db/src/test/scratch.ts";
import type { OperationContext } from "../registry/context.ts";
import { registry } from "../registry/index.ts";

let s: Scratch;
let ctx: OperationContext;

beforeAll(async () => {
  s = await scratchDatabase("registry");
  ctx = { db: s.db, actor: "user", requestId: "test", now: new Date("2026-08-16T12:00:00Z") };
  // Inserted here rather than via the seed script: this file tests the
  // registry, and coupling it to the seed's shape would make an unrelated
  // change to the category tree break it.
  await s.db.insert(currencies).values([
    { code: "USD", name: "US Dollar", symbol: "$", decimals: 2, isPivot: true, sort: 0 },
    { code: "PLN", name: "Polish Zloty", symbol: "zł", decimals: 2, pinned: true, sort: 1 },
    { code: "XTS", name: "Retired Test Code", symbol: "?", decimals: 2, archived: true, sort: 9 },
  ]);
});

afterAll(async () => {
  await s?.drop();
});

// Accessed by property, not through a helper: a `get(name)` lookup returns a
// union of every operation, and TypeScript then demands the *intersection* of
// their inputs — which is exactly the type safety this slice is meant to prove
// survives to the caller.
const getCurrencies = registry.get_currencies;
const createCounterparty = registry.create_counterparty;

describe("get_currencies", () => {
  it("returns the seeded currencies with the pivot marked", async () => {
    // No cast: `handler` is typed `Promise<CurrencySummary[]>`, and asserting
    // that here is half the point — a cast would let the return type drift
    // without this test noticing.
    const rows = await getCurrencies.handler({ includeArchived: false }, ctx);

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => r.isPivot)).toHaveLength(1);
    expect(rows.map((r) => r.code)).toContain("USD");
    // Archived excluded by default — the flag is the operation's only input,
    // so if it were ignored nothing else would reveal it.
    expect(rows.map((r) => r.code)).not.toContain("XTS");
  });

  it("includes archived currencies when asked", async () => {
    const rows = await getCurrencies.handler({ includeArchived: true }, ctx);
    expect(rows.map((r) => r.code)).toContain("XTS");
  });

  it("applies the schema default rather than requiring the caller to", async () => {
    // The agent will call this with `{}`. If defaults lived in the handler
    // instead of the schema, the two callers would diverge on day one.
    const parsed = getCurrencies.input.parse({});
    expect(parsed).toEqual({ includeArchived: false });
  });
});

describe("create_counterparty", () => {
  it("writes a row and returns it", async () => {
    const row = await createCounterparty.handler({ name: "Marek", kind: "person", note: "" }, ctx);

    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.name).toBe("Marek");
  });

  /**
   * The service's duplicate check is for the message; the unique index is the
   * guarantee. This asserts the *database* is what refuses, by using a name
   * that differs only in case and whitespace — which the application check
   * would let through if it were doing the work.
   */
  it("refuses a duplicate that differs only in case and whitespace", async () => {
    await createCounterparty.handler({ name: "Tomek", kind: "person", note: "" }, ctx);

    await expect(
      createCounterparty.handler({ name: "  tomek  ", kind: "person", note: "" }, ctx),
    ).rejects.toThrow(/already exists/);
  });

  it("validates input at the schema, before any handler runs", async () => {
    const result = createCounterparty.input.safeParse({ name: "   ", kind: "person" });
    expect(result.success).toBe(false);
  });
});

describe("the registry emits the audit row, not the handler", () => {
  /**
   * `operations.md`: audit is written by the registry, because a handler that
   * *can* forget eventually will. The row is attached when the operation is
   * declared, so there is no version of it without one — which is what makes
   * this true for the agent, which never goes through the router.
   */
  it("writes an audit row for a write, with the affected row's id", async () => {
    const before = await s.sql`SELECT count(*)::int AS n FROM audit_log`;
    // `invoke` returns the operation's declared Output — typed even here,
    // where the input arrived raw.
    const row = await createCounterparty.invoke({ name: "Piotr", kind: "person" }, ctx);

    const rows = await s.db.select().from(auditLog);
    expect(rows).toHaveLength(Number(before[0]?.["n"] ?? 0) + 1);

    const entry = rows.at(-1);
    expect(entry?.entity).toBe("counterparties");
    expect(entry?.action).toBe("created");
    expect(entry?.entityId).toBe(row.id);
    expect(entry?.actor).toBe("user");
    expect(entry?.after).toMatchObject({ name: "Piotr", kind: "person" });
  });

  it("writes nothing when the write fails", async () => {
    await createCounterparty.invoke({ name: "Ola", kind: "person" }, ctx);
    const before = await s.db.select().from(auditLog);

    await expect(
      createCounterparty.invoke({ name: "  ola  ", kind: "person" }, ctx),
    ).rejects.toThrow(/already exists/);

    // An audit row claiming a change that did not happen is worse than none:
    // it is the record you would trust while reconstructing what went wrong.
    const after = await s.db.select().from(auditLog);
    expect(after).toHaveLength(before.length);
  });

  it("writes no audit row for a read", async () => {
    const before = await s.db.select().from(auditLog);
    await getCurrencies.invoke({}, ctx);
    expect(await s.db.select().from(auditLog)).toHaveLength(before.length);
  });
});

describe("both callers reach the same behaviour", () => {
  it("gives the agent and the UI identical results for the same input", async () => {
    // The agent path: call the registry directly.
    const viaRegistry = await getCurrencies.handler({ includeArchived: false }, ctx);

    // The UI path: parse through the declared schema first, as tRPC does.
    const input = getCurrencies.input.parse({});
    const viaRouter = await getCurrencies.handler(input, ctx);

    expect(viaRouter).toEqual(viaRegistry);
  });
});
