ALTER TABLE "chip_ledger" ADD COLUMN "vault_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "chip_ledger"
SET "vault_amount" = CASE
	WHEN "type" = 'league_entry' THEN -"amount"
	WHEN "type" IN ('vault_payout', 'split_payout') THEN -"amount"
	ELSE 0
END
WHERE "league_id" IS NOT NULL;
