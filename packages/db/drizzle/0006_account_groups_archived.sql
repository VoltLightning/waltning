-- The first line is drizzle-kit noticing a pre-existing, purely textual drift
-- and is not part of this change: `accounts.opening_balance` was already
-- effectively `'0.00000000'` at every insert (`money.toMoney("0")` in
-- `accounts.pg.ts`), just recorded as literal `'0'` in `0000_schema.sql`.
-- Numerically identical on a `numeric(20,8)` column — left in rather than
-- hand-stripped, because stripping it would leave this migration's own
-- snapshot claiming a value the live database never received, which is the
-- one thing a migration chain must never do.
ALTER TABLE "accounts" ALTER COLUMN "opening_balance" SET DEFAULT '0.00000000';--> statement-breakpoint

-- `archive_group` (`operations.md`) needs a flag to set — `account_groups`
-- had none. Archive, never delete (§6.9): reference data is reference data,
-- even when nothing but `accounts.group_id` points at it.
ALTER TABLE "account_groups" ADD COLUMN "archived" boolean DEFAULT false NOT NULL;
