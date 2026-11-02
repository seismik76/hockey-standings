// Reads the web app makes. All of them run as the read-only role in production.
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Queryable } from "../client.js";
import {
  communities,
  games,
  leagueTeams,
  leagues,
  phases,
  seasons,
  teams,
} from "../schema/index.js";

export type PhaseKind = (typeof phases.$inferSelect)["kind"];

export interface LeagueSummary {
  id: number;
  phase: PhaseKind;
  phaseName: string;
  slug: string;
  name: string;
  age: string | null;
  kind: (typeof leagues.$inferSelect)["kind"];
  tier: number | null;
  region: string | null;
  teams: number;
  games: number;
  finals: number;
  lastPlayed: string | null;
}

export interface LeagueTeam {
  id: number;
  name: string;
  communitySlug: string | null;
}

export interface LeagueGame {
  id: number;
  date: string;
  status: "scheduled" | "final";
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number | null;
  awayScore: number | null;
  resultType: string | null;
}

export interface LeagueData {
  league: LeagueSummary;
  teams: LeagueTeam[];
  games: LeagueGame[];
}

/** The newest season with any data: "2026-27". */
export async function currentSeason(db: Queryable): Promise<string | null> {
  const [row] = await db.select().from(seasons).orderBy(desc(seasons.label)).limit(1);
  return row?.label ?? null;
}

/** Every league of the season with team and game counts, in no particular order. */
export async function listLeagues(db: Queryable, season: string): Promise<LeagueSummary[]> {
  return summaries(db, eq(phases.seasonLabel, season));
}

/** Each community with how many teams it has this season. */
export async function listCommunities(
  db: Queryable,
  season: string,
): Promise<{ slug: string; name: string; teams: number }[]> {
  const inSeason = db
    .selectDistinct({ teamId: leagueTeams.teamId })
    .from(leagueTeams)
    .innerJoin(leagues, eq(leagues.id, leagueTeams.leagueId))
    .innerJoin(phases, eq(phases.id, leagues.phaseId))
    .where(eq(phases.seasonLabel, season))
    .as("in_season");
  return db
    .select({
      slug: communities.slug,
      name: communities.name,
      teams: sql<number>`count(${inSeason.teamId})::int`,
    })
    .from(communities)
    .leftJoin(teams, eq(teams.communitySlug, communities.slug))
    .leftJoin(inSeason, eq(inSeason.teamId, teams.id))
    .groupBy(communities.slug, communities.name)
    .orderBy(asc(communities.name));
}

export async function communityName(db: Queryable, slug: string): Promise<string | null> {
  const [row] = await db.select().from(communities).where(eq(communities.slug, slug));
  return row?.name ?? null;
}

/** One league, by phase and slug, with its teams and games. */
export async function leagueData(
  db: Queryable,
  season: string,
  phase: PhaseKind,
  slug: string,
): Promise<LeagueData | null> {
  const [league] = await summaries(
    db,
    and(eq(phases.seasonLabel, season), eq(phases.kind, phase), eq(leagues.slug, slug)),
  );
  if (!league) return null;
  const [data] = await withTeamsAndGames(db, [league]);
  return data ?? null;
}

/** Every league of the season that one of the community's teams plays in. */
export async function communityLeagues(
  db: Queryable,
  season: string,
  communitySlug: string,
): Promise<LeagueData[]> {
  const ids = db
    .selectDistinct({ id: leagueTeams.leagueId })
    .from(leagueTeams)
    .innerJoin(teams, eq(teams.id, leagueTeams.teamId))
    .where(eq(teams.communitySlug, communitySlug));
  const found = await summaries(db, and(eq(phases.seasonLabel, season), inArray(leagues.id, ids)));
  return withTeamsAndGames(db, found);
}

