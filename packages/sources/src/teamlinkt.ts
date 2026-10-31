import { z } from "zod";

/**
 * TeamLinkt's public site API: the JSON behind the scores, standings and
 * schedule pages of leagues.teamlinkt.com/hockeycalgary. Read by owner
 * decision, see docs/SOURCES.md.
 *
 * Pure functions only: request builders and response parsers. Fetching,
 * pacing and retries belong to the collector. Every parser validates the
 * response shape first, so a TeamLinkt change throws instead of quietly
 * producing empty or zeroed records.
 */

export const TEAMLINKT_ORIGIN = "https://app.teamlinkt.com";
export const HOCKEY_CALGARY_SITE = "hockeycalgary";

/**
 * The page size the site's own scores widget asks for. A larger `limit`
 * (200 was tried) is refused with a redirect, so a window that fills a whole
 * page must be split and fetched again.
 */
export const SCORES_PAGE_LIMIT = 50;

export type TeamLinktRequest =
  { method: "GET"; url: string } | { method: "POST"; url: string; body: Record<string, unknown> };

export class TeamLinktShapeError extends Error {
  constructor(
    readonly endpoint: string,
    readonly issues: z.core.$ZodIssue[],
  ) {
    super(
      `TeamLinkt ${endpoint} response changed shape: ${z.prettifyError(new z.ZodError(issues))}`,
    );
    this.name = "TeamLinktShapeError";
  }
}

function siteUrl(site: string, path: string): string {
  return `${TEAMLINKT_ORIGIN}/api/public/sites/${encodeURIComponent(site)}/${path}`;
}

function parseWith<T>(endpoint: string, schema: z.ZodType<T>, json: unknown): T {
  const result = schema.safeParse(json);
  if (!result.success) throw new TeamLinktShapeError(endpoint, result.error.issues);
  return result.data;
}

const id = z.number().int().positive();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// ---------------------------------------------------------------- seasons --

export type SeasonPhase = "seeding" | "regular" | "playoffs" | "exhibition" | "preseason" | "other";

export interface TeamLinktSeason {
  sourceId: number;
  name: string;
  /** "2026-27", from a "2026-2027" in the name; null for seasons like "Admin". */
  label: string | null;
  phase: SeasonPhase;
  startDate: string;
  endDate: string;
}

const seasonsSchema = z.array(
  z.object({ id, name: z.string(), startDate: isoDate, endDate: isoDate }),
);

export function seasonsRequest(site = HOCKEY_CALGARY_SITE): TeamLinktRequest {
  return { method: "GET", url: siteUrl(site, "seasons") };
}

export function parseSeasons(json: unknown): TeamLinktSeason[] {
  return parseWith("seasons", seasonsSchema, json).map((s) => {
    const name = s.name.trim();
    const years = /(\d{4})-(\d{4})/.exec(name);
    return {
      sourceId: s.id,
      name,
      label: years ? `${years[1]}-${years[2]!.slice(2)}` : null,
      phase: seasonPhase(name),
      startDate: s.startDate,
      endDate: s.endDate,
    };
  });
}

function seasonPhase(name: string): SeasonPhase {
  if (/seeding/i.test(name)) return "seeding";
  if (/regular/i.test(name)) return "regular";
  if (/playoff/i.test(name)) return "playoffs";
  if (/exhibition/i.test(name)) return "exhibition";
  if (/pre-?season/i.test(name)) return "preseason";
  return "other";
}

// -------------------------------------------------------------- divisions --

/**
 * What a division name says about the league. TeamLinkt lists every stream
 * Hockey Calgary runs, not only Community Council, so the name is classified
 * rather than assumed to be "U13 TIER 2 SOUTH".
 */
export type DivisionKind =
  | "age-group" // the "U13" parent of the leagues below it
  | "tier" // U13 TIER 2 SOUTH, U15 TIER 1 BC
  | "u7" // U7 JUNIOR NORTH, U7 SENIOR WEST
  | "flames" // U9 FLAMES WCHL
  | "female" // U13 FEMALE AA, U18 FEMALE C
  | "elite" // U15 AAA, U16 AA
  | "junior" // U21 Junior B, U21 Junior C
  | "rec" // U13 REC, U21 Junior Rec
  | "other";

