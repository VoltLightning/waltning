/**
 * The DDL the phone runs, generated from the concrete SQLite table modules,
 * `src/local-meta.ts`, and `src/outbox.ts`.
 *
 * **Do not edit.** Change a table, run `pnpm ledger:generate`, commit both this
 * file and the `drizzle/` output it was built from. `migrate.test.ts` asserts a
 * database migrated from this file holds exactly the tables and columns those
 * schema modules declare, so a stale copy is a red test rather than a phone
 * that is quietly a version behind.
 *
 * **Editing a step that has already shipped is worse than a stale copy.**
 * `migrate.ts` hashes each step's statements and journals that checksum in
 * `__ledger_migrations` on every device, so a change to an old file's
 * contents makes every installed database refuse to open —
 * *"this build's `0007_schema` is not the one that ran here"*. A change to
 * what a step does is a **new** step.
 *
 * This is what replaced a runtime emitter that walked drizzle's table objects
 * and rebuilt columns, affinities, `primary key` and `not null` by hand.
 * Everything else a table declared — foreign keys, `CHECK`s, indexes, partial
 * unique indexes — was dropped silently on the way to the device, which is
 * worse than never declaring it: `architecture/14` §14.6 requires the phone to
 * refuse at capture time what the server would refuse, and every one of those
 * refusals is a constraint that emitter did not emit. `outbox.ts` declares
 * `index("outbox_pending_by_seq")` and the phone did not have it.
 *
 * **One step per generated file, in filename order, statements verbatim.**
 * `migrate.ts` turns each step into `REPLICA_MIGRATIONS` /
 * `OUTBOX_MIGRATIONS`' version — the file's own four-digit prefix plus one,
 * so `0006_schema` is version 7 whatever else the chain holds — and runs
 * its statements, then the hand-written backfill registered under the step's
 * `tag`, if there is one (`REPLICA_BACKFILLS` / `OUTBOX_BACKFILLS`, both
 * in `migrate.ts`): the SQL a schema step cannot itself express, such as
 * filling a new column from the rows that already exist. This module does not
 * know which tags have one.
 */