async function summaries(db: Queryable, where: ReturnType<typeof and>): Promise<LeagueSummary[]> {
  const teamCount = db
    .select({ leagueId: leagueTeams.leagueId, n: sql<number>`count(*)::int`.as("team_n") })
    .from(leagueTeams)
    .groupBy(leagueTeams.leagueId)
    .as("team_count");
  const gameCount = db
    .select({
      leagueId: games.leagueId,
      n: sql<number>`count(*)::int`.as("game_n"),
      finals: sql<number>`count(*) filter (where ${games.status} = 'final')::int`.as("finals"),
      lastPlayed: sql<
        string | null
      >`max(${games.date}) filter (where ${games.status} = 'final')::text`.as("last_played"),
    })
    .from(games)
    .groupBy(games.leagueId)
    .as("game_count");

  return db
    .select({
      id: leagues.id,
      phase: phases.kind,
      phaseName: phases.name,
      slug: leagues.slug,
      name: leagues.name,
      age: leagues.age,
      kind: leagues.kind,
      tier: leagues.tier,
      region: leagues.region,
      teams: sql<number>`coalesce(${teamCount.n}, 0)`,
      games: sql<number>`coalesce(${gameCount.n}, 0)`,
      finals: sql<number>`coalesce(${gameCount.finals}, 0)`,
      lastPlayed: gameCount.lastPlayed,
    })
    .from(leagues)
    .innerJoin(phases, eq(phases.id, leagues.phaseId))
    .leftJoin(teamCount, eq(teamCount.leagueId, leagues.id))
    .leftJoin(gameCount, eq(gameCount.leagueId, leagues.id))
    .where(where);
}

/** Two queries for any number of leagues, not two per league. */
async function withTeamsAndGames(db: Queryable, found: LeagueSummary[]): Promise<LeagueData[]> {
  if (found.length === 0) return [];
  const ids = found.map((l) => l.id);
  const [teamRows, gameRows] = await Promise.all([
    db
      .select({
        leagueId: leagueTeams.leagueId,
        id: teams.id,
        name: teams.name,
        communitySlug: teams.communitySlug,
      })
      .from(leagueTeams)
      .innerJoin(teams, eq(teams.id, leagueTeams.teamId))
      .where(inArray(leagueTeams.leagueId, ids))
      .orderBy(asc(teams.name)),
    db
      .select({
        leagueId: games.leagueId,
        id: games.id,
        date: games.date,
        status: games.status,
        homeTeamId: games.homeTeamId,
        awayTeamId: games.awayTeamId,
        homeScore: games.homeScore,
        awayScore: games.awayScore,
        resultType: games.resultType,
      })
      .from(games)
      .where(inArray(games.leagueId, ids))
      .orderBy(asc(games.date), asc(games.id)),
  ]);
  return found.map((league) => ({
    league,
    teams: teamRows.filter((t) => t.leagueId === league.id).map(({ leagueId: _, ...t }) => t),
    games: gameRows.filter((g) => g.leagueId === league.id).map(({ leagueId: _, ...g }) => g),
  }));
}

/**
 * U11 and U13 AA count with their age group as a level above Tier 1, tier 0
 * here (Pat, 2026-11-01). AA plays no seeding of its own, so an AA game counts
 * in the seeding comparison when it was played by the end of seeding, and in
 * the regular season after that.
 */
export const AA_AGES = ["U11", "U13"];
export const AA_TIER = 0;

/** A final game in a tiered league, by the two teams' communities (null for a visiting club). */
export interface TierGameRow {
  age: string;
  /** 1 is Tier 1; 0 is AA. */
  tier: number;
  homeCommunity: string | null;
  awayCommunity: string | null;
  homeScore: number;
  awayScore: number;
}

