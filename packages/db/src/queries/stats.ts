// Player statistics: what the collector writes, and the leaderboards, league
// tables and scoring depth the stats page reads. Lines are anonymous (see the
// player_stats schema): a line is "a player on this team", nothing more.
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Database, Queryable } from "../client.js";
import { fetches, leagueTeams, leagues, phases, playerStats, teams } from "../schema/index.js";
import type { PhaseKind } from "./read.js";

export type PlayerStatRow = Omit<typeof playerStats.$inferInsert, "id" | "phaseId">;

/** The phase's teams by TeamLinkt team id, with our team and league ids. */
export async function phaseTeams(
  db: Queryable,
  phaseId: number,
): Promise<Map<string, { teamId: number; leagueId: number }>> {
  const rows = await db
    .select({ sourceId: teams.sourceId, teamId: teams.id, leagueId: leagues.id })
    .from(leagueTeams)
    .innerJoin(teams, eq(teams.id, leagueTeams.teamId))
    .innerJoin(leagues, eq(leagues.id, leagueTeams.leagueId))
    .where(and(eq(leagues.phaseId, phaseId), eq(teams.source, "teamlinkt")));
  return new Map(rows.map((r) => [r.sourceId, { teamId: r.teamId, leagueId: r.leagueId }]));
}

/** Replaces every line of the phase, in one transaction. Returns the count written. */
export async function replacePlayerStats(
  db: Database,
  phaseId: number,
  rows: PlayerStatRow[],
): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.delete(playerStats).where(eq(playerStats.phaseId, phaseId));
    for (let i = 0; i < rows.length; i += 2000) {
      await tx.insert(playerStats).values(rows.slice(i, i + 2000).map((r) => ({ ...r, phaseId })));
    }
    return rows.length;
  });
}

export async function hasPlayerStats(db: Queryable, phaseId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: playerStats.id })
    .from(playerStats)
    .where(eq(playerStats.phaseId, phaseId))
    .limit(1);
  return row !== undefined;
}

export interface PlayerLine {
  phase: PhaseKind;
  team: string;
  communitySlug: string | null;
  leagueSlug: string;
  leagueName: string;
  age: string | null;
  gp: number;
  g: number;
  a: number;
  pim: number;
  jersey: string | null;
  rostered: boolean | null;
  goalie: boolean;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  shutouts: number | null;
  goalsAgainst: number | null;
}

export type SkaterSort = "pts" | "g" | "a" | "pim";

function lineQuery(db: Queryable) {
  return db
    .select({
      phase: phases.kind,
      team: teams.name,
      communitySlug: teams.communitySlug,
      leagueSlug: leagues.slug,
      leagueName: leagues.name,
      age: leagues.age,
      gp: playerStats.gp,
      g: playerStats.g,
      a: playerStats.a,
      pim: playerStats.pim,
      jersey: playerStats.jersey,
      rostered: playerStats.rostered,
      goalie: playerStats.goalie,
      wins: playerStats.wins,
      losses: playerStats.losses,
      ties: playerStats.ties,
      shutouts: playerStats.shutouts,
      goalsAgainst: playerStats.goalsAgainst,
    })
    .from(playerStats)
    .innerJoin(phases, eq(phases.id, playerStats.phaseId))
    .innerJoin(leagues, eq(leagues.id, playerStats.leagueId))
    .innerJoin(teams, eq(teams.id, playerStats.teamId));
}

/** The top skaters of a phase, optionally one age, by points, goals, assists or PIM. */
export async function skaterLeaders(
  db: Queryable,
  season: string,
  phase: PhaseKind,
  { age, sort, limit }: { age?: string | undefined; sort: SkaterSort; limit: number },
): Promise<PlayerLine[]> {
  const pts = sql<number>`${playerStats.g} + ${playerStats.a}`;
  const by = { pts, g: playerStats.g, a: playerStats.a, pim: playerStats.pim }[sort];
  return lineQuery(db)
    .where(
      and(
        eq(phases.seasonLabel, season),
        eq(phases.kind, phase),
        eq(playerStats.goalie, false),
        age ? eq(leagues.age, age) : undefined,
      ),
    )
    .orderBy(desc(by), desc(pts), desc(playerStats.g), asc(playerStats.gp), asc(teams.name))
    .limit(limit);
}

/**
 * Goalies by goals against a game played, at least `minGames` games. Wins and
 * losses are rarely entered on gamesheets, so games played is the divisor; a
 * goalie with no goals against entered is left out, since a zero there is far
 * more often a gap than a perfect run.
 */
