/**
 * The taxonomy the app ships with, materialised on the device.
 *
 * J01 §2 promises *"currencies and taxonomy seeded — shipped with the app,
 * not created here"*. Currencies were; categories were not, so a fresh
 * install opened its category picker on nothing and the first thing the app
 * asked of a person was to design a filing system. `@waltning/core/taxonomy`
 * is the list — the same one `packages/db` seeds Postgres from — and this
 * writes it into the replica.
 *
 * **A bootstrap, not a migration, and not a hardcoded id anywhere.** A
 * migration's statements are frozen the day they ship, so seeding through one
 * would mean 74 literal `INSERT`s carrying 74 literal uuids — unreadable, and
 * a second list to keep in step with the first. Currencies already solved
 * this: `createLocalLedgerSession` inserts them on every start with
 * `onConflictDoNothing`, so the list is data and the write is idempotent.
 * This is that, one table over, with ids minted the ordinary way.
 *
 * **`external_id` is what makes it idempotent**, the same `seed:<key>` the
 * server's own upsert matches on — so the two engines agree on which row is
 * *Groceries* without ever having agreed on a uuid. Re-running changes
 * nothing: a row already carrying that key is left exactly as it is, renamed
 * or archived or moved, because after the first run these are the person's
 * categories and not ours.
 *
 * **It never resurrects.** Archiving sets a flag and the row stays, so the
 * conflict still fires. `archive_category` is the only removal the ledger
 * has — there is no delete to come back from.
 */

import { id as brand, type Id } from "@waltning/core/id";
import type { IdGenerator } from "@waltning/core/random";
import { expenseTree, incomeTree, topLevelLeaves } from "@waltning/core/taxonomy";
import type { ReplicaDb } from "./../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { categories } = ledgerSchema;

/** One row to write, in the order the list gives it. */
type SeedRow = {
  id: Id<"categories">;
  parentId: Id<"categories"> | null;
  name: string;
  kind: "income" | "expense";
  isLeaf: boolean;
  isEarnings: boolean;
  sort: number;
  externalId: string;
};

/**
 * The list, flattened — groups before their own leaves, income before
 * expense, `Uncategorized` last.
 *
 * `sort` is the position in this sequence, which is what makes the picker's
 * order a property of the shipped list rather than of insertion timing.
 */
export function taxonomyRows(mintId: IdGenerator): readonly SeedRow[] {
  const rows: SeedRow[] = [];
  const idOf = new Map<string, Id<"categories">>();
  const push = (row: Omit<SeedRow, "id" | "sort" | "externalId"> & { key: string }) => {
    const minted = brand<"categories">(mintId());
    idOf.set(row.key, minted);
    rows.push({
      id: minted,
      parentId: row.parentId,
      name: row.name,
      kind: row.kind,
      isLeaf: row.isLeaf,
      isEarnings: row.isEarnings,
      sort: rows.length,
      externalId: `seed:${row.key}`,
    });
  };

  for (const tree of [incomeTree, expenseTree]) {
    for (const group of tree) {
      push({
        key: group.key,
        parentId: null,
        name: group.name,
        kind: group.kind,
        isLeaf: false,
        isEarnings: false,
      });
      for (const leaf of group.leaves) {
        push({
          key: leaf.key,
          // The group's own minted id, resolved from the key rather than the
          // name: two groups may one day hold a leaf called the same thing.
          parentId: idOf.get(group.key) ?? null,
          name: leaf.name,
          kind: group.kind,
          isLeaf: true,
          isEarnings: leaf.isEarnings === true,
        });
      }
    }
  }
  for (const leaf of topLevelLeaves) {
    push({
      key: leaf.key,
      parentId: null,
      name: leaf.name,
      kind: leaf.kind,
      isLeaf: true,
      isEarnings: false,
    });
  }
  return rows;
}

/**
 * Write the list, once. Rows already carrying a `seed:` key are left alone —
 * see the file header on why that is the whole idempotence story.
 */
export function bootstrapTaxonomy<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  mintId: IdGenerator,
): void {
  const rows = taxonomyRows(mintId);
  if (rows.length === 0) return;
  db.insert(categories)
    .values([...rows])
    .onConflictDoNothing({ target: categories.externalId })
    .run();
}