/** One step per file in `drizzle/replica`, filename order — the sixteen shared tables (`brand_aliases` since `SPEC.md` §14.4b), `local_meta` and its one row, and every schema change since. */
export const REPLICA_STEPS: readonly {
  readonly tag: string;
  readonly statements: readonly string[];
}[] = [
  {
    tag: "0000_schema",
    statements: [
      `CREATE TABLE \`account_groups\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`name\` text NOT NULL,
	\`institution\` text,
	\`sort\` integer DEFAULT 0 NOT NULL
)`,
      `CREATE TABLE \`accounts\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`name\` text NOT NULL,
	\`kind\` text DEFAULT 'other' NOT NULL,
	\`currency\` text NOT NULL,
	\`group_id\` text,
	\`ownership\` text DEFAULT 'own' NOT NULL,
	\`opening_balance\` text DEFAULT '0.00000000' NOT NULL,
	\`opening_date\` text,
	\`expected_balance\` text,
	\`memo\` text DEFAULT '' NOT NULL,
	\`is_business\` integer DEFAULT false NOT NULL,
	\`archived\` integer DEFAULT false NOT NULL,
	\`sort\` integer DEFAULT 0 NOT NULL,
	\`external_id\` text,
	\`created_at\` integer NOT NULL,
	\`updated_at\` integer NOT NULL,
	\`version\` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (\`currency\`) REFERENCES \`currencies\`(\`code\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`group_id\`) REFERENCES \`account_groups\`(\`id\`) ON UPDATE no action ON DELETE no action
)`,
      `CREATE TABLE \`categories\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`parent_id\` text,
	\`name\` text NOT NULL,
	\`kind\` text NOT NULL,
	\`is_leaf\` integer DEFAULT true NOT NULL,
	\`is_earnings\` integer DEFAULT false NOT NULL,
	\`icon\` text,
	\`color\` text,
	\`archived\` integer DEFAULT false NOT NULL,
	\`sort\` integer DEFAULT 0 NOT NULL,
	\`external_id\` text,
	\`created_at\` integer NOT NULL,
	\`updated_at\` integer NOT NULL,
	\`version\` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (\`parent_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE restrict
)`,
      `CREATE TABLE \`counterparties\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`name\` text NOT NULL,
	\`kind\` text DEFAULT 'person' NOT NULL,
	\`settlement_currency\` text,
	\`contact\` text,
	\`note\` text DEFAULT '' NOT NULL,
	\`default_activity\` text,
	\`archived\` integer DEFAULT false NOT NULL,
	\`sort\` integer DEFAULT 0 NOT NULL,
	\`created_at\` integer NOT NULL,
	\`updated_at\` integer NOT NULL,
	\`version\` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (\`settlement_currency\`) REFERENCES \`currencies\`(\`code\`) ON UPDATE no action ON DELETE no action
)`,
      `CREATE TABLE \`currencies\` (
	\`code\` text PRIMARY KEY NOT NULL,
	\`name\` text NOT NULL,
	\`symbol\` text DEFAULT '' NOT NULL,
	\`symbol_position\` text DEFAULT 'P' NOT NULL,
	\`decimals\` integer DEFAULT 2 NOT NULL,
	\`is_pivot\` integer DEFAULT false NOT NULL,
	\`pinned\` integer DEFAULT false NOT NULL,
	\`rate_source\` text,
	\`archived\` integer DEFAULT false NOT NULL,
	\`sort\` integer DEFAULT 0 NOT NULL,
	\`updated_at\` integer NOT NULL,
	\`version\` integer DEFAULT 1 NOT NULL
)`,
      `CREATE TABLE \`dashboard_layouts\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`name\` text NOT NULL,
	\`is_active\` integer DEFAULT false NOT NULL,
	\`is_preset\` integer DEFAULT false NOT NULL,
	\`sort\` integer DEFAULT 0 NOT NULL
)`,
      `CREATE TABLE \`dashboard_widgets\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`layout_id\` text NOT NULL,
	\`kind\` text NOT NULL,
	\`slot\` text NOT NULL,
	\`size\` text DEFAULT 'm' NOT NULL,
	\`config\` text DEFAULT '{}' NOT NULL,
	\`sort\` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (\`layout_id\`) REFERENCES \`dashboard_layouts\`(\`id\`) ON UPDATE no action ON DELETE cascade
)`,
      `CREATE TABLE \`fx_rates\` (
	\`base\` text NOT NULL,
	\`quote\` text NOT NULL,
	\`date\` text NOT NULL,
	\`rate\` text NOT NULL,
	\`source\` text NOT NULL,
	\`fetched_at\` integer,
	FOREIGN KEY (\`base\`) REFERENCES \`currencies\`(\`code\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`quote\`) REFERENCES \`currencies\`(\`code\`) ON UPDATE no action ON DELETE no action
)`,
      `CREATE TABLE \`local_meta\` (
	\`id\` integer PRIMARY KEY NOT NULL,
	\`applied_seq\` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "local_meta_single_row" CHECK("local_meta"."id" = 1)
)`,
      `CREATE TABLE \`recurring_transactions\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`type\` text NOT NULL,
	\`account_id\` text NOT NULL,
	\`to_account_id\` text,
	\`category_id\` text,
	\`counterparty_id\` text,
	\`amount_original\` text NOT NULL,
	\`currency\` text NOT NULL,
	\`payee\` text DEFAULT '' NOT NULL,
	\`note\` text DEFAULT '' NOT NULL,
	\`rrule\` text NOT NULL,
	\`next_date\` text,
	\`end_date\` text,
	\`enabled\` integer DEFAULT true NOT NULL,
	\`external_id\` text,
	\`created_at\` integer NOT NULL,
	\`updated_at\` integer NOT NULL,
	\`version\` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (\`account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`to_account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`category_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`counterparty_id\`) REFERENCES \`counterparties\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`currency\`) REFERENCES \`currencies\`(\`code\`) ON UPDATE no action ON DELETE no action
)`,
      `CREATE TABLE \`tags\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`name\` text NOT NULL
)`,
      `CREATE TABLE \`transaction_lines\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`transaction_id\` text NOT NULL,
	\`receipt_id\` text,
	\`description\` text NOT NULL,
	\`amount\` text NOT NULL,
	\`quantity\` text,
	\`category_id\` text,
	\`sort\` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (\`transaction_id\`) REFERENCES \`transactions\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`category_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE no action
)`,
      `CREATE TABLE \`transaction_tags\` (
	\`transaction_id\` text NOT NULL,
	\`tag_id\` text NOT NULL,
	FOREIGN KEY (\`transaction_id\`) REFERENCES \`transactions\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`tag_id\`) REFERENCES \`tags\`(\`id\`) ON UPDATE no action ON DELETE cascade
)`,
      `CREATE TABLE \`transactions\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`date\` text NOT NULL,
	\`type\` text NOT NULL,
	\`account_id\` text NOT NULL,
	\`to_account_id\` text,
	\`category_id\` text,
	\`counterparty_id\` text,
	\`counterparty_role\` text,
	\`debt_currency\` text,
	\`debt_amount\` text,
	\`amount_original\` text NOT NULL,
	\`currency\` text NOT NULL,
	\`fx_rate\` text NOT NULL,
	\`fx_rate_estimated\` integer DEFAULT false NOT NULL,
	\`to_amount\` text,
	\`to_currency\` text,
	\`to_fx_rate\` text,
	\`payee\` text DEFAULT '' NOT NULL,
	\`note\` text DEFAULT '' NOT NULL,
	\`is_business\` integer DEFAULT false NOT NULL,
	\`is_capital\` integer DEFAULT false NOT NULL,
	\`recurring_id\` text,
	\`occurrence_date\` text,
	\`fee\` text,
	\`counterparty_tax_id\` text,
	\`document_ref\` text,
	\`ksef_id\` text,
	\`ryczalt_rate\` text,
	\`ryczalt_activity\` text,
	\`tax_fx_rate\` text,
	\`tax_fx_date\` text,
	\`tax_fx_source\` text,
	\`source\` text DEFAULT 'manual' NOT NULL,
	\`external_id\` text,
	\`created_at\` integer NOT NULL,
	\`updated_at\` integer NOT NULL,
	\`version\` integer DEFAULT 1 NOT NULL,
	\`deleted_at\` integer,
	FOREIGN KEY (\`account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (\`to_account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (\`category_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (\`counterparty_id\`) REFERENCES \`counterparties\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`debt_currency\`) REFERENCES \`currencies\`(\`code\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`currency\`) REFERENCES \`currencies\`(\`code\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`to_currency\`) REFERENCES \`currencies\`(\`code\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`recurring_id\`) REFERENCES \`recurring_transactions\`(\`id\`) ON UPDATE no action ON DELETE no action
)`,
    ],
  },
  {
    tag: "0001_database_objects",
    statements: [`INSERT INTO \`local_meta\` (\`id\`, \`applied_seq\`) VALUES (1, 0)`],
  },
  {
    tag: "0002_schema",
    statements: [`ALTER TABLE \`account_groups\` ADD \`archived\` integer DEFAULT false NOT NULL`],
  },
  {
    tag: "0003_schema",
    statements: [
      `CREATE UNIQUE INDEX \`fx_rates_pk\` ON \`fx_rates\` (\`base\`,\`quote\`,\`date\`)`,
    ],
  },
  {
    tag: "0004_schema",
    statements: [
      `CREATE TABLE \`counterparty_distinct_pairs\` (
	\`a_id\` text NOT NULL,
	\`b_id\` text NOT NULL,
	PRIMARY KEY(\`a_id\`, \`b_id\`),
	FOREIGN KEY (\`a_id\`) REFERENCES \`counterparties\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`b_id\`) REFERENCES \`counterparties\`(\`id\`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "counterparty_distinct_pairs_ordered" CHECK("counterparty_distinct_pairs"."a_id" < "counterparty_distinct_pairs"."b_id")
)`,
      `CREATE TABLE \`counterparty_merges\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`winner_id\` text NOT NULL,
	\`loser_id\` text NOT NULL,
	\`moved_transaction_ids\` text DEFAULT '[]' NOT NULL,
	\`merged_at\` integer NOT NULL,
	\`unmerged_at\` integer,
	FOREIGN KEY (\`winner_id\`) REFERENCES \`counterparties\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`loser_id\`) REFERENCES \`counterparties\`(\`id\`) ON UPDATE no action ON DELETE no action
)`,
      `CREATE UNIQUE INDEX \`counterparties_name_uq\` ON \`counterparties\` (lower(trim("name")))`,
    ],
  },
  {
    tag: "0005_schema",
    statements: [
      `CREATE INDEX \`transaction_lines_category_idx\` ON \`transaction_lines\` (\`category_id\`)`,
      `CREATE INDEX \`transactions_category_idx\` ON \`transactions\` (\`category_id\`)`,
    ],
  },
  {
    tag: "0006_schema",
    statements: [
      `ALTER TABLE \`counterparties\` ADD \`name_folded\` text DEFAULT '' NOT NULL`,
      `CREATE TABLE \`__new_counterparty_merges\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`winner_id\` text NOT NULL,
	\`loser_id\` text NOT NULL,
	\`moved_transaction_ids\` text DEFAULT '[]' NOT NULL,
	\`merged_at\` integer NOT NULL,
	\`unmerged_at\` integer,
	FOREIGN KEY (\`winner_id\`) REFERENCES \`counterparties\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`loser_id\`) REFERENCES \`counterparties\`(\`id\`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "counterparty_merges_winner_ne_loser" CHECK("__new_counterparty_merges"."winner_id" <> "__new_counterparty_merges"."loser_id")
)`,
      `INSERT INTO \`__new_counterparty_merges\`("id", "winner_id", "loser_id", "moved_transaction_ids", "merged_at", "unmerged_at") SELECT "id", "winner_id", "loser_id", "moved_transaction_ids", "merged_at", "unmerged_at" FROM \`counterparty_merges\``,
      `DROP TABLE \`counterparty_merges\``,
      `ALTER TABLE \`__new_counterparty_merges\` RENAME TO \`counterparty_merges\``,
      `CREATE UNIQUE INDEX \`counterparty_merges_loser_open_uq\` ON \`counterparty_merges\` (\`loser_id\`) WHERE "counterparty_merges"."unmerged_at" is null`,
      `CREATE INDEX \`transactions_counterparty_idx\` ON \`transactions\` (\`counterparty_id\`)`,
    ],
  },
  {
    tag: "0007_schema",
    statements: [
      `DROP INDEX \`counterparties_name_uq\``,
      `CREATE UNIQUE INDEX \`counterparties_name_uq\` ON \`counterparties\` (\`name_folded\`) WHERE not "counterparties"."archived"`,
    ],
  },
  {
    tag: "0008_schema",
    statements: [
      `CREATE TABLE \`__new_transactions\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`date\` text NOT NULL,
	\`type\` text NOT NULL,
	\`account_id\` text NOT NULL,
	\`to_account_id\` text,
	\`category_id\` text,
	\`counterparty_id\` text,
	\`counterparty_role\` text,
	\`debt_currency\` text,
	\`debt_amount\` text,
	\`amount_original\` text NOT NULL,
	\`currency\` text NOT NULL,
	\`fx_rate\` text NOT NULL,
	\`fx_rate_estimated\` integer DEFAULT false NOT NULL,
	\`to_amount\` text,
	\`to_currency\` text,
	\`to_fx_rate\` text,
	\`payee\` text DEFAULT '' NOT NULL,
	\`note\` text DEFAULT '' NOT NULL,
	\`is_business\` integer DEFAULT false NOT NULL,
	\`is_capital\` integer DEFAULT false NOT NULL,
	\`recurring_id\` text,
	\`occurrence_date\` text,
	\`fee\` text,
	\`counterparty_tax_id\` text,
	\`document_ref\` text,
	\`ksef_id\` text,
	\`ryczalt_rate\` text,
	\`ryczalt_activity\` text,
	\`tax_fx_rate\` text,
	\`tax_fx_date\` text,
	\`tax_fx_source\` text,
	\`source\` text DEFAULT 'manual' NOT NULL,
	\`external_id\` text,
	\`created_at\` integer NOT NULL,
	\`updated_at\` integer NOT NULL,
	\`version\` integer DEFAULT 1 NOT NULL,
	\`deleted_at\` integer,
	FOREIGN KEY (\`account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (\`to_account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (\`category_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (\`counterparty_id\`) REFERENCES \`counterparties\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`debt_currency\`) REFERENCES \`currencies\`(\`code\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`currency\`) REFERENCES \`currencies\`(\`code\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`to_currency\`) REFERENCES \`currencies\`(\`code\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`recurring_id\`) REFERENCES \`recurring_transactions\`(\`id\`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transactions_debt_amount_requires_currency" CHECK("__new_transactions"."debt_amount" IS NULL OR "__new_transactions"."debt_currency" IS NOT NULL)
)`,
      `INSERT INTO \`__new_transactions\`("id", "date", "type", "account_id", "to_account_id", "category_id", "counterparty_id", "counterparty_role", "debt_currency", "debt_amount", "amount_original", "currency", "fx_rate", "fx_rate_estimated", "to_amount", "to_currency", "to_fx_rate", "payee", "note", "is_business", "is_capital", "recurring_id", "occurrence_date", "fee", "counterparty_tax_id", "document_ref", "ksef_id", "ryczalt_rate", "ryczalt_activity", "tax_fx_rate", "tax_fx_date", "tax_fx_source", "source", "external_id", "created_at", "updated_at", "version", "deleted_at") SELECT "id", "date", "type", "account_id", "to_account_id", "category_id", "counterparty_id", "counterparty_role", "debt_currency", "debt_amount", "amount_original", "currency", "fx_rate", "fx_rate_estimated", "to_amount", "to_currency", "to_fx_rate", "payee", "note", "is_business", "is_capital", "recurring_id", "occurrence_date", "fee", "counterparty_tax_id", "document_ref", "ksef_id", "ryczalt_rate", "ryczalt_activity", "tax_fx_rate", "tax_fx_date", "tax_fx_source", "source", "external_id", "created_at", "updated_at", "version", "deleted_at" FROM \`transactions\``,
      `DROP TABLE \`transactions\``,
      `ALTER TABLE \`__new_transactions\` RENAME TO \`transactions\``,
      `CREATE INDEX \`transactions_category_idx\` ON \`transactions\` (\`category_id\`)`,
      `CREATE INDEX \`transactions_counterparty_idx\` ON \`transactions\` (\`counterparty_id\`)`,
    ],
  },
  {
    tag: "0009_schema",
    statements: [
      `ALTER TABLE \`fx_rates\` ADD \`displaced_rate\` text`,
      `ALTER TABLE \`fx_rates\` ADD \`displaced_source\` text`,
      `ALTER TABLE \`fx_rates\` ADD \`displaced_fetched_at\` integer`,
      `CREATE TABLE \`__new_fx_rates\` (
	\`base\` text NOT NULL,
	\`quote\` text NOT NULL,
	\`date\` text NOT NULL,
	\`rate\` text NOT NULL,
	\`source\` text NOT NULL,
	\`fetched_at\` integer,
	\`displaced_rate\` text,
	\`displaced_source\` text,
	\`displaced_fetched_at\` integer,
	FOREIGN KEY (\`base\`) REFERENCES \`currencies\`(\`code\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`quote\`) REFERENCES \`currencies\`(\`code\`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "fx_rates_rate_bounds" CHECK(cast("__new_fx_rates"."rate" as real) > 0.000000000001 and cast("__new_fx_rates"."rate" as real) < 999999999999)
)`,
      `INSERT INTO \`__new_fx_rates\`("base", "quote", "date", "rate", "source", "fetched_at", "displaced_rate", "displaced_source", "displaced_fetched_at") SELECT "base", "quote", "date", "rate", "source", "fetched_at", "displaced_rate", "displaced_source", "displaced_fetched_at" FROM \`fx_rates\``,
      `DROP TABLE \`fx_rates\``,
      `ALTER TABLE \`__new_fx_rates\` RENAME TO \`fx_rates\``,
      `CREATE UNIQUE INDEX \`fx_rates_pk\` ON \`fx_rates\` (\`base\`,\`quote\`,\`date\`)`,
      `CREATE TRIGGER \`transactions_category_not_archived_insert\`
BEFORE INSERT ON \`transactions\`
FOR EACH ROW WHEN NEW.\`category_id\` IS NOT NULL
BEGIN
	SELECT RAISE(ABORT, 'category is archived — an archived category is not assignable (H1a)')
	WHERE EXISTS (
		SELECT 1 FROM \`categories\`
		WHERE \`categories\`.\`id\` = NEW.\`category_id\` AND \`categories\`.\`archived\` = 1
	);
END`,
      `CREATE TRIGGER \`transactions_category_not_archived_update\`
BEFORE UPDATE ON \`transactions\`
FOR EACH ROW WHEN NEW.\`category_id\` IS NOT NULL
	AND (OLD.\`category_id\` IS NULL OR OLD.\`category_id\` <> NEW.\`category_id\`)
BEGIN
	SELECT RAISE(ABORT, 'category is archived — an archived category is not assignable (H1a)')
	WHERE EXISTS (
		SELECT 1 FROM \`categories\`
		WHERE \`categories\`.\`id\` = NEW.\`category_id\` AND \`categories\`.\`archived\` = 1
	);
END`,
    ],
  },
  {
    tag: "0010_schema",
    statements: [
      `CREATE TABLE \`brand_aliases\` (
	\`alias\` text PRIMARY KEY NOT NULL,
	\`brand_key\` text NOT NULL,
	\`created_at\` integer NOT NULL,
	\`updated_at\` integer NOT NULL
)`,
      `CREATE TABLE \`__new_transactions\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`date\` text NOT NULL,
	\`type\` text NOT NULL,
	\`account_id\` text NOT NULL,
	\`to_account_id\` text,
	\`category_id\` text,
	\`counterparty_id\` text,
	\`counterparty_role\` text,
	\`debt_currency\` text,
	\`debt_amount\` text,
	\`amount_original\` text NOT NULL,
	\`currency\` text NOT NULL,
	\`fx_rate\` text NOT NULL,
	\`fx_rate_estimated\` integer DEFAULT false NOT NULL,
	\`to_amount\` text,
	\`to_currency\` text,
	\`to_fx_rate\` text,
	\`payee\` text DEFAULT '' NOT NULL,
	\`note\` text DEFAULT '' NOT NULL,
	\`brand_key\` text,
	\`brand_source\` text,
	\`is_business\` integer DEFAULT false NOT NULL,
	\`is_capital\` integer DEFAULT false NOT NULL,
	\`recurring_id\` text,
	\`occurrence_date\` text,
	\`fee\` text,
	\`counterparty_tax_id\` text,
	\`document_ref\` text,
	\`ksef_id\` text,
	\`ryczalt_rate\` text,
	\`ryczalt_activity\` text,
	\`tax_fx_rate\` text,
	\`tax_fx_date\` text,
	\`tax_fx_source\` text,
	\`source\` text DEFAULT 'manual' NOT NULL,
	\`external_id\` text,
	\`created_at\` integer NOT NULL,
	\`updated_at\` integer NOT NULL,
	\`version\` integer DEFAULT 1 NOT NULL,
	\`deleted_at\` integer,
	FOREIGN KEY (\`account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (\`to_account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (\`category_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (\`counterparty_id\`) REFERENCES \`counterparties\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`debt_currency\`) REFERENCES \`currencies\`(\`code\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`currency\`) REFERENCES \`currencies\`(\`code\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`to_currency\`) REFERENCES \`currencies\`(\`code\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`recurring_id\`) REFERENCES \`recurring_transactions\`(\`id\`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transactions_debt_amount_requires_currency" CHECK("__new_transactions"."debt_amount" IS NULL OR "__new_transactions"."debt_currency" IS NOT NULL),
	CONSTRAINT "transactions_brand_shape" CHECK(("__new_transactions"."brand_key" IS NULL AND ("__new_transactions"."brand_source" IS NULL OR "__new_transactions"."brand_source" = 'none')) OR ("__new_transactions"."brand_key" IS NOT NULL AND "__new_transactions"."brand_source" IS NOT NULL AND "__new_transactions"."brand_source" IN ('auto', 'manual')))
)`,
      `INSERT INTO \`__new_transactions\`("id", "date", "type", "account_id", "to_account_id", "category_id", "counterparty_id", "counterparty_role", "debt_currency", "debt_amount", "amount_original", "currency", "fx_rate", "fx_rate_estimated", "to_amount", "to_currency", "to_fx_rate", "payee", "note", "is_business", "is_capital", "recurring_id", "occurrence_date", "fee", "counterparty_tax_id", "document_ref", "ksef_id", "ryczalt_rate", "ryczalt_activity", "tax_fx_rate", "tax_fx_date", "tax_fx_source", "source", "external_id", "created_at", "updated_at", "version", "deleted_at") SELECT "id", "date", "type", "account_id", "to_account_id", "category_id", "counterparty_id", "counterparty_role", "debt_currency", "debt_amount", "amount_original", "currency", "fx_rate", "fx_rate_estimated", "to_amount", "to_currency", "to_fx_rate", "payee", "note", "is_business", "is_capital", "recurring_id", "occurrence_date", "fee", "counterparty_tax_id", "document_ref", "ksef_id", "ryczalt_rate", "ryczalt_activity", "tax_fx_rate", "tax_fx_date", "tax_fx_source", "source", "external_id", "created_at", "updated_at", "version", "deleted_at" FROM \`transactions\``,
      `DROP TABLE \`transactions\``,
      `ALTER TABLE \`__new_transactions\` RENAME TO \`transactions\``,
      `CREATE INDEX \`transactions_category_idx\` ON \`transactions\` (\`category_id\`)`,
      `CREATE INDEX \`transactions_counterparty_idx\` ON \`transactions\` (\`counterparty_id\`)`,
      `CREATE TABLE \`__new_recurring_transactions\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`type\` text NOT NULL,
	\`account_id\` text NOT NULL,
	\`to_account_id\` text,
	\`category_id\` text,
	\`counterparty_id\` text,
	\`amount_original\` text NOT NULL,
	\`currency\` text NOT NULL,
	\`payee\` text DEFAULT '' NOT NULL,
	\`note\` text DEFAULT '' NOT NULL,
	\`brand_key\` text,
	\`brand_source\` text,
	\`rrule\` text NOT NULL,
	\`next_date\` text,
	\`end_date\` text,
	\`enabled\` integer DEFAULT true NOT NULL,
	\`external_id\` text,
	\`created_at\` integer NOT NULL,
	\`updated_at\` integer NOT NULL,
	\`version\` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (\`account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`to_account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`category_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`counterparty_id\`) REFERENCES \`counterparties\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`currency\`) REFERENCES \`currencies\`(\`code\`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "recurring_transactions_brand_shape" CHECK(("__new_recurring_transactions"."brand_key" IS NULL AND ("__new_recurring_transactions"."brand_source" IS NULL OR "__new_recurring_transactions"."brand_source" = 'none')) OR ("__new_recurring_transactions"."brand_key" IS NOT NULL AND "__new_recurring_transactions"."brand_source" IS NOT NULL AND "__new_recurring_transactions"."brand_source" IN ('auto', 'manual')))
)`,
      `INSERT INTO \`__new_recurring_transactions\`("id", "type", "account_id", "to_account_id", "category_id", "counterparty_id", "amount_original", "currency", "payee", "note", "rrule", "next_date", "end_date", "enabled", "external_id", "created_at", "updated_at", "version") SELECT "id", "type", "account_id", "to_account_id", "category_id", "counterparty_id", "amount_original", "currency", "payee", "note", "rrule", "next_date", "end_date", "enabled", "external_id", "created_at", "updated_at", "version" FROM \`recurring_transactions\``,
      `DROP TABLE \`recurring_transactions\``,
      `ALTER TABLE \`__new_recurring_transactions\` RENAME TO \`recurring_transactions\``,
    ],
  },
];