export async function goalieLeaders(
  db: Queryable,
  season: string,
  phase: PhaseKind,
  { age, minGames, limit }: { age?: string | undefined; minGames: number; limit: number },
): Promise<PlayerLine[]> {
  return lineQuery(db)
    .where(
      and(
        eq(phases.seasonLabel, season),
        eq(phases.kind, phase),
        eq(playerStats.goalie, true),
        sql`${playerStats.gp} >= ${minGames}`,
        sql`coalesce(${playerStats.goalsAgainst}, 0) > 0`,
        age ? eq(leagues.age, age) : undefined,
      ),
    )
    .orderBy(
      sql`${playerStats.goalsAgainst}::float / nullif(${playerStats.gp}, 0)`,
      desc(playerStats.gp),
      asc(teams.name),
    )
    .limit(limit);
}

/** Every line of one league in a phase, points first. */
export async function leaguePlayerLines(
  db: Queryable,
  season: string,
  phase: PhaseKind,
  slug: string,
): Promise<PlayerLine[]> {
  return lineQuery(db)
    .where(and(eq(phases.seasonLabel, season), eq(phases.kind, phase), eq(leagues.slug, slug)))
    .orderBy(desc(sql`${playerStats.g} + ${playerStats.a}`), desc(playerStats.g), asc(teams.name));
}

/** Which ages and leagues of a phase have player lines: for the page's pickers. */
export async function statsLeagues(
  db: Queryable,
  season: string,
  phase: PhaseKind,
): Promise<{ slug: string; name: string; age: string | null; players: number }[]> {
  return db
    .select({
      slug: leagues.slug,
      name: leagues.name,
      age: leagues.age,
      players: sql<number>`count(*)::int`,
    })
    .from(playerStats)
    .innerJoin(phases, eq(phases.id, playerStats.phaseId))
    .innerJoin(leagues, eq(leagues.id, playerStats.leagueId))
    .where(and(eq(phases.seasonLabel, season), eq(phases.kind, phase)))
    .groupBy(leagues.slug, leagues.name, leagues.age);
}

/**
 * Scoring depth per team for a phase: skaters who played, how many scored,
 * the team's goals on its players\' lines, the goals of its top two scorers,
 * and its goals in final games, to show how complete the gamesheets are.
 */
export interface TeamScoring {
  teamId: number;
  communitySlug: string | null;
  age: string;
  skaters: number;
  scorers: number;
  goals: number;
  topTwo: number;
  gameGoals: number;
}

export async function teamScoring(
  db: Queryable,
  season: string,
  phase: PhaseKind,
): Promise<TeamScoring[]> {
  const phaseIds = db
    .select({ id: phases.id })
    .from(phases)
    .where(and(eq(phases.seasonLabel, season), eq(phases.kind, phase)));
  const result = await db.execute<{
    team_id: number;
    community_slug: string | null;
    age: string;
    skaters: number;
    scorers: number;
    goals: number;
    top_two: number;
    game_goals: number;
  }>(sql`
    with lines as (
      select ps.team_id, ps.league_id, ps.gp, ps.g,
             row_number() over (partition by ps.team_id, ps.league_id order by ps.g desc) as rank
        from player_stats ps
       where ps.phase_id in (${phaseIds}) and not ps.goalie and ps.gp > 0
    ),
    per_team as (
      select team_id, league_id, count(*)::int as skaters,
             count(*) filter (where g > 0)::int as scorers,
             sum(g)::int as goals,
             coalesce(sum(g) filter (where rank <= 2), 0)::int as top_two
        from lines group by team_id, league_id
    ),
    scored as (
      select league_id, team_id, sum(gf)::int as game_goals from (
        select league_id, home_team_id as team_id, home_score as gf from games where status = 'final'
        union all
        select league_id, away_team_id, away_score from games where status = 'final'
      ) x group by league_id, team_id
    )
    select t.id as team_id, t.community_slug, l.age, p.skaters, p.scorers, p.goals, p.top_two,
           coalesce(s.game_goals, 0) as game_goals
      from per_team p
      join teams t on t.id = p.team_id
      join leagues l on l.id = p.league_id
      left join scored s on s.team_id = p.team_id and s.league_id = p.league_id
     where l.age is not null
  `);
  return result.rows.map((r) => ({
    teamId: r.team_id,
    communitySlug: r.community_slug,
    age: r.age,
    skaters: r.skaters,
    scorers: r.scorers,
    goals: r.goals,
    topTwo: r.top_two,
    gameGoals: r.game_goals,
  }));
}

/** When player statistics were last fetched successfully, from the fetch log; null if never. */
export async function lastStatisticsFetch(db: Queryable): Promise<Date | null> {
  const [row] = await db
    .select({ at: sql<Date | null>`max(${fetches.fetchedAt})` })
    .from(fetches)
    .where(
      and(
        eq(fetches.source, "teamlinkt"),
        eq(fetches.status, 200),
        sql`${fetches.url} like '%/statistics'`,
      ),
    );
  return row?.at ? new Date(row.at) : null;
}
