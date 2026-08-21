import { accountGroups } from "./account-groups.pg.ts";
import { currencies } from "./currencies.pg.ts";
import { accountKind, ownership } from "./enums.pg.ts";
import { pgKit as k } from "./kit.ts";

/**
 * §6.7 — a shared account is ordinary; it just belongs to a different total.
 *
 * The `accounts_shared_not_business` check (shared money is never reportable)
 * stays in `packages/db`, with the indexes: §14.7 keeps what Postgres enforces
 * layered around the shared columns rather than inside them.
 */
export const accountsColumns = () => ({
  id: k.id("id"),
  name: k.text("name").notNull(),
  kind: accountKind("kind").notNull().default("other"),
  currency: k
    .text("currency")
    .notNull()
    .references(() => currencies.code),
  groupId: k.uuid("group_id").references(() => accountGroups.id),
  ownership: ownership("ownership").notNull().default("own"),
  openingBalance: k.money("opening_balance").notNull().default("0"),
  openingDate: k.date("opening_date"),
  expectedBalance: k.money("expected_balance"),
  memo: k.text("memo").notNull().default(""),
  isBusiness: k.boolean("is_business").notNull().default(false),
  archived: k.boolean("archived").notNull().default(false),
  sort: k.integer("sort").notNull().default(0),
  externalId: k.text("external_id"),
  createdAt: k.stamp("created_at"),
  updatedAt: k.stamp("updated_at"),
  version: k.version("version").notNull().default(1),
});

export const accounts = k.table("accounts", accountsColumns());
