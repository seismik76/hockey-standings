// Player statistics for a phase, from TeamLinkt, stored anonymously.
//
// TeamLinkt sends two statistics per request, so a phase takes a few passes
// over the same players: points with goals, games played with PIM, and the
// goalies' record and goals against. The passes are joined on the parser's
// one-way key, in memory; what is written has no name, photo or key, only the
// team, the numbers and the jersey number from the team's roster (player_stats).
import {
  type Database,
  hasPlayerStats,
  lastStatisticsFetch,
  phaseTeams,
  replacePlayerStats,
} from "@hockey/db";
import type { PlayerStatRow } from "@hockey/db";
import {
  STATS_PAGE_LIMIT,
  type StatLine,
  type StatisticsQuery,
  parseRoster,
  parseStatistics,
  rosterRequest,
  statisticsRequest,
} from "@hockey/sources";
import type { Client } from "./http.js";

/** A finished phase's stats are refreshed for a few days, for late gamesheets. */
const SETTLE_DAYS = 3;

/**
 * Stats are fetched on one run a day: they take a few hundred slow requests,
 * and gamesheets change by the day, not the hour. A run fetches them when the
 * last successful fetch is older than this.
 */
export const STATS_EVERY_HOURS = 20;

/** Whether this run should fetch player stats at all; decided once, before any phase. */
export async function statsRunDue(db: Database, now: Date): Promise<boolean> {
  const last = await lastStatisticsFetch(db);
  return last === null || now.getTime() - last.getTime() >= STATS_EVERY_HOURS * 3_600_000;
}

export interface StatPasses {
  /** Offensive group, points with goals. */
  scorers: StatLine[];
  /** No group, games played with PIM: every player who played. */
  played: StatLine[];
  /** Goalie group, any of W, L, T, SO, GA. */
  goalies: StatLine[];
}

/**
 * One anonymous line per player, without any key. Assists are points less
 * goals; a goalie with no games-played figure gets one from their record.
 * The jersey number comes from the team's roster, matched on the roster key;
 * a player not on it is an affiliate called up from another team, with no
 * number shown. Players with nothing at all (no games, no statistics) are
 * left out.
 */
export function mergeStatLines(
  passes: StatPasses,
  roster: ReadonlyMap<string, string | null>,
): (Omit<PlayerStatRow, "teamId" | "leagueId"> & { sourceTeamId: number })[] {
  const lines = new Map<
    string,
    { teamId: number; rosterKey: string; stats: Record<string, number>; goalie: boolean }
  >();
  const add = (l: StatLine, goalie: boolean) => {
    const line = lines.get(l.key) ?? {
      teamId: l.teamId,
      rosterKey: l.rosterKey,
      stats: {},
      goalie: false,
    };
    Object.assign(line.stats, l.stats);
    line.goalie ||= goalie;
    lines.set(l.key, line);
  };
  for (const l of passes.played) add(l, false);
  for (const l of passes.scorers) add(l, false);
  for (const l of passes.goalies) add(l, true);

  return [...lines.values()].flatMap(({ teamId, rosterKey, stats: s, goalie }) => {
    const n = (k: string) => s[k] ?? 0;
    const record = n("W") + n("L") + n("T");
    const gp = s.GP ?? (goalie ? record : 0);
    const g = n("G");
    const a = s.PTS !== undefined ? Math.max(0, s.PTS - g) : n("A");
    if (gp === 0 && g === 0 && a === 0 && record === 0) return [];
    return [
      {
        sourceTeamId: teamId,
        gp,
        g,
        a,
        pim: n("PIM"),
        jersey: roster.get(rosterKey) ?? null,
        rostered: roster.has(rosterKey),
        goalie,
        ...(goalie
          ? { wins: n("W"), losses: n("L"), ties: n("T"), shutouts: n("SO"), goalsAgainst: n("GA") }
          : {}),
      },
    ];
  });
}