/** One step per file in `drizzle/outbox`, filename order — the queue, its index, and the counter `claimSeq` allocates from. */
export const OUTBOX_STEPS: readonly {
  readonly tag: string;
  readonly statements: readonly string[];
}[] = [
  {
    tag: "0000_schema",
    statements: [
      `CREATE TABLE \`outbox\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`seq\` integer NOT NULL,
	\`operation\` text NOT NULL,
	\`payload\` text NOT NULL,
	\`deps\` text NOT NULL,
	\`op_version\` integer NOT NULL,
	\`state\` text DEFAULT 'pending' NOT NULL,
	\`blocked_kind\` text,
	\`blocked_reason\` text,
	\`attempts\` integer DEFAULT 0 NOT NULL,
	\`last_error\` text,
	\`sent_at\` integer,
	\`captured_at\` integer NOT NULL,
	\`captured_tz\` text NOT NULL,
	\`captured_offset_minutes\` integer NOT NULL
)`,
      `CREATE INDEX \`outbox_pending_by_seq\` ON \`outbox\` (\`state\`,\`seq\`)`,
      `CREATE TABLE \`outbox_seq\` (
	\`id\` integer PRIMARY KEY NOT NULL,
	\`issued\` integer NOT NULL
)`,
    ],
  },
  {
    tag: "0001_schema",
    statements: [
      `ALTER TABLE \`outbox\` ADD \`disposition\` text`,
      `CREATE INDEX \`outbox_deferred\` ON \`outbox\` (\`disposition\`) WHERE "outbox"."disposition" = 'deferred'`,
    ],
  },
];
