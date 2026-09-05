import { sqliteKit as k } from "./kit.ts";

/** `SPEC.md` §14.4b — see `brand-aliases.pg.ts` for the full argument. Bare, like `currencies`: the primary key is the shared column itself. */
export const brandAliasesColumns = () => ({
  alias: k.text("alias").primaryKey(),
  brandKey: k.text("brand_key").notNull(),
  createdAt: k.stamp("created_at"),
  updatedAt: k.stamp("updated_at"),
});

export const brandAliases = k.table("brand_aliases", brandAliasesColumns());
