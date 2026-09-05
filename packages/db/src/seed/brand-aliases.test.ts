/**
 * `architecture/14` §14.6 — *"reference data is bootstrapped, never
 * restored"*. The same guarantee `currencies.test.ts` proves for the currency
 * seed, against real Postgres: edit a row the way a person would, re-run the
 * seed over it, and the edit is still there.
 */
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { brandAliases } from "../schema.ts";
import { type Scratch, scratchDatabase } from "../test/scratch.ts";
import { seedBrandAliases } from "./brand-aliases.ts";

let s: Scratch;

beforeAll(async () => {
  s = await scratchDatabase("seed_brand_aliases");
}, 60_000);

afterAll(async () => {
  await s?.drop();
});

describe("seedBrandAliases", () => {
  it("bootstraps every catalogue alias", async () => {
    const count = await seedBrandAliases(s.db);
    expect(count).toBeGreaterThan(0);

    const row = await s.db
      .select()
      .from(brandAliases)
      .where(eq(brandAliases.alias, "orlen"))
      .then((rows) => rows[0]);
    expect(row?.brandKey).toBe("orlen");
  });

  it("never restores an alias someone edited — onConflictDoNothing, not DoUpdate", async () => {
    await seedBrandAliases(s.db);

    // A person (or a future admin surface) points "orlen" at a different key.
    await s.db
      .update(brandAliases)
      .set({ brandKey: "youtube" })
      .where(and(eq(brandAliases.alias, "orlen")));

    const count = await seedBrandAliases(s.db);
    expect(count).toBeGreaterThan(0);

    const row = await s.db
      .select()
      .from(brandAliases)
      .where(eq(brandAliases.alias, "orlen"))
      .then((rows) => rows[0]);
    expect(row?.brandKey, "the edit survives a re-seed").toBe("youtube");
  });
});
