/**
 * The row version, and the timestamp that never moved.
 *
 * **The bug this closes.** Five tables declared
 * `updated_at ... DEFAULT now() NOT NULL` and nothing ever wrote it again. Every
 * row in the database reported its insert time as its last edit, permanently —
 * and nothing failed, because a column that is merely *stale* looks exactly like
 * a column that is *correct*. It was cosmetic while it fed a "last edited"
 * label. It stopped being cosmetic when `architecture/14` made a row's version
 * the thing a conflicting write is detected against.
 *
 * **Why `version` exists next to it.** §14.2 requires the token be compared for
 * equality — *did this field change under you since you read it?* — and never
 * ranked. A timestamp answers that question correctly and invites the wrong one,
 * because two rows' `updated_at` *can* be ordered. A phone offline for nine days
 * then lands an edit older than a correction another device already synced, and
 * "latest wins" silently discards the newer value. A bigint cannot be misread as
 * a time.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Scratch, scratchDatabase } from "./scratch.ts";

let s: Scratch;

beforeAll(async () => {
  s = await scratchDatabase("rowversion");
}, 60_000);

afterAll(async () => {
  await s?.drop();
});

/**
 * The template is migrated, not seeded, so currencies start empty — and
 * `currencies_exactly_one_pivot` is deferred and demands exactly one at commit.
 * Both rows therefore go in together.
 */
async function seedCurrencies(): Promise<void> {
  await s.sql.unsafe(`
    INSERT INTO currencies (code, name, is_pivot) VALUES ('USD', 'Dollar', true)
    ON CONFLICT (code) DO NOTHING`);
}

beforeAll(async () => {
  await seedCurrencies();
});

async function versionOf(code: string): Promise<number> {
  const [row] = await s.sql<{ version: string }[]>`
    SELECT version::text AS version FROM currencies WHERE code = ${code}`;
  return Number(row?.version);
}

async function updatedAtOf(code: string): Promise<string> {
  const [row] = await s.sql<{ at: string }[]>`
    SELECT updated_at::text AS at FROM currencies WHERE code = ${code}`;
  return String(row?.at);
}

describe("version advances on every update", () => {
  it("starts at 1 and increments", async () => {
    expect(await versionOf("USD")).toBe(1);

    await s.sql.unsafe(`UPDATE currencies SET pinned = NOT pinned WHERE code = 'USD'`);
    expect(await versionOf("USD")).toBe(2);

    await s.sql.unsafe(`UPDATE currencies SET pinned = NOT pinned WHERE code = 'USD'`);
    expect(await versionOf("USD")).toBe(3);
  });

  /**
   * **The property that makes it a token rather than a field.**
   *
   * A client carries back the version it last read so the server can compare
   * it. It must not be able to *set* the next one — otherwise a client that
   * echoes a stale version, or invents a large one, decides the outcome of its
   * own conflict check. `touch_row_versioned()` reads `OLD.version`, so the
   * increment is the database's regardless of what the payload claimed.
   */
  it("ignores a version the writer supplies", async () => {
    const before = await versionOf("USD");

    await s.sql.unsafe(`
      UPDATE currencies SET version = 999, pinned = NOT pinned WHERE code = 'USD'`);

    expect(await versionOf("USD")).toBe(before + 1);
  });

  /**
   * The regression itself. `updated_at` defaulted on insert and was never
   * written again, so this comparison was the bug: the value after an update
   * equalled the value before it.
   */
  it("moves updated_at, which it previously never did", async () => {
    const before = await updatedAtOf("USD");
    // `now()` is transaction time, so two updates in one transaction share a
    // timestamp. Separate statements, separate transactions, distinct values.
    await s.sql.unsafe(`UPDATE currencies SET pinned = NOT pinned WHERE code = 'USD'`);
    const after = await updatedAtOf("USD");

    expect(after).not.toBe(before);
    expect(new Date(after).getTime()).toBeGreaterThan(new Date(before).getTime());
  });

  /**
   * **Broken once, to prove the trigger is what holds it.**
   *
   * Without this the three tests above would pass identically if `version` were
   * advanced by something else, or by nothing at all on some other path. This
   * runs in its own database because it deliberately removes a guarantee.
   */
  it("stops advancing when the trigger is dropped", async () => {
    const bad = await scratchDatabase("rowversion_broken");
    try {
      await bad.sql.unsafe(`
        INSERT INTO currencies (code, name, is_pivot) VALUES ('USD', 'Dollar', true)`);
      await bad.sql.unsafe(`DROP TRIGGER currencies_touch ON currencies`);

      const [before] = await bad.sql<{ v: string }[]>`
        SELECT version::text AS v FROM currencies WHERE code = 'USD'`;
      await bad.sql.unsafe(`UPDATE currencies SET pinned = NOT pinned WHERE code = 'USD'`);
      const [after] = await bad.sql<{ v: string }[]>`
        SELECT version::text AS v FROM currencies WHERE code = 'USD'`;

      expect(after?.v).toBe(before?.v);
    } finally {
      await bad.drop();
    }
  });
});

describe("every table that can be edited from a phone carries the token", () => {
  /**
   * Derived, not listed. §14.2 names the tax-sensitive fields whose conflicts
   * must always prompt, and each lives on one of these tables — so a table
   * losing its `version` column would silently make a conflict on one of those
   * fields undetectable, which is the failure mode with no symptom.
   *
   * `debt_reassignments` is deliberately absent: it is a server-only migration
   * artefact the phone never holds, so there is no second writer for a version
   * to arbitrate between. It still gets `updated_at`.
   */
  const VERSIONED = [
    "accounts", // §14.2 accounts.ownership
    "categories",
    "counterparties", // §14.2 counterparty_tax_id
    "currencies", // §14.2 currencies.is_pivot
    "recurring_transactions",
    "transactions", // §14.2 is_business, date, ryczalt_*
  ];

  it("has a version column and a touch trigger on each", async () => {
    const cols = await s.sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'version'`;
    const withVersion = new Set(cols.map((c) => c.table_name));

    const trg = await s.sql<{ tbl: string; fn: string }[]>`
      SELECT c.relname AS tbl, p.proname AS fn
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_proc  p ON p.oid = t.tgfoid
      WHERE NOT t.tgisinternal AND p.proname IN ('touch_row', 'touch_row_versioned')`;
    const versionedTrigger = new Set(
      trg.filter((r) => r.fn === "touch_row_versioned").map((r) => r.tbl),
    );

    for (const table of VERSIONED) {
      expect(withVersion, `${table} must carry the conflict token`).toContain(table);
      expect(versionedTrigger, `${table} must advance it`).toContain(table);
    }

    // The one that gets the timestamp and no token, stated so that adding a
    // version to it later is a deliberate edit here rather than a silent drift.
    expect(withVersion).not.toContain("debt_reassignments");
    expect(trg.some((r) => r.tbl === "debt_reassignments" && r.fn === "touch_row")).toBe(true);
  });
});
