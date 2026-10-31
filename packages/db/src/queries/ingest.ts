// Writes the collector makes. Every one is an upsert keyed on the source's own
// id, so a run can be repeated, or die halfway, without duplicating anything.
import { and, eq, notInArray, sql } from "drizzle-orm";
import type { Queryable } from "../client.js";
import {
  communities,
  fetches,
  games,
  leagueTeams,
  leagues,
  phases,
  seasons,
  teams,
} from "../schema/index.js";

export type CommunityRow = typeof communities.$inferInsert;
export type PhaseRow = typeof phases.$inferInsert;
export type LeagueRow = typeof leagues.$inferInsert;
export type TeamRow = typeof teams.$inferInsert;
export type GameRow = Omit<typeof games.$inferInsert, "id" | "updatedAt">;
export type FetchRow = Omit<typeof fetches.$inferInsert, "id">;

/** The incoming value in an ON CONFLICT DO UPDATE. Column names are snake_case. */
const excluded = (column: string) => sql.raw(`excluded.${column}`);

export async function upsertCommunities(db: Queryable, rows: CommunityRow[]): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insert(communities)
    .values(rows)
    .onConflictDoUpdate({ target: communities.slug, set: { name: excluded("name") } });
}

/** Creates the season if needed, then the phase. Returns the phase id. */
export async function upsertPhase(db: Queryable, phase: Omit<PhaseRow, "id">): Promise<number> {
  await db.insert(seasons).values({ label: phase.seasonLabel }).onConflictDoNothing();
  const [row] = await db
    .insert(phases)
    .values(phase)
    .onConflictDoUpdate({
      target: [phases.source, phases.sourceId],
      set: {
        seasonLabel: excluded("season_label"),
        kind: excluded("kind"),
        name: excluded("name"),
        startDate: excluded("start_date"),
        endDate: excluded("end_date"),
      },
    })
    .returning({ id: phases.id });
  return row!.id;
}

/** Returns the league id. */
export async function upsertLeague(db: Queryable, league: Omit<LeagueRow, "id">): Promise<number> {
  const [row] = await db
    .insert(leagues)
    .values(league)
    .onConflictDoUpdate({
      target: [leagues.phaseId, leagues.sourceId],
      set: {
        slug: excluded("slug"),
        name: excluded("name"),
        age: excluded("age"),
        kind: excluded("kind"),
        tier: excluded("tier"),
        region: excluded("region"),
        level: excluded("level"),
        stream: excluded("stream"),
      },
    })
    .returning({ id: leagues.id });
  return row!.id;
}

/** Returns each team's id by its source id. */
export async function upsertTeams(
  db: Queryable,
  rows: Omit<TeamRow, "id">[],
): Promise<Map<string, number>> {
  if (rows.length === 0) return new Map();
  const saved = await db
    .insert(teams)
    .values(rows)
    .onConflictDoUpdate({
      target: [teams.source, teams.sourceId],
      set: {
        name: excluded("name"),
        communitySlug: excluded("community_slug"),
        age: excluded("age"),
        stream: excluded("stream"),
        number: excluded("number"),
        colour: excluded("colour"),
      },
    })
    .returning({ id: teams.id, sourceId: teams.sourceId });
  return new Map(saved.map((t) => [t.sourceId, t.id]));
}

/** Makes the league's team list exactly `teamIds`. */
export async function setLeagueTeams(
  db: Queryable,
  leagueId: number,
  teamIds: number[],
): Promise<void> {
  await db
    .delete(leagueTeams)
    .where(
      teamIds.length > 0
        ? and(eq(leagueTeams.leagueId, leagueId), notInArray(leagueTeams.teamId, teamIds))
        : eq(leagueTeams.leagueId, leagueId),
    );
  if (teamIds.length === 0) return;
  await db
    .insert(leagueTeams)
    .values(teamIds.map((teamId) => ({ leagueId, teamId })))
    .onConflictDoNothing();
}

/**
 * Inserts new games and updates changed ones; returns how many were inserted
 * or changed. An unchanged game is not touched, so `updatedAt` is when its
 * result last changed. Start time, arena and game number are not overwritten:
 * they come from the HC calendar feed, not from TeamLinkt.
 */
export async function upsertGames(db: Queryable, rows: GameRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const changed = await db
    .insert(games)
    .values(rows)
    .onConflictDoUpdate({
      target: [games.source, games.sourceId],
      set: {
        leagueId: excluded("league_id"),
        date: excluded("date"),
        homeTeamId: excluded("home_team_id"),
        awayTeamId: excluded("away_team_id"),
        homeScore: excluded("home_score"),
        awayScore: excluded("away_score"),
        resultType: excluded("result_type"),
        status: excluded("status"),
        updatedAt: sql`now()`,
      },
      setWhere: sql`(${games.leagueId}, ${games.date}, ${games.homeTeamId}, ${games.awayTeamId},
                     ${games.homeScore}, ${games.awayScore}, ${games.resultType}, ${games.status})
        is distinct from (excluded.league_id, excluded.date, excluded.home_team_id, excluded.away_team_id,
                          excluded.home_score, excluded.away_score, excluded.result_type, excluded.status)`,
    })
    .returning({ id: games.id });
  return changed.length;
}

export async function recordFetch(db: Queryable, row: FetchRow): Promise<void> {
  await db.insert(fetches).values(row);
}
