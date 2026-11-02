// Pure view logic: turns database rows into what a page shows. No I/O here, so
// all of it is unit-tested in lib/__tests__.
import { computeStandings } from "@hockey/core";
import type { LeagueData, LeagueGame, LeagueSummary, LeagueTeam, PhaseKind } from "@hockey/db";

export interface TableRow {
  rank: number;
  team: LeagueTeam;
  gp: number;
  w: number;
  l: number;
  t: number;
  pts: number;
  gf: number;
  ga: number;
  diff: number;
}

/** The league table from its final games, every team listed, ranked 1 to N. */
export function leagueTable(data: LeagueData): TableRow[] {
  const byId = new Map(data.teams.map((t) => [String(t.id), t]));
  const rows = computeStandings(
    data.games
      .filter((g) => g.status === "final")
      .map((g) => ({
        homeTeam: String(g.homeTeamId),
        awayTeam: String(g.awayTeamId),
        homeScore: g.homeScore!,
        awayScore: g.awayScore!,
      })),
    data.teams.map((t) => String(t.id)),
  );
  return rows.map((r, i) => ({ ...r, rank: i + 1, team: byId.get(r.team)! }));
}

export interface Result {
  date: string;
  opponent: LeagueTeam;
  home: boolean;
  own: number;
  other: number;
  outcome: "W" | "L" | "T";
}

export interface Fixture {
  date: string;
  opponent: LeagueTeam;
  home: boolean;
}

export interface TeamCard {
  row: TableRow;
  of: number;
  results: Result[];
  next: Fixture | null;
}

/**
 * One team's place in its league: rank, record, recent results, next game.
 * `today` is a Calgary date: a scheduled game before it never got a score,
 * so it is not "next".
 */
export function teamCard(
  data: LeagueData,
  table: TableRow[],
  teamId: number,
  today: string,
  recent = 3,
): TeamCard | null {
  const row = table.find((r) => r.team.id === teamId);
  if (!row) return null;
  const byId = new Map(data.teams.map((t) => [t.id, t]));
  const theirs = data.games.filter((g) => g.homeTeamId === teamId || g.awayTeamId === teamId);

  const results = theirs
    .filter((g) => g.status === "final")
    .map((g) => result(g, teamId, byId))
    .filter((r): r is Result => r !== null)
    .reverse()
    .slice(0, recent);
  const upcoming = theirs.find((g) => g.status === "scheduled" && g.date >= today);
  const nextOpponent = upcoming && byId.get(opponentId(upcoming, teamId));

  return {
    row,
    of: table.length,
    results,
    next:
      upcoming && nextOpponent
        ? { date: upcoming.date, opponent: nextOpponent, home: upcoming.homeTeamId === teamId }
        : null,
  };
}

function opponentId(g: LeagueGame, teamId: number): number {
  return g.homeTeamId === teamId ? g.awayTeamId : g.homeTeamId;
}

function result(g: LeagueGame, teamId: number, byId: Map<number, LeagueTeam>): Result | null {
  const opponent = byId.get(opponentId(g, teamId));
  if (!opponent || g.homeScore == null || g.awayScore == null) return null;
  const home = g.homeTeamId === teamId;
  const own = home ? g.homeScore : g.awayScore;
  const other = home ? g.awayScore : g.homeScore;
  return {
    date: g.date,
    opponent,
    home,
    own,
    other,
    outcome: own > other ? "W" : own < other ? "L" : "T",
  };
}

/** Scheduled games split at `today`: still to come, and past ones that never got a score. */
export function scheduled(games: LeagueGame[], today: string) {
  const open = games.filter((g) => g.status === "scheduled");
  return {
    upcoming: open.filter((g) => g.date >= today),
    noScore: open.filter((g) => g.date < today).reverse(),
  };
}

/** Today's date in Calgary, YYYY-MM-DD. */
export function calgaryToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton" }).format(now);
}

// ---------------------------------------------------------------- labels --

const KEEP_UPPER = new Set(["BC", "NBC", "AA", "AAA", "NCHL", "NWHL", "SCHHL", "WCHL", "GHC"]);

/** TeamLinkt names leagues in capitals: "U13 TIER 2 SOUTH" → "U13 Tier 2 South". */
export function leagueLabel(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) =>
      /\d/.test(w) || KEEP_UPPER.has(w.toUpperCase())
        ? w.toUpperCase()
        : w[0]!.toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join(" ");
}

/** Drops the age prefix inside a league of that age: "U13 Knights 2 White" → "Knights 2 White". */
export function teamLabel(name: string, age: string | null): string {
  if (age && name.toUpperCase().startsWith(`${age.toUpperCase()} `)) {
    return name.slice(age.length + 1);
  }
  return name;
}

const PHASE_LABELS: Record<PhaseKind, string> = {
  playoffs: "Playoffs",
  regular: "Regular season",
  seeding: "Seeding",
  exhibition: "Exhibition",
  preseason: "Preseason",
  // Only U11 and U13 AA are read from TeamLinkt's "other" seasons (collector).
  other: "AA season",
};

export function phaseLabel(kind: PhaseKind): string {
  return PHASE_LABELS[kind];
}

/** "2026-10-31" → "Sat Oct 31". Calendar dates, so no time zone is applied. */
export function dateLabel(date: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
    .format(new Date(`${date}T12:00:00Z`))
    .replace(/\./g, "")
    .replace(",", "");
}

export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th");
  return `${n}${s}`;
}

// --------------------------------------------------------------- sorting --

// Latest phase first: once placements are made, the regular season is what matters.
const PHASE_ORDER: PhaseKind[] = [
  "playoffs",
  "regular",
  "seeding",
  "exhibition",
  "preseason",
  "other",
];
const KIND_ORDER: LeagueSummary["kind"][] = [
  "tier",
  "u7",
  "flames",
  "junior",
  "elite",
  "female",
  "rec",
  "other",
  "age-group",
];
const REGION_ORDER = ["north", "south", "west", "east", "bc", "nbc"];

const ageNumber = (age: string | null) => (age ? Number(age.slice(1)) : 99);

/** Phase, then age, then tier 1 first, then region. */
export function compareLeagues(a: LeagueSummary, b: LeagueSummary): number {
  return (
    PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase) ||
    ageNumber(a.age) - ageNumber(b.age) ||
    KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
    (a.tier ?? 99) - (b.tier ?? 99) ||
    REGION_ORDER.indexOf(a.region ?? "") - REGION_ORDER.indexOf(b.region ?? "") ||
    a.name.localeCompare(b.name)
  );
}

/** Groups in first-seen order, so sort before grouping. */
export function groupBy<T, K>(items: T[], key: (item: T) => K): [K, T[]][] {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    let list = groups.get(k);
    if (!list) groups.set(k, (list = []));
    list.push(item);
  }
  return [...groups.entries()];
}

export function leagueHref(l: Pick<LeagueSummary, "phase" | "slug">): string {
  return `/l/${l.phase}/${l.slug}`;
}

export const PHASE_KINDS = Object.keys(PHASE_LABELS) as PhaseKind[];
