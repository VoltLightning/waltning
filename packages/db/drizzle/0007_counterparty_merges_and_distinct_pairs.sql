CREATE TABLE "counterparty_distinct_pairs" (
	"a_id" uuid NOT NULL,
	"b_id" uuid NOT NULL,
	CONSTRAINT "counterparty_distinct_pairs_a_id_b_id_pk" PRIMARY KEY("a_id","b_id"),
	CONSTRAINT "counterparty_distinct_pairs_ordered" CHECK ("counterparty_distinct_pairs"."a_id" < "counterparty_distinct_pairs"."b_id")
);
--> statement-breakpoint
CREATE TABLE "counterparty_merges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"winner_id" uuid NOT NULL,
	"loser_id" uuid NOT NULL,
	"moved_transaction_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"merged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unmerged_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "counterparty_distinct_pairs" ADD CONSTRAINT "counterparty_distinct_pairs_a_id_counterparties_id_fk" FOREIGN KEY ("a_id") REFERENCES "public"."counterparties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counterparty_distinct_pairs" ADD CONSTRAINT "counterparty_distinct_pairs_b_id_counterparties_id_fk" FOREIGN KEY ("b_id") REFERENCES "public"."counterparties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counterparty_merges" ADD CONSTRAINT "counterparty_merges_winner_id_counterparties_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."counterparties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counterparty_merges" ADD CONSTRAINT "counterparty_merges_loser_id_counterparties_id_fk" FOREIGN KEY ("loser_id") REFERENCES "public"."counterparties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "counterparty_merges_winner_idx" ON "counterparty_merges" USING btree ("winner_id");--> statement-breakpoint
CREATE INDEX "counterparty_merges_loser_idx" ON "counterparty_merges" USING btree ("loser_id");