export type Region = "north" | "south" | "west" | "east" | "bc" | "nbc";

export interface TeamLinktDivision {
  sourceId: number;
  seasonId: number;
  name: string;
  slug: string;
  /** "U13", or null if the name has no age prefix. */
  age: string | null;
  kind: DivisionKind;
  tier: number | null;
  region: Region | null;
  /** The rest of the name where it carries a level: "AA", "C", "JUNIOR", "WCHL". */
  level: string | null;
}

const divisionsSchema = z.array(
  z.object({
    id,
    name: z.string(),
    slug: z.string(),
    seasonId: id,
    path: z.array(z.string()).min(1),
  }),
);

export function divisionsRequest(seasonId: number, site = HOCKEY_CALGARY_SITE): TeamLinktRequest {
  return { method: "GET", url: `${siteUrl(site, "divisions")}?season_id=${seasonId}` };
}

export function parseDivisions(json: unknown): TeamLinktDivision[] {
  return parseWith("divisions", divisionsSchema, json).map((d) => {
    const name = d.name.trim();
    return {
      sourceId: d.id,
      seasonId: d.seasonId,
      name,
      slug: d.slug,
      ...(d.path.length === 1 ? ageGroup(name) : classifyDivision(name)),
    };
  });
}

type DivisionClass = Pick<TeamLinktDivision, "age" | "kind" | "tier" | "region" | "level">;

function ageGroup(name: string): DivisionClass {
  return { age: agePrefix(name), kind: "age-group", tier: null, region: null, level: null };
}

function agePrefix(name: string): string | null {
  return /^U\d+\b/i.exec(name)?.[0].toUpperCase() ?? null;
}

const REGION = "(NORTH|SOUTH|WEST|EAST|BC|NBC)";

export function classifyDivision(name: string): DivisionClass {
  const age = agePrefix(name);
  const rest = (age ? name.slice(age.length) : name).trim().toUpperCase();
  const none = { age, tier: null, region: null, level: null };
  let m: RegExpExecArray | null;

  if ((m = new RegExp(`^TIER (\\d+) ${REGION}$`).exec(rest)))
    return { ...none, kind: "tier", tier: Number(m[1]), region: toRegion(m[2]!) };
  if ((m = new RegExp(`^(JUNIOR|SENIOR) ${REGION}$`).exec(rest)))
    return { ...none, kind: "u7", region: toRegion(m[2]!), level: m[1]! };
  if ((m = /^FLAMES (\w+)$/.exec(rest))) return { ...none, kind: "flames", level: m[1]! };
  if ((m = /^FEMALE (A{1,3}|[BC])$/.exec(rest))) return { ...none, kind: "female", level: m[1]! };
  if ((m = /^(A{2,3})$/.exec(rest))) return { ...none, kind: "elite", level: m[1]! };
  if (/^(JUNIOR )?REC$/.test(rest)) return { ...none, kind: "rec" };
  if ((m = /^JUNIOR ([A-C])$/.exec(rest))) return { ...none, kind: "junior", level: m[1]! };
  return { ...none, kind: "other" };
}

function toRegion(code: string): Region {
  return code.toLowerCase() as Region;
}

// ----------------------------------------------------------------- scores --

export interface TeamRef {
  sourceId: number;
  name: string;
}

export interface TeamLinktGame {
  source: "teamlinkt";
  sourceId: string;
  /** Local game date; the API gives no start time. */
  date: string;
  divisionId: number;
  home: TeamRef;
  away: TeamRef;
  homeScore: number | null;
  awayScore: number | null;
  /** "regulation" in every game seen so far; kept raw until overtime and shootouts show up. */
  resultType: string | null;
  status: "final" | "scheduled";
}

export interface ScoresWindow {
  seasonId: number;
  divisionId: number;
  /** Inclusive local dates, YYYY-MM-DD. */
  from: string;
  to: string;
}

const scoresSchema = z.object({
  games: z.array(
    z.object({
      id,
      date: isoDate,
      homeTeamId: id.nullable(),
      homeTeamName: z.string().nullable(),
      awayTeamId: id.nullable(),
      awayTeamName: z.string().nullable(),
      homeScore: z.number().int().nonnegative().nullable(),
      awayScore: z.number().int().nonnegative().nullable(),
      resultType: z.string().nullable(),
      divisionId: id,
      isGame: z.boolean(),
    }),
  ),
  divisionId: id,
});

