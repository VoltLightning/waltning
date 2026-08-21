import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { categoryKind } from "./enums.pg.ts";
import { pgKit as k } from "./kit.ts";

/**
 * The category tree.
 *
 * Its five constraints stay in `packages/db` — a sibling-uniqueness index over
 * `coalesce(parent_id, …)`, the no-self-parent check, and the rule that only
 * income categories can be earnings. All three are Postgres expressions and
 * none has a SQLite equivalent (§14.7).
 */
export const categoriesColumns = () => ({
  id: k.id<"categories">("id"),
  parentId: k.uuid<"categories">("parent_id").references((): AnyPgColumn => categories.id, {
    onDelete: "restrict",
  }),
  name: k.text("name").notNull(),
  kind: categoryKind("kind").notNull(),
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

export const categories = k.table("categories", categoriesColumns());
