import * as money from "@waltning/core/money";
import { accountGroups } from "./account-groups.sqlite.ts";
import { currencies } from "./currencies.sqlite.ts";
import { ACCOUNT_KIND, OWNERSHIP } from "./enums.ts";
import { sqliteKit as k } from "./kit.ts";

/**
 * §6.7 — a shared account is ordinary; it just belongs to a different total.
 *
 * The `accounts_shared_not_business` check (shared money is never reportable)
 * stays in `packages/db`, with the indexes: §14.7 keeps what Postgres enforces
 * layered around the shared columns rather than inside them.
 */
export const accountsColumns = () => ({
  id: k.id<"accounts">("id"),
  name: k.text("name").notNull(),
  kind: k.text("kind", { enum: ACCOUNT_KIND }).notNull().default("other"),
  currency: k
    .currency("currency")
    .notNull()
    .references(() => currencies.code),
  groupId: k.uuid<"accountGroups">("group_id").references(() => accountGroups.id),
  ownership: k.text("ownership", { enum: OWNERSHIP }).notNull().default("own"),
  openingBalance: k.money("opening_balance").notNull().default(money.toMoney("0")),
  openingDate: k.date("opening_date"),
  expectedBalance: k.money("expected_balance"),
  memo: k.text("memo").notNull().default(""),
  isBusiness: k.boolean("is_business").notNull().default(false),
  archived: k.boolean("archived").notNull().default(false),
  /**
   * **Out of the register's list**, though the account is live and its rows
   * still count everywhere else.
   *
   * Not `archived`, and the two are not degrees of the same thing. Archiving
   * says the account is *finished* — `archive_account` is the ledger's only
   * removal, it refuses an account still holding money, and an archived
   * account leaves the pickers. Hiding says *I do not want to look at this
   * one*: the account is open, it is captured into, and every figure it feeds
   * is unchanged. A person with a joint account they never manage wants the
   * second and would be lied to by the first.
   */
  hidden: k.boolean("hidden").notNull().default(false),
  /**
   * **In the register's total**, which is a separate question from being in
   * its list.
   *
   * A vault you want to see but not spend is in the list and out of the
   * total; a card you have stopped using is out of both. Two flags because
   * they are two answers — folding them into one would make *show me this*
   * and *count this* the same decision, and they are the pair S16 §3 draws as
   * two pills.
   *
   * **Default `true`**, so an account that has never been touched is counted.
   * The total is a claim about everything, and a default that quietly left
   * new accounts out would make it wrong the moment one was created.
   */
  inTotal: k.boolean("in_total").notNull().default(true),
  sort: k.integer("sort").notNull().default(0),
  externalId: k.text("external_id"),
  createdAt: k.stamp("created_at"),
  updatedAt: k.stamp("updated_at"),
  version: k.version("version").notNull().default(1),
});

export const accounts = k.table("accounts", accountsColumns());