/**
 * Every page of one query. With `stopAtZero`, paging stops after a page that
 * ends on a zero in that (sorted) statistic: the rest are zeros too.
 */
async function allPages(
  client: Client,
  q: Omit<StatisticsQuery, "page">,
  stopAtZero?: string,
): Promise<StatLine[]> {
  const lines: StatLine[] = [];
  for (let page = 1; ; page++) {
    const res = await client.request(
      { source: "teamlinkt", ...statisticsRequest({ ...q, page }) },
      (text) => {
        const value = parseStatistics(JSON.parse(text));
        return { value, records: value.lines.length };
      },
    );
    lines.push(...res.lines);
    const last = res.lines.at(-1);
    if (stopAtZero && last && (last.stats[stopAtZero] ?? 0) === 0) break;
    if (res.lines.length < STATS_PAGE_LIMIT || page * STATS_PAGE_LIMIT >= res.total) break;
  }
  return lines;
}

/** Whether a phase's stats are worth fetching on this run. */
export async function statsDue(
  db: Database,
  phase: { id: number; startDate: string; endDate: string },
  today: string,
): Promise<boolean> {
  if (phase.startDate > today) return false;
  const settled = new Date(Date.parse(`${phase.endDate}T00:00:00Z`) + SETTLE_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return today <= settled || !(await hasPlayerStats(db, phase.id));
}

/** Fetches and replaces a phase's player lines. Returns how many were written. */
export async function collectStats(
  db: Database,
  client: Client,
  { phaseId, seasonId, divisionIds }: { phaseId: number; seasonId: number; divisionIds: number[] },
): Promise<number> {
  if (divisionIds.length === 0) return 0;
  const base = { seasonId, divisionIds };
  // The statistic ids to sort by come from a first response.
  const probe = await client.request(
    { source: "teamlinkt", ...statisticsRequest({ ...base, primary: "GP", page: 1 }) },
    (text) => {
      const value = parseStatistics(JSON.parse(text));
      return { value, records: value.lines.length };
    },
  );
  const id = (abbr: string) => {
    const v = probe.ids.get(abbr);
    if (v === undefined) throw new Error(`TeamLinkt statistics have no ${abbr}`);
    return v;
  };

  const played = await allPages(
    client,
    { ...base, primary: "GP", secondary: "PIM", sortBy: id("GP") },
    "GP",
  );
  const scorers = await allPages(
    client,
    { ...base, group: "offensive", primary: "PTS", secondary: "G", sortBy: id("PTS") },
    "PTS",
  );
  const goalies = [
    ...(await allPages(client, {
      ...base,
      group: "goalie",
      primary: "W",
      secondary: "L",
      sortBy: id("W"),
    })),
    ...(await allPages(client, {
      ...base,
      group: "goalie",
      primary: "T",
      secondary: "SO",
      sortBy: id("T"),
    })),
    ...(await allPages(client, { ...base, group: "goalie", primary: "GA", sortBy: id("GA") })),
  ];

  // Rosters for the jersey numbers, ten leagues a request.
  const roster = new Map<string, string | null>();
  for (let i = 0; i < divisionIds.length; i += 10) {
    const lines = await client.request(
      {
        source: "teamlinkt",
        ...rosterRequest({ seasonId, divisionIds: divisionIds.slice(i, i + 10) }),
      },
      (text) => {
        const value = parseRoster(JSON.parse(text));
        return { value, records: value.length };
      },
    );
    for (const l of lines) roster.set(l.rosterKey, l.jersey);
  }

  const teams = await phaseTeams(db, phaseId);
  const rows: PlayerStatRow[] = mergeStatLines({ scorers, played, goalies }, roster).flatMap(
    ({ sourceTeamId, ...line }) => {
      const t = teams.get(String(sourceTeamId));
      return t ? [{ ...line, teamId: t.teamId, leagueId: t.leagueId }] : [];
    },
  );
  return replacePlayerStats(db, phaseId, rows);
}