/** Every final game the community comparison counts for one phase: tiered leagues, plus AA. */
export async function tierGames(
  db: Queryable,
  season: string,
  phase: PhaseKind,
): Promise<TierGameRow[]> {
  const home = alias(teams, "home");
  const away = alias(teams, "away");
  const select = () =>
    db
      .select({
        kind: leagues.kind,
        date: games.date,
        age: leagues.age,
        tier: leagues.tier,
        homeCommunity: home.communitySlug,
        awayCommunity: away.communitySlug,
        homeScore: games.homeScore,
        awayScore: games.awayScore,
      })
      .from(games)
      .innerJoin(leagues, eq(leagues.id, games.leagueId))
      .innerJoin(phases, eq(phases.id, leagues.phaseId))
      .innerJoin(home, eq(home.id, games.homeTeamId))
      .innerJoin(away, eq(away.id, games.awayTeamId));
  const finalIn = and(eq(phases.seasonLabel, season), eq(games.status, "final"));
  const [tiered, aa, [seeding]] = await Promise.all([
    select().where(and(finalIn, eq(phases.kind, phase), eq(leagues.kind, "tier"))),
    select().where(and(finalIn, eq(leagues.kind, "elite"), inArray(leagues.age, AA_AGES))),
    db
      .select({ end: phases.endDate })
      .from(phases)
      .where(and(eq(phases.seasonLabel, season), eq(phases.kind, "seeding"))),
  ]);

  // AA by date: by the end of seeding, or after it. With no seeding phase at
  // all, every AA game is regular season.
  const inPhase = (date: string) =>
    phase === "seeding"
      ? seeding !== undefined && date <= seeding.end
      : phase === "regular" && (seeding === undefined || date > seeding.end);
  // TeamLinkt can list an AA schedule in more than one season. One AA team per
  // association per age, so date, age and the two communities name one game.
  const seen = new Set<string>();
  const aaInPhase = aa.filter((g) => {
    if (!inPhase(g.date)) return false;
    const key = [g.date, g.age, g.homeCommunity, g.awayCommunity].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // A tier league always has an age and a tier, and a final game its scores
  // (the games_scores_match_status check); the filter only narrows the types.
  return [...tiered, ...aaInPhase.map((g) => ({ ...g, tier: AA_TIER }))]
    .filter(
      (r): r is typeof r & { age: string; tier: number; homeScore: number; awayScore: number } =>
        r.age !== null && r.tier !== null && r.homeScore !== null && r.awayScore !== null,
    )
    .map(({ age, tier, homeCommunity, awayCommunity, homeScore, awayScore }) => ({
      age,
      tier,
      homeCommunity,
      awayCommunity,
      homeScore,
      awayScore,
    }));
}

/**
 * How many of each community's teams play in each tier of one phase, by age,
 * with AA as tier 0: one team for each community and age with an AA team
 * anywhere in the season.
 */
export async function tierPlacements(
  db: Queryable,
  season: string,
  phase: PhaseKind,
): Promise<{ community: string; age: string; tier: number; teams: number }[]> {
  const [tiered, aa] = await Promise.all([
    db
      .select({
        community: teams.communitySlug,
        age: leagues.age,
        tier: leagues.tier,
        teams: sql<number>`count(*)::int`,
      })
      .from(leagueTeams)
      .innerJoin(teams, eq(teams.id, leagueTeams.teamId))
      .innerJoin(leagues, eq(leagues.id, leagueTeams.leagueId))
      .innerJoin(phases, eq(phases.id, leagues.phaseId))
      .where(and(eq(phases.seasonLabel, season), eq(phases.kind, phase), eq(leagues.kind, "tier")))
      .groupBy(teams.communitySlug, leagues.age, leagues.tier),
    db
      .selectDistinct({ community: teams.communitySlug, age: leagues.age })
      .from(leagueTeams)
      .innerJoin(teams, eq(teams.id, leagueTeams.teamId))
      .innerJoin(leagues, eq(leagues.id, leagueTeams.leagueId))
      .innerJoin(phases, eq(phases.id, leagues.phaseId))
      .where(
        and(
          eq(phases.seasonLabel, season),
          eq(leagues.kind, "elite"),
          inArray(leagues.age, AA_AGES),
        ),
      ),
  ]);
  return [...tiered, ...aa.map((r) => ({ ...r, tier: AA_TIER, teams: 1 }))].filter(
    (r): r is { community: string; age: string; tier: number; teams: number } =>
      r.community !== null && r.age !== null && r.tier !== null,
  );
}

/** Per phase of the season: how many teams its tiered leagues have, and how many final games. */
export async function tierCoverage(
  db: Queryable,
  season: string,
): Promise<{ phase: PhaseKind; teams: number; finals: number }[]> {
  const teamCount = db
    .select({ phaseId: leagues.phaseId, n: sql<number>`count(*)::int`.as("team_n") })
    .from(leagueTeams)
    .innerJoin(leagues, eq(leagues.id, leagueTeams.leagueId))
    .where(eq(leagues.kind, "tier"))
    .groupBy(leagues.phaseId)
    .as("team_count");
  const finalCount = db
    .select({ phaseId: leagues.phaseId, n: sql<number>`count(*)::int`.as("final_n") })
    .from(games)
    .innerJoin(leagues, eq(leagues.id, games.leagueId))
    .where(and(eq(leagues.kind, "tier"), eq(games.status, "final")))
    .groupBy(leagues.phaseId)
    .as("final_count");
  return db
    .select({
      phase: phases.kind,
      teams: sql<number>`coalesce(${teamCount.n}, 0)`,
      finals: sql<number>`coalesce(${finalCount.n}, 0)`,
    })
    .from(phases)
    .leftJoin(teamCount, eq(teamCount.phaseId, phases.id))
    .leftJoin(finalCount, eq(finalCount.phaseId, phases.id))
    .where(eq(phases.seasonLabel, season));
}
