ALTER TYPE "public"."chip_transaction_type" ADD VALUE 'admin_credit';--> statement-breakpoint
ALTER TYPE "public"."chip_transaction_type" ADD VALUE 'admin_refund';--> statement-breakpoint
ALTER TYPE "public"."chip_transaction_type" ADD VALUE 'admin_correction';--> statement-breakpoint
CREATE TABLE "operations_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"reason" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operations_audit_log_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "chip_ledger" ADD COLUMN "reference" text;--> statement-breakpoint
ALTER TABLE "chip_ledger" ADD COLUMN "actor_user_id" uuid;--> statement-breakpoint
ALTER TABLE "chip_ledger" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "league_members" ADD COLUMN "knockout_reason" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_operations_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "operations_audit_log" ADD CONSTRAINT "operations_audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "operations_audit_log_created_idx" ON "operations_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "operations_audit_log_entity_idx" ON "operations_audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
ALTER TABLE "chip_ledger" ADD CONSTRAINT "chip_ledger_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chip_ledger_idempotency_unique" ON "chip_ledger" USING btree ("idempotency_key") WHERE "chip_ledger"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "chip_ledger_user_created_idx" ON "chip_ledger" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "chip_ledger_league_created_idx" ON "chip_ledger" USING btree ("league_id","created_at");