import { sql } from "drizzle-orm";
import { currencies } from "./currencies.sqlite.ts";
import { COUNTERPARTY_KIND } from "./enums.ts";
import { sqliteKit as k } from "./kit.ts";

/**
 * The unique index on the *normalised* name is Postgres's, in `packages/db`
 * (`counterparties_name_uq`, `lower(btrim(name))`) — except here it isn't only
 * Postgres's.
 *
 * **This table is the one exception to "constraints stay in `packages/db`."**
 * Every other shared table's SQLite half is bare — `k.table(name, columns())`,
 * no third argument — because the phone has no separate composition layer the
 * way Postgres does, so a constraint declared here is the *only* copy that
 * ever runs; `packages/db` adds its own independently. That asymmetry is fine
 * where a collision is merely wasted effort (two `Tag` rows spelled
 * differently). It is not fine here: S15's whole guard is that two spellings
 * of one person cannot both exist, and `create_counterparty`'s executor can
 * only refuse a `fold(name)` collision against *rows this replica already
 * has* — it cannot see a duplicate the server would refuse tomorrow, and until
 * a real index backs it, two offline creates of "Nina" and "nina " both land.
 * `SQLite has no generated column in this Drizzle dialect (a stored
 * `name_folded` is Postgres's other approach), so the index is an expression
 * index over `lower(trim(name))` instead — the same normalisation, computed at
 * query time rather than materialised.
 */
export const counterpartiesColumns = () => ({
  id: k.id<"counterparties">("id"),
  name: k.text("name").notNull(),
  kind: k.text("kind", { enum: COUNTERPARTY_KIND }).notNull().default("person"),
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

export const counterparties = k.table("counterparties", counterpartiesColumns(), (t) => [
  k.uniqueIndex("counterparties_name_uq").on(sql`lower(trim(${t.name}))`),
]);
