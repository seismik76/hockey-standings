// One collector run: every Community Council league of the current season,
// from TeamLinkt's public site API, into the database.
import {
  type Database,
  setLeagueTeams,
  upsertCommunities,
  upsertGames,
  upsertLeague,
  upsertPhase,
  upsertTeams,
} from "@hockey/db";
import {
  COMMUNITIES,
  COMMUNITY_COUNCIL,
  SCORES_PAGE_LIMIT,
  type ScoresWindow,
  type TeamLinktDivision,
  type TeamLinktGame,
  type TeamLinktRequest,
  type TeamLinktSeason,
  type TeamRef,
  divisionsRequest,
  isVisitingClub,
  leagueIndexUrl,
  parseDivisions,
  parseLeagueIndex,
  parseScores,
  parseSeasons,
  parseStandings,
  parseTeamName,
  scoresRequest,
  seasonsRequest,
  standingsRequest,
  teamLinktSlug,
} from "@hockey/sources";
import type { Client } from "./http.js";
import { collectStats, statsDue, statsRunDue } from "./stats.js";

export interface RunSummary {
  season: string;
  phases: string[];
  leagues: number;
  teams: number;
  gamesChanged: number;
  requests: number;
  /** One line per league that failed; the run carries on past them. */
  errors: string[];
  /** Team names that matched no community: a new association, or a rename to add to COMMUNITIES. */
  unmatchedTeams: string[];
  /** Anonymous player lines written, across phases whose stats were due. */
  playerStats: number;
}

/** Phases with player statistics worth keeping: the comparison's two. */
const STATS_PHASES = new Set<TeamLinktSeason["phase"]>(["seeding", "regular"]);

// Exhibition, preseason and admin "seasons" are not collected.
const COLLECTED = new Set<TeamLinktSeason["phase"]>(["seeding", "regular", "playoffs"]);

/**
 * U11 and U13 AA: one team per association, compared as a level above Tier 1
 * (Pat, 2026-11-01). U11 AA is in Hockey Calgary's Community Council index;
 * U13 AA is not, so both are named here. U13 AA plays its schedule in one of
 * TeamLinkt's "other" seasons ("2026-2027 TeamLinkt"), so those seasons are
 * read too, for these leagues only. An AA league with nothing in it is skipped.
 */
export const AA_SLUGS = new Set(["u11-aa", "u13-aa"]);

/** "2026-10-31" → "2026-27". A hockey season runs September to August. */
export function seasonLabelFor(date: string): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const start = month >= 9 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Today's date in Calgary, YYYY-MM-DD. */
export function calgaryToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton" }).format(now);
}

export async function collect(
  db: Database,
  client: Client,
  {
    today,
    now = new Date(),
    forceStats = false,
  }: {
    today: string;
    now?: Date;
    /** Fetch player stats on this run even if they were fetched in the last day. */
    forceStats?: boolean;
  },
): Promise<RunSummary> {
  const season = seasonLabelFor(today);
  const summary: RunSummary = {
    season,
    phases: [],
    leagues: 0,
    teams: 0,
    gamesChanged: 0,
    requests: 0,
    errors: [],
    unmatchedTeams: [],
    playerStats: 0,
  };
  const unmatched = new Set<string>();
  const statsThisRun = forceStats || (await statsRunDue(db, now));
  // Phases whose player stats to fetch, after every phase's scores are in.
  const statsQueue: { phaseId: number; phase: TeamLinktSeason; divisions: number[] }[] = [];

  const seasons = await teamlinkt(client, seasonsRequest(), parseSeasons);
  const councilSlugs = new Set(
    (
      await client.request(
        { source: "hockeycalgary", method: "GET", url: leagueIndexUrl() },
        (text) => {
          const leagues = parseLeagueIndex(text);
          return { value: leagues, records: leagues.length };
        },
      )
    ).map((l) => teamLinktSlug(l.slug)),
  );
  await upsertCommunities(
    db,
    COMMUNITIES.map(({ slug, name }) => ({ slug, name })),
  );

  const phases = seasons.filter(
    (s) =>
      s.label === season && (COLLECTED.has(s.phase) || s.phase === "other") && s.startDate <= today,
  );
  for (const phase of phases) {
    summary.phases.push(phase.name);
    const phaseId = await upsertPhase(db, {
      seasonLabel: season,
      kind: phase.phase,
      source: "teamlinkt",
      sourceId: String(phase.sourceId),
      name: phase.name,
      startDate: phase.startDate,
      endDate: phase.endDate,
    });
    const divisions = await teamlinkt(client, divisionsRequest(phase.sourceId), parseDivisions);
    const leagues = divisions.filter(
      (d) =>
        AA_SLUGS.has(d.slug) ||
        (phase.phase !== "other" && d.kind !== "age-group" && councilSlugs.has(d.slug)),
    );

    // Tiered and AA leagues collected this run: the ones player stats cover.
    const statDivisions: number[] = [];
    for (const division of leagues) {
      try {
        const stream = councilSlugs.has(division.slug) ? COMMUNITY_COUNCIL : "aa";
        const r = await collectLeague(db, client, {
          phase,
          phaseId,
          division,
          stream,
          today,
          unmatched,
        });
        if (!r) continue;
        if (division.kind === "tier" || division.kind === "elite")
          statDivisions.push(division.sourceId);
        summary.leagues++;
        summary.teams += r.teams;
        summary.gamesChanged += r.gamesChanged;
      } catch (err) {
        summary.errors.push(`${phase.name} / ${division.name}: ${(err as Error).message}`);
      }
    }

    if (statsThisRun && STATS_PHASES.has(phase.phase) && statDivisions.length > 0) {
      statsQueue.push({ phaseId, phase, divisions: statDivisions });
    }
  }

  // Player stats last: a stats day takes far longer than the scores, and the
  // scores should never wait for it.
  for (const { phaseId, phase, divisions } of statsQueue) {
    try {
      if (await statsDue(db, { ...phase, id: phaseId }, today)) {
        summary.playerStats += await collectStats(db, client, {
          phaseId,
          seasonId: phase.sourceId,
          divisionIds: divisions,
        });
      }
    } catch (err) {
      summary.errors.push(`${phase.name} / player stats: ${(err as Error).message}`);
    }
  }

  summary.requests = client.count;
  summary.unmatchedTeams = [...unmatched].sort();
  return summary;
}