export function scoresRequest(w: ScoresWindow, site = HOCKEY_CALGARY_SITE): TeamLinktRequest {
  return {
    method: "POST",
    url: siteUrl(site, "scores"),
    body: {
      season_id: w.seasonId,
      division_id: w.divisionId,
      limit: SCORES_PAGE_LIMIT,
      from: w.from,
      to: w.to,
    },
  };
}

/**
 * `mayBeTruncated` is true when the response filled a whole page: the window
 * may hold more games than came back, so the caller should split it and ask
 * again. Non-game events count toward the page but are dropped here.
 */
export function parseScores(json: unknown): { games: TeamLinktGame[]; mayBeTruncated: boolean } {
  const { games } = parseWith("scores", scoresSchema, json);
  const out: TeamLinktGame[] = [];
  for (const g of games) {
    if (!g.isGame || g.homeTeamId == null || g.awayTeamId == null) continue;
    const final = g.homeScore != null && g.awayScore != null;
    out.push({
      source: "teamlinkt",
      sourceId: String(g.id),
      date: g.date,
      divisionId: g.divisionId,
      home: { sourceId: g.homeTeamId, name: (g.homeTeamName ?? "").trim() },
      away: { sourceId: g.awayTeamId, name: (g.awayTeamName ?? "").trim() },
      homeScore: final ? g.homeScore : null,
      awayScore: final ? g.awayScore : null,
      resultType: g.resultType,
      status: final ? "final" : "scheduled",
    });
  }
  return { games: out, mayBeTruncated: games.length >= SCORES_PAGE_LIMIT };
}

// -------------------------------------------------------------- standings --

/**
 * TeamLinkt's own table. The app computes standings from games; this is the
 * cross-check that the computation and TeamLinkt agree.
 */
export interface TeamLinktStanding {
  team: TeamRef;
  divisionId: number;
  gp: number;
  w: number;
  l: number;
  t: number;
  otw: number;
  otl: number;
  pts: number;
  gf: number;
  ga: number;
  streak: string | null;
}

const count = z.number().int().nonnegative();

const standingsSchema = z.object({
  teams: z.array(
    z.object({
      id,
      name: z.string(),
      gamesPlayed: count,
      wins: count,
      losses: count,
      ties: count,
      goals_for: count,
      goals_against: count,
      streak: z.string().nullable(),
      division: z.object({ id }),
      stats: z.object({ total_points: count, overtime_wins: count, overtime_losses: count }),
    }),
  ),
  divisionId: id,
});

export function standingsRequest(
  w: Pick<ScoresWindow, "seasonId" | "divisionId">,
  site = HOCKEY_CALGARY_SITE,
): TeamLinktRequest {
  return {
    method: "POST",
    url: siteUrl(site, "standings"),
    body: { season_id: w.seasonId, division_id: w.divisionId },
  };
}

export function parseStandings(json: unknown): TeamLinktStanding[] {
  return parseWith("standings", standingsSchema, json).teams.map((t) => ({
    team: { sourceId: t.id, name: t.name.trim() },
    divisionId: t.division.id,
    gp: t.gamesPlayed,
    w: t.wins,
    l: t.losses,
    t: t.ties,
    otw: t.stats.overtime_wins,
    otl: t.stats.overtime_losses,
    pts: t.stats.total_points,
    gf: t.goals_for,
    ga: t.goals_against,
    streak: t.streak,
  }));
}

// ------------------------------------------------------------------ teams --

/**
 * Every team in a season, in one response, without its division: 492 teams
 * for 2026-27 seeding. Standings carry the team-to-division link; this list is
 * for checking that every team name resolves to a community.
 */
const teamsSchema = z.array(z.object({ id, name: z.string() }));

export function teamsRequest(seasonId: number, site = HOCKEY_CALGARY_SITE): TeamLinktRequest {
  return { method: "POST", url: siteUrl(site, "teams"), body: { season_id: seasonId } };
}

export function parseTeams(json: unknown): TeamRef[] {
  return parseWith("teams", teamsSchema, json).map((t) => ({
    sourceId: t.id,
    name: t.name.trim(),
  }));
}
