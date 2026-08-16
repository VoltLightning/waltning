CREATE TABLE "outbox_receipts" (
	"entry_id" uuid PRIMARY KEY NOT NULL,
	"op" text NOT NULL,
	"request_hash" text NOT NULL,
	"response" jsonb NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
