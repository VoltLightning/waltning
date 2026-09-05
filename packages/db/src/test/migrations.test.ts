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
    ) as { entries: { idx: number; tag: string }[] };
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

  /** `DESK4` — `0013`'s seed, the row `get_active_layout` has on a fresh database. */
  it("seeds one active default dashboard layout with its widgets", async () => {
    const [layout] = await s.sql<{ id: string; name: string; is_active: boolean }[]>`
      SELECT id, name, is_active FROM dashboard_layouts WHERE is_preset`;
    if (!layout) throw new Error("the seeded preset layout is missing");
    expect(layout.name).toBe("Standing");
    expect(layout.is_active).toBe(true);

    const widgets = await s.sql<{ kind: string }[]>`
      SELECT kind FROM dashboard_widgets WHERE layout_id = ${layout.id} ORDER BY sort`;
    expect(widgets.map((w) => w.kind)).toEqual([
      "balances",
      "recent",
      "debt",
      "spend_by_category",
      "income_vs_expense",
    ]);
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

  /**
   * **The second way, and the one the old check could not see.**
   *
   * `verify_t1()` used to assert only that `waltning_export` cannot read the
   * *base table*. It said nothing about any other relation exposing the same
   * rows — so `transactions_valued`, added in `0005` to hold the pivot columns
   * §14.7 moved off the table, walked straight into the gap: the first new view
   * over `transactions` since T1 was written.
   *
   * Demonstrated rather than argued. With the grant in place the old form
   * reports **ok = true** while the role can read every column of every row.
   */
  it("fails when the export role is granted any other view over transactions", async () => {
    const bad = await scratchDatabase("t1_view");
    try {
      await bad.sql.unsafe("GRANT SELECT ON transactions_valued TO waltning_export");

      const [old] = await bad.sql<{ ok: boolean }[]>`
        SELECT NOT has_table_privilege('waltning_export', 'transactions', 'SELECT') AS ok`;
      expect(old?.ok, "the old base-table-only check does not notice").toBe(true);

      const rows = await bad.sql<{ check_name: string; ok: boolean }[]>`SELECT * FROM verify_t1()`;
      const enumerated = rows.find((r) => r.check_name === "export_role_reads_only_tax_ledger");
      expect(enumerated?.ok, "the enumerated check does").toBe(false);
    } finally {
      await bad.sql
        .unsafe("REVOKE ALL ON transactions_valued FROM waltning_export")
        .catch(() => {});
      await bad.drop();
    }
  });

  /**
   * The pivot is the most-read number in the system, and it stopped being
   * stored. Asserted on a real row rather than on the view definition — a
   * definition can be right and the arithmetic still land in the wrong column.
   */
  it("computes the same pivot the generated column did", async () => {
    const [row] = await s.sql<{ amount_pivot: string; to_amount_pivot: string | null }[]>`
      SELECT (t.amount_original * t.fx_rate)::text  AS amount_pivot,
             (t.to_amount * t.to_fx_rate)::text     AS to_amount_pivot
      FROM (SELECT '100.00000000'::numeric(20,8) AS amount_original,
                   '0.25000000'::numeric(24,12)  AS fx_rate,
                   '40.00000000'::numeric(20,8)  AS to_amount,
                   '0.50000000'::numeric(24,12)  AS to_fx_rate) t`;

    expect(row?.amount_pivot).toBe("25.00000000000000000000");
    expect(row?.to_amount_pivot).toBe("20.00000000000000000000");
  });
});
