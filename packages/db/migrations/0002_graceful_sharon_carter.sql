CREATE TABLE "player_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"phase_id" integer NOT NULL,
	"league_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"gp" smallint NOT NULL,
	"g" smallint NOT NULL,
	"a" smallint NOT NULL,
	"pim" smallint NOT NULL,
	"goalie" boolean NOT NULL,
	"wins" smallint,
	"losses" smallint,
	"ties" smallint,
	"shutouts" smallint,
	"goals_against" smallint
);
--> statement-breakpoint
ALTER TABLE "player_stats" ADD CONSTRAINT "player_stats_phase_id_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_stats" ADD CONSTRAINT "player_stats_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_stats" ADD CONSTRAINT "player_stats_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "player_stats_phase_id_index" ON "player_stats" USING btree ("phase_id");--> statement-breakpoint
CREATE INDEX "player_stats_league_id_index" ON "player_stats" USING btree ("league_id");--> statement-breakpoint
CREATE INDEX "player_stats_team_id_index" ON "player_stats" USING btree ("team_id");