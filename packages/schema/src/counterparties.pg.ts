import { currencies } from "./currencies.pg.ts";
import { counterpartyKind } from "./enums.pg.ts";
import { pgKit as k } from "./kit.ts";

/**
 * The unique index on `name_folded` stays in `packages/db`
 * (`counterparties_name_uq`, partial where `not archived`) — this is the bare
 * table, for the parity assertion. **The SQLite twin is not bare**: see
 * `counterparties.sqlite.ts` for why the phone carries its own copy of this
 * index rather than trusting a server that may not exist yet.
 *
 * **`name_folded` replaces `lower(btrim(name))` as the index's basis (R2
 * C1).** `lower()` alone is what SQLite has, and SQLite's is ASCII-only — two
 * spellings of the same Polish name (`ŁUKASZ`/`łukasz`) both land on the
 * phone and only collide when the server's `lower()` finally sees them. A
 * *stored* column computed by the same `fold()` (`@waltning/core/capture/names`
 * — case-fold plus the nine Polish diacritics) on both engines closes that
 * gap identically rather than leaving Postgres to enforce a stricter rule
 * than the device that captures offline can check.
 */
export const counterpartiesColumns = () => ({
  id: k.id<"counterparties">("id"),
  name: k.text("name").notNull(),
  /**
   * `fold(name)` — see above. **This declaration describes the SQLite table
   * only.** There, it is exactly what it says: app-written, by
   * `create_counterparty`/`update_counterparty`, never derived by a query —
   * SQLite has no generated columns.
   *
   * **Not true for Postgres, and has not been since R2 H2 (R3 L2).**
   * `packages/db/src/schema.ts`'s `counterparties` table spreads this shared
   * column list and then re-declares `nameFolded` itself, as
   * `GENERATED ALWAYS AS (…) STORED` — a later object key wins over an
   * earlier one, so that redeclaration silently replaces this plain one for
   * every Postgres write. This shared `text` column exists at all only for
   * the two tables' shapes to match; on Postgres nothing ever writes it
   * directly; see `counterparties.sqlite.ts` for the asymmetry this mirrors
   * and its own reasoning for why the fold cannot be generated on the phone.
   *
   * **`.default("")` for `$inferInsert` parity, not for any real insert
   * (R4).** `counterparties.sqlite.ts`'s twin carries the same default —
   * required there, since SQLite's `ADD COLUMN … NOT NULL` needs one on a
   * table that already has rows. Without a matching default here,
   * `parity.type-test.ts`'s `writesMatch` sees one engine's insert make
   * `nameFolded` optional and the other require it, and fails on that
   * asymmetry alone — for a column real Postgres inserts never reach,
   * because `packages/db/src/schema.ts`'s `GENERATED ALWAYS AS` redeclares
   * it first, per the comment above.
   */
  nameFolded: k.text("name_folded").notNull().default(""),
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
