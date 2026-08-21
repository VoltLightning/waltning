import { pgKit as k } from "./kit.ts";

/** See `currencies.pg.ts` for why the columns are a factory. */
export const accountGroupsColumns = () => ({
  id: k.id("id"),
  name: k.text("name").notNull(),
  institution: k.text("institution"),
  sort: k.integer("sort").notNull().default(0),
});

export const accountGroups = k.table("account_groups", accountGroupsColumns());
