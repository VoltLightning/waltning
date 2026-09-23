import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { CATEGORY_KIND } from "./enums.ts";
import { sqliteKit as k } from "./kit.ts";

/** See `categories.pg.ts`. */
export const categoriesColumns = () => ({
  id: k.id<"categories">("id"),
  parentId: k.uuid<"categories">("parent_id").references((): AnySQLiteColumn => categories.id, {
    onDelete: "restrict",
  }),
  name: k.text("name").notNull(),
  kind: k.text("kind", { enum: CATEGORY_KIND }).notNull(),
  isLeaf: k.boolean("is_leaf").notNull().default(true),
  isEarnings: k.boolean("is_earnings").notNull().default(false),
  icon: k.text("icon"),
  color: k.text("color"),
  archived: k.boolean("archived").notNull().default(false),
  sort: k.integer("sort").notNull().default(0),
  externalId: k.text("external_id"),
  createdAt: k.stamp("created_at"),
  updatedAt: k.stamp("updated_at"),
  version: k.version("version").notNull().default(1),
});

export const categories = k.table("categories", categoriesColumns(), (t) => [
  /**
   * What makes the shipped taxonomy idempotent
   * (`packages/ledger`'s `categories/bootstrap-taxonomy.ts`): the seed key is
   * the identity both engines agree on, so writing the list a second time has
   * to be a no-op rather than a second tree.
   *
   * **Not partial.** A category a person makes carries no external id, and
   * the first draft guarded against those colliding with `WHERE external_id
   * IS NOT NULL`. They cannot collide: both engines treat nulls as distinct
   * in a unique index. The clause bought nothing and cost the `ON CONFLICT`
   * target, which must repeat a partial index's predicate exactly or match
   * no index at all.
   *
   * Declared here rather than in `packages/db` for the reason
   * `counterparties.sqlite.ts` gives: the phone has no composition layer, so
   * a constraint the replica needs has to be declared where the replica's
   * own chain is generated from.
   */
  k.uniqueIndex("categories_external_id_uq").on(t.externalId),
]);
