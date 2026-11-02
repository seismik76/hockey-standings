CREATE TABLE "history_standings" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_label" text NOT NULL,
	"phase" "phase_kind" NOT NULL,
	"league_slug" text NOT NULL,
	"league_name" text NOT NULL,
	"age" text NOT NULL,
	"tier" smallint NOT NULL,
	"region" text,
	"pool" text,
	"team_name" text NOT NULL,
	"community_slug" text,
	"gp" smallint NOT NULL,
	"w" smallint NOT NULL,
	"l" smallint NOT NULL,
	"t" smallint NOT NULL,
	"gf" smallint NOT NULL,
	"ga" smallint NOT NULL,
	"origin" text NOT NULL,
	"source_url" text,
	CONSTRAINT "history_standings_seasonLabel_phase_leagueSlug_teamName_unique" UNIQUE("season_label","phase","league_slug","team_name"),
	CONSTRAINT "history_standings_record" CHECK ("history_standings"."gp" = "history_standings"."w" + "history_standings"."l" + "history_standings"."t")
);
--> statement-breakpoint
ALTER TABLE "history_standings" ADD CONSTRAINT "history_standings_season_label_seasons_label_fk" FOREIGN KEY ("season_label") REFERENCES "public"."seasons"("label") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_standings" ADD CONSTRAINT "history_standings_community_slug_communities_slug_fk" FOREIGN KEY ("community_slug") REFERENCES "public"."communities"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "history_standings_community_slug_index" ON "history_standings" USING btree ("community_slug");