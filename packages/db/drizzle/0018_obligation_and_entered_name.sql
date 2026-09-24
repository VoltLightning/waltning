ALTER TYPE "public"."counterparty_role" RENAME TO "obligation_role";--> statement-breakpoint
ALTER TABLE "recurring_transactions" RENAME COLUMN "payee" TO "entered_name";--> statement-breakpoint
ALTER TABLE "transactions" RENAME COLUMN "counterparty_id" TO "obligation_counterparty_id";--> statement-breakpoint
ALTER TABLE "transactions" RENAME COLUMN "counterparty_role" TO "obligation_role";--> statement-breakpoint
ALTER TABLE "transactions" RENAME COLUMN "payee" TO "entered_name";--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_counterparty_role_shape";--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_counterparty_id_counterparties_id_fk";
--> statement-breakpoint
DROP INDEX "transactions_counterparty_idx";--> statement-breakpoint
DROP INDEX "transactions_payee_idx";--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_obligation_counterparty_id_counterparties_id_fk" FOREIGN KEY ("obligation_counterparty_id") REFERENCES "public"."counterparties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_obligation_counterparty_idx" ON "transactions" USING btree ("obligation_counterparty_id");--> statement-breakpoint
CREATE INDEX "transactions_entered_name_idx" ON "transactions" USING btree ("entered_name");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_obligation_pair_shape" CHECK (("transactions"."obligation_counterparty_id" is not null) = ("transactions"."obligation_role" is not null));