async function collectLeague(
  db: Database,
  client: Client,
  ctx: {
    phase: TeamLinktSeason;
    phaseId: number;
    division: TeamLinktDivision;
    stream: string;
    today: string;
    unmatched: Set<string>;
  },
): Promise<{ teams: number; gamesChanged: number } | null> {
  const { phase, phaseId, division, today } = ctx;
  const window = { seasonId: phase.sourceId, divisionId: division.sourceId };
  const standings = await teamlinkt(client, standingsRequest(window), parseStandings);
  const to = phase.endDate < today ? phase.endDate : today;
  const games = await scoresBetween(client, { ...window, from: phase.startDate, to });

  // Every team in the table, plus any that only appear in a game.
  const refs = new Map<number, TeamRef>();
  for (const s of standings) refs.set(s.team.sourceId, s.team);
  for (const g of games)
    for (const t of [g.home, g.away]) if (!refs.has(t.sourceId)) refs.set(t.sourceId, t);
  // AA leagues turn up empty in seasons they do not play in, and in an "other"
  // season with a team list but no games; neither is worth a league.
  if (AA_SLUGS.has(division.slug) && games.length === 0) {
    if (refs.size === 0 || phase.phase === "other") return null;
  }

  return db.transaction(async (tx) => {
    const leagueId = await upsertLeague(tx, {
      phaseId,
      sourceId: String(division.sourceId),
      slug: division.slug,
      name: division.name,
      age: division.age,
      kind: division.kind,
      tier: division.tier,
      region: division.region,
      level: division.level,
      stream: ctx.stream,
    });
    const ids = await upsertTeams(
      tx,
      [...refs.values()].map((t) => {
        const p = parseTeamName(t.name);
        // Flames-league teams are named for their league ("U11 SCHHL Black"), not an
        // association, so having no community is expected there.
        if (!p.community && division.kind !== "flames" && !isVisitingClub(t.name)) {
          ctx.unmatched.add(t.name);
        }
        return {
          source: "teamlinkt" as const,
          sourceId: String(t.sourceId),
          name: t.name,
          communitySlug: p.community?.slug ?? null,
          age: p.age,
          stream: p.stream,
          number: p.number,
          colour: p.colour,
        };
      }),
    );
    await setLeagueTeams(tx, leagueId, [...ids.values()]);
    const gamesChanged = await upsertGames(
      tx,
      games.map((g) => ({
        source: "teamlinkt" as const,
        sourceId: g.sourceId,
        leagueId,
        date: g.date,
        homeTeamId: ids.get(String(g.home.sourceId))!,
        awayTeamId: ids.get(String(g.away.sourceId))!,
        homeScore: g.homeScore,
        awayScore: g.awayScore,
        resultType: g.resultType,
        status: g.status,
      })),
    );
    return { teams: ids.size, gamesChanged };
  });
}

/**
 * Every game in a date window. A response that fills a whole page may be
 * missing games, so the window is halved and each half fetched again, down to
 * a single day.
 */
export async function scoresBetween(client: Client, w: ScoresWindow): Promise<TeamLinktGame[]> {
  if (w.to < w.from) return [];
  const { games, mayBeTruncated } = await teamlinkt(
    client,
    scoresRequest(w),
    parseScores,
    (r) => r.games.length,
  );
  if (!mayBeTruncated) return games;
  if (w.from === w.to) {
    throw new Error(
      `more than ${SCORES_PAGE_LIMIT} events on ${w.from} in division ${w.divisionId}`,
    );
  }
  const mid = addDays(w.from, Math.floor(daysBetween(w.from, w.to) / 2));
  const halves = [
    ...(await scoresBetween(client, { ...w, to: mid })),
    ...(await scoresBetween(client, { ...w, from: addDays(mid, 1) })),
  ];
  return [...new Map(halves.map((g) => [g.sourceId, g])).values()];
}

/** A TeamLinkt request, logged with how many records the response held (array length by default). */
async function teamlinkt<T>(
  client: Client,
  req: TeamLinktRequest,
  parse: (json: unknown) => T,
  records: (value: T) => number = (v) => (v as unknown[]).length,
): Promise<T> {
  return client.request({ source: "teamlinkt", ...req }, (text) => {
    const value = parse(JSON.parse(text));
    return { value, records: records(value) };
  });
}

const DAY = 86_400_000;
const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);
const daysBetween = (a: string, b: string) => Math.round((utc(b) - utc(a)) / DAY);
const addDays = (d: string, n: number) => new Date(utc(d) + n * DAY).toISOString().slice(0, 10);
