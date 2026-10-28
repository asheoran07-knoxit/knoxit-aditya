CREATE TABLE "predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"fixture_id" integer NOT NULL,
	"gameweek" integer NOT NULL,
	"home_goals" integer NOT NULL,
	"away_goals" integer NOT NULL,
	"booster" text,
	"outcome" text,
	"points" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "predictor_booster_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"gameweek" integer,
	"booster" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "competitive_league_cohort_unique";--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN "game_type" text DEFAULT 'survivor' NOT NULL;--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN "end_gameweek" integer;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_fixture_id_football_fixtures_provider_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."football_fixtures"("provider_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictor_booster_grants" ADD CONSTRAINT "predictor_booster_grants_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictor_booster_grants" ADD CONSTRAINT "predictor_booster_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "predictions_league_user_fixture_unique" ON "predictions" USING btree ("league_id","user_id","fixture_id");--> statement-breakpoint
CREATE INDEX "predictions_league_gameweek_idx" ON "predictions" USING btree ("league_id","gameweek");--> statement-breakpoint
CREATE INDEX "predictor_booster_grants_lookup_idx" ON "predictor_booster_grants" USING btree ("league_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "competitive_league_cohort_unique" ON "leagues" USING btree ("competition_key","season_start_year","starting_round","game_type","instance_number") WHERE "leagues"."type" = 'competitive';