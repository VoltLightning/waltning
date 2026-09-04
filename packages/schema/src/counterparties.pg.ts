import { currencies } from "./currencies.pg.ts";
import { counterpartyKind } from "./enums.pg.ts";
import { pgKit as k } from "./kit.ts";

/**
 * The unique index on the normalised name stays in `packages/db`
 * (`counterparties_name_uq`, `lower(btrim(name))`) — this is the bare table,
 * for the parity assertion. **The SQLite twin is not bare**: see
 * `counterparties.sqlite.ts` for why the phone carries its own copy of this
 * index rather than trusting a server that may not exist yet.
 */
export const counterpartiesColumns = () => ({
  id: k.id<"counterparties">("id"),
  name: k.text("name").notNull(),
  kind: counterpartyKind("kind").notNull().default("person"),
  settlementCurrency: k.currency("settlement_currency").references(() => currencies.code),
  contact: k.text("contact"),
  note: k.text("note").notNull().default(""),
  defaultActivity: k.text("default_activity"),
  archived: k.boolean("archived").notNull().default(false),
  sort: k.integer("sort").notNull().default(0),
  createdAt: k.stamp("created_at"),
  updatedAt: k.stamp("updated_at"),
  version: k.version("version").notNull().default(1),
});

export const counterparties = k.table("counterparties", counterpartiesColumns());
