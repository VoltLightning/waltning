/**
 * Idempotent seed. Safe to re-run: everything keys on a stable `seed:` external
 * id, so a second run updates rather than duplicating.
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { currencies as currencySeed } from "@waltning/core/currencies";
import type { Id } from "@waltning/core/id";
import { eq } from "drizzle-orm";
import { createDb } from "../client.ts";
import { requireRow } from "../rows.ts";
import { categories, currencies as currenciesTable } from "../schema.ts";
import { expenseTree, incomeTree, type SeedGroup, topLevelLeaves } from "./data.ts";

const rootEnv = fileURLToPath(new URL("../../../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const db = createDb();

async function seedCurrencies() {
  for (const c of currencySeed) {
    await db
      .insert(currenciesTable)
      .values({
        code: c.code,
        name: c.name,
        symbol: c.symbol,
        symbolPosition: c.symbolPosition,
        decimals: c.decimals,
        isPivot: c.isPivot ?? false,
        pinned: c.pinned ?? false,
        rateSource: c.rateSource,
      })
      .onConflictDoUpdate({
        target: currenciesTable.code,
        set: {
          name: c.name,
          symbol: c.symbol,
          pinned: c.pinned ?? false,
          rateSource: c.rateSource,
        },
      });
  }
  return currencySeed.length;
}

/** Upsert one category by its stable seed key, returning its id. */
async function upsertCategory(v: {
  key: string;
  name: string;
  kind: "income" | "expense";
  parentId: Id<"categories"> | null;
  isLeaf: boolean;
  isEarnings: boolean;
  sort: number;
}): Promise<Id<"categories">> {
  const externalId = `seed:${v.key}`;
  const existing = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.externalId, externalId))
    .limit(1);

  if (existing[0]) {
    await db
      .update(categories)
      .set({
        name: v.name,
        parentId: v.parentId,
        isLeaf: v.isLeaf,
        isEarnings: v.isEarnings,
        sort: v.sort,
        updatedAt: new Date(),
      })
      .where(eq(categories.id, existing[0].id));
    return existing[0].id;
  }

  const rows = await db
    .insert(categories)
    .values({
      name: v.name,
      kind: v.kind,
      parentId: v.parentId,
      isLeaf: v.isLeaf,
      isEarnings: v.isEarnings,
      sort: v.sort,
      externalId,
    })
    .returning({ id: categories.id });
  return requireRow(rows, "seed category").id;
}

async function seedTree(tree: SeedGroup[], startSort: number) {
  let groups = 0;
  let leaves = 0;
  let sort = startSort;

  for (const g of tree) {
    // A group is never assignable — TAXONOMY.md R1.
    const parentId = await upsertCategory({
      key: g.key,
      name: g.name,
      kind: g.kind,
      parentId: null,
      isLeaf: false,
      isEarnings: false,
      sort: sort++,
    });
    groups++;

    let leafSort = 0;
    for (const l of g.leaves) {
      await upsertCategory({
        key: `${g.key}.${l.key}`,
        name: l.name,
        kind: g.kind,
        parentId,
        isLeaf: true,
        isEarnings: l.isEarnings ?? false,
        sort: leafSort++,
      });
      leaves++;
    }
  }
  return { groups, leaves, nextSort: sort };
}

async function main() {
  console.log("seeding…\n");

  const ccy = await seedCurrencies();
  console.log(`  currencies      ${ccy}`);

  const inc = await seedTree(incomeTree, 0);
  console.log(`  income          ${inc.groups} groups · ${inc.leaves} leaves`);

  const exp = await seedTree(expenseTree, inc.nextSort);
  console.log(`  expense         ${exp.groups} groups · ${exp.leaves} leaves`);

  let extra = 0;
  let sort = exp.nextSort;
  for (const l of topLevelLeaves) {
    await upsertCategory({
      key: l.key,
      name: l.name,
      kind: l.kind,
      parentId: null,
      isLeaf: true,
      isEarnings: false,
      sort: sort++,
    });
    extra++;
  }
  console.log(`  top-level leaf  ${extra}`);

  const total = inc.leaves + exp.leaves + extra;
  console.log(
    `\n  ${total} assignable leaves · ${inc.groups + exp.groups} groups` +
      `  (Money Manager had 122 entries, 41 of them never used)`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
