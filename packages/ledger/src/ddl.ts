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
 * This is what replaced a runtime emitter that walked drizzle's table objects
 * and rebuilt columns, affinities, `primary key` and `not null` by hand.
 * Everything else a table declared — foreign keys, `CHECK`s, indexes, partial
 * unique indexes — was dropped silently on the way to the device, which is
 * worse than never declaring it: `architecture/14` §14.6 requires the phone to
 * refuse at capture time what the server would refuse, and every one of those
 * refusals is a constraint that emitter did not emit. `outbox.ts` declares
 * `index("outbox_pending_by_seq")` and the phone did not have it.
 */

/** The fifteen shared tables, plus `local_meta` and its one row. */
export const REPLICA_DDL: readonly string[] = [
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
  `INSERT INTO \`local_meta\` (\`id\`, \`applied_seq\`) VALUES (1, 0)`,
  `ALTER TABLE \`account_groups\` ADD \`archived\` integer DEFAULT false NOT NULL`,
  `CREATE UNIQUE INDEX \`fx_rates_pk\` ON \`fx_rates\` (\`base\`,\`quote\`,\`date\`)`,
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
];

/** The queue, its index, and the counter `claimSeq` allocates from. */
export const OUTBOX_DDL: readonly string[] = [
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
];
