ALTER TABLE "football_competitions" ALTER COLUMN "competitive_entry_fee_chips" SET DEFAULT 500;--> statement-breakpoint
-- Competitions still on the old free default move to 500. A fee already set
-- through the Operations portal (non-zero) is left untouched. Existing
-- league cohorts keep their own leagues.entry_fee_chips.
UPDATE "football_competitions" SET "competitive_entry_fee_chips" = 500 WHERE "competitive_entry_fee_chips" = 0;
