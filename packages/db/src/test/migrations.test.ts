/**
 * The migration set, tested by execution.
 *
 * `defects.md` says every migration applies cleanly from empty and that
 * `verify_t1()` was made to fail two ways. Both were true when someone did it
 * by hand. This is the version that stays true.
 */

import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Scratch, scratchDatabase } from "./scratch.ts";

let s: Scratch;

beforeAll(async () => {
  s = await scratchDatabase("migrations");
});

afterAll(async () => {
  await s?.drop();
});

describe("migrations apply from empty", () => {
  it("applies exactly what the journal lists", async () => {
    // Compared against the journal, not a hardcoded count: a literal would
    // fail on the next migration for the wrong reason, and the thing worth
    // asserting is agreement between the two, not a number.
    const journal = JSON.parse(
      readFileSync(new URL("../../drizzle/meta/_journal.json", import.meta.url), "utf8"),
    ) as { entries: unknown[] };
    const rows = await s.sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations`;
    expect(Number(rows[0]?.count)).toBe(journal.entries.length);
  });

  it("creates the tables the schema declares", async () => {
    const rows = await s.sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;
    const names = rows.map((r) => r.table_name);

    // Spot-check across migrations rather than pinning a count: a count would
    // fail on every future migration for no reason.
    for (const t of [
      "transactions",
      "accounts",
      "currencies",
      "fx_rates",
      "recurring_transactions",
      "debt_reassignments", // 0007
      "agent_memory", // 0008's CHECK target
      "tax_residency", // 0009
    ]) {
      expect(names, `missing table ${t}`).toContain(t);
    }
  });

  it("creates the tax_ledger view and the export role", async () => {
    const [view] = await s.sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM information_schema.views
      WHERE table_schema = 'public' AND table_name = 'tax_ledger'`;
    expect(Number(view?.n)).toBe(1);

    const [role] = await s.sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM pg_roles WHERE rolname = 'waltning_export'`;
    expect(Number(role?.n)).toBe(1);
  });
});

describe("verify_t1", () => {
  it("returns all-true on a correctly migrated database", async () => {
    const rows = await s.sql<{ ok: boolean }[]>`SELECT * FROM verify_t1()`;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.ok).toBe(true);
  });

  /**
   * A gate never seen to fail is not a gate. This is the first of the two ways
   * T1 can break — a GRANT on the base table — and it runs in its own scratch
   * database because it deliberately damages the thing it checks.
   */
  it("fails when the export role is granted the base table", async () => {
    const bad = await scratchDatabase("t1_grant");
    try {
      await bad.sql.unsafe("GRANT SELECT ON transactions TO waltning_export");
      const rows = await bad.sql<{ ok: boolean }[]>`SELECT * FROM verify_t1()`;
      expect(rows.some((r) => r.ok === false)).toBe(true);
    } finally {
      // Cluster-wide role: undo the grant so a parallel test is unaffected.
      await bad.sql.unsafe("REVOKE ALL ON transactions FROM waltning_export").catch(() => {});
      await bad.drop();
    }
  });
});
