import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { CATEGORY_KIND } from "./enums.ts";
import { sqliteKit as k } from "./kit.ts";

/** See `categories.pg.ts`. */
export const categoriesColumns = () => ({
  id: k.id("id"),
  parentId: k.uuid("parent_id").references((): AnySQLiteColumn => categories.id, {
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

export const categories = k.table("categories", categoriesColumns());
