CREATE TYPE "public"."game_status" AS ENUM('scheduled', 'final');--> statement-breakpoint
CREATE TYPE "public"."league_kind" AS ENUM('age-group', 'tier', 'u7', 'flames', 'female', 'elite', 'junior', 'rec', 'other');--> statement-breakpoint
CREATE TYPE "public"."phase_kind" AS ENUM('seeding', 'regular', 'playoffs', 'exhibition', 'preseason', 'other');--> statement-breakpoint
CREATE TYPE "public"."source" AS ENUM('teamlinkt', 'hockeycalgary', 'history');--> statement-breakpoint
CREATE TABLE "communities" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fetches" (
	"id" serial PRIMARY KEY NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" "source" NOT NULL,
	"method" text NOT NULL,
	"url" text NOT NULL,
	"body" jsonb,
	"status" smallint,
	"duration_ms" integer,
	"content_hash" text,
	"records" integer,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" "source" NOT NULL,
	"source_id" text NOT NULL,
	"league_id" integer NOT NULL,
	"date" date NOT NULL,
	"starts_at" timestamp with time zone,
	"arena" text,
	"game_number" text,
	"home_team_id" integer NOT NULL,
	"away_team_id" integer NOT NULL,
	"home_score" smallint,
	"away_score" smallint,
	"result_type" text,
	"status" "game_status" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "games_source_sourceId_unique" UNIQUE("source","source_id"),
	CONSTRAINT "games_two_teams" CHECK ("games"."home_team_id" <> "games"."away_team_id"),
	CONSTRAINT "games_scores_match_status" CHECK (("games"."status" = 'final') = ("games"."home_score" is not null and "games"."away_score" is not null)
          and ("games"."home_score" is null) = ("games"."away_score" is null))
);
--> statement-breakpoint
CREATE TABLE "league_teams" (
	"league_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	CONSTRAINT "league_teams_league_id_team_id_pk" PRIMARY KEY("league_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "leagues" (
	"id" serial PRIMARY KEY NOT NULL,
	"phase_id" integer NOT NULL,
	"source_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"age" text,
	"kind" "league_kind" NOT NULL,
	"tier" smallint,
	"region" text,
	"level" text,
	"stream" text,
	CONSTRAINT "leagues_phaseId_sourceId_unique" UNIQUE("phase_id","source_id"),
	CONSTRAINT "leagues_phaseId_slug_unique" UNIQUE("phase_id","slug")
);
--> statement-breakpoint
CREATE TABLE "phases" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_label" text NOT NULL,
	"kind" "phase_kind" NOT NULL,
	"source" "source" NOT NULL,
	"source_id" text NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	CONSTRAINT "phases_source_sourceId_unique" UNIQUE("source","source_id")
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"label" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" "source" NOT NULL,
	"source_id" text NOT NULL,
	"name" text NOT NULL,
	"community_slug" text,
	"age" text,
	"stream" text,
	"number" smallint,
	"colour" text,
	CONSTRAINT "teams_source_sourceId_unique" UNIQUE("source","source_id")
);
--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_away_team_id_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_teams" ADD CONSTRAINT "league_teams_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_teams" ADD CONSTRAINT "league_teams_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_phase_id_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phases" ADD CONSTRAINT "phases_season_label_seasons_label_fk" FOREIGN KEY ("season_label") REFERENCES "public"."seasons"("label") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_community_slug_communities_slug_fk" FOREIGN KEY ("community_slug") REFERENCES "public"."communities"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fetches_fetched_at_index" ON "fetches" USING btree ("fetched_at");--> statement-breakpoint
CREATE INDEX "games_league_id_index" ON "games" USING btree ("league_id");--> statement-breakpoint
CREATE INDEX "games_home_team_id_index" ON "games" USING btree ("home_team_id");--> statement-breakpoint
CREATE INDEX "games_away_team_id_index" ON "games" USING btree ("away_team_id");--> statement-breakpoint
CREATE INDEX "league_teams_team_id_index" ON "league_teams" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "teams_community_slug_index" ON "teams" USING btree ("community_slug");