import { sqliteKit as k } from "./kit.ts";

/** See `currencies.pg.ts` for why the columns are a factory. */
export const accountGroupsColumns = () => ({
  id: k.id<"accountGroups">("id"),
  name: k.text("name").notNull(),
  institution: k.text("institution"),
  /** `archive_group` — S16 §5. Archive, never delete (§6.9): nothing but `accounts.group_id` references a group, but reference data is still reference data. */
  archived: k.boolean("archived").notNull().default(false),
  sort: k.integer("sort").notNull().default(0),
});

export const accountGroups = k.table("account_groups", accountGroupsColumns());
