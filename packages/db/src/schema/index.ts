import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

// Column names are snake_case in SQL (client.ts and drizzle.config.ts set
// casing), camelCase here.

export const source = pgEnum("source", ["teamlinkt", "hockeycalgary", "history"]);
export const phaseKind = pgEnum("phase_kind", [
  "seeding",
  "regular",
  "playoffs",
  "exhibition",
  "preseason",
  "other",
]);
export const leagueKind = pgEnum("league_kind", [
  "age-group",
  "tier",
  "u7",
  "flames",
  "female",
  "elite",
  "junior",
  "rec",
  "other",
]);
export const gameStatus = pgEnum("game_status", ["scheduled", "final"]);

/** The associations; the slug is the one in the URL (/c/glenlake). */
export const communities = pgTable("communities", {
  slug: text().primaryKey(),
  name: text().notNull(),
});

/** A season as people say it: "2026-27". */
export const seasons = pgTable("seasons", {
  label: text().primaryKey(),
});

/**
 * One upstream season record. TeamLinkt keeps seeding and the regular season
 * as separate seasons with their own divisions, and teams are re-tiered
 * between them, so a league belongs to a phase, not to a season.
 */
export const phases = pgTable(
  "phases",
  {
    id: serial().primaryKey(),
    seasonLabel: text()
      .notNull()
      .references(() => seasons.label),
    kind: phaseKind().notNull(),
    source: source().notNull(),
    sourceId: text().notNull(),
    name: text().notNull(),
    startDate: date().notNull(),
    endDate: date().notNull(),
  },
  (t) => [unique().on(t.source, t.sourceId)],
);

export const leagues = pgTable(
  "leagues",
  {
    id: serial().primaryKey(),
    phaseId: integer()
      .notNull()
      .references(() => phases.id),
    /** The TeamLinkt division id. */
    sourceId: text().notNull(),
    slug: text().notNull(),
    name: text().notNull(),
    age: text(),
    kind: leagueKind().notNull(),
    tier: smallint(),
    region: text(),
    level: text(),
    /** Hockey Calgary's stream for the league ("community-council"); null when its index does not list it. */
    stream: text(),
  },
  (t) => [unique().on(t.phaseId, t.sourceId), unique().on(t.phaseId, t.slug)],
);

export const teams = pgTable(
  "teams",
  {
    id: serial().primaryKey(),
    source: source().notNull(),
    sourceId: text().notNull(),
    name: text().notNull(),
    /** Null when the name matches no known association: a new one, or a rename. */
    communitySlug: text().references(() => communities.slug),
    age: text(),
    stream: text(),
    number: smallint(),
    colour: text(),
  },
  (t) => [unique().on(t.source, t.sourceId), index().on(t.communitySlug)],
);

/** Which teams play in a league. A team plays in one league per phase. */
export const leagueTeams = pgTable(
  "league_teams",
  {
    leagueId: integer()
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    teamId: integer()
      .notNull()
      .references(() => teams.id),
  },
  (t) => [primaryKey({ columns: [t.leagueId, t.teamId] }), index().on(t.teamId)],
);

export const games = pgTable(
  "games",
  {
    id: serial().primaryKey(),
    source: source().notNull(),
    sourceId: text().notNull(),
    leagueId: integer()
      .notNull()
      .references(() => leagues.id),
    /** Local game date. TeamLinkt gives no start time; startsAt comes from the HC calendar feed. */
    date: date().notNull(),
    startsAt: timestamp({ withTimezone: true }),
    arena: text(),
    gameNumber: text(),
    homeTeamId: integer()
      .notNull()
      .references(() => teams.id),
    awayTeamId: integer()
      .notNull()
      .references(() => teams.id),
    homeScore: smallint(),
    awayScore: smallint(),
    resultType: text(),
    status: gameStatus().notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.source, t.sourceId),
    index().on(t.leagueId),
    index().on(t.homeTeamId),
    index().on(t.awayTeamId),
    check("games_two_teams", sql`${t.homeTeamId} <> ${t.awayTeamId}`),
    // A final game has both scores; a scheduled one has neither.
    check(
      "games_scores_match_status",
      sql`(${t.status} = 'final') = (${t.homeScore} is not null and ${t.awayScore} is not null)
          and (${t.homeScore} is null) = (${t.awayScore} is null)`,
    ),
  ],
);

/**
 * One player's statistics for a phase, from TeamLinkt's gamesheets. No name,
 * no photo, no player id or key: a line is "a player on this team", with the
 * jersey number from the team's roster. The collector replaces a phase's lines whole on each
 * run (Pat, 2026-11-01: leaderboards and full stats, but no player names).
 */
export const playerStats = pgTable(
  "player_stats",
  {
    id: serial().primaryKey(),
    phaseId: integer()
      .notNull()
      .references(() => phases.id),
    leagueId: integer()
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    teamId: integer()
      .notNull()
      .references(() => teams.id),
    gp: smallint().notNull(),
    g: smallint().notNull(),
    a: smallint().notNull(),
    pim: smallint().notNull(),
    /**
     * The number on the team's roster ("7", "07"), shown with the line (Pat,
     * 2026-11-02); null when blank or when the player is not on the roster.
     */
    jersey: text(),
    /**
     * On this team's roster; false for an affiliate player called up from
     * another team; null for lines written before rosters were read.
     */
    rostered: boolean(),
    /** Listed among the team's goalies. Saves are rarely entered, so only these are kept. */
    goalie: boolean().notNull(),
    wins: smallint(),
    losses: smallint(),
    ties: smallint(),
    shutouts: smallint(),
    goalsAgainst: smallint(),
  },
  (t) => [index().on(t.phaseId), index().on(t.leagueId), index().on(t.teamId)],
);

/**
 * Every upstream request the collector makes: the drift log. A response whose
 * hash changes while its parse yields nothing is the signal a source changed.
 */
export const fetches = pgTable(
  "fetches",
  {
    id: serial().primaryKey(),
    fetchedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    source: source().notNull(),
    method: text().notNull(),
    url: text().notNull(),
    body: jsonb(),
    status: smallint(),
    durationMs: integer(),
    contentHash: text(),
    /** Records parsed from the response; null when it failed before parsing. */
    records: integer(),
    error: text(),
  },
  (t) => [index().on(t.fetchedAt)],
);

/**
 * Past seasons as season totals, one row per team per league per phase,
 * imported once from the old hockey-calgary-scraper database (2021-22 to
 * 2025-26; scripts/import-history.mjs). There are no games behind these rows,
 * so they live apart from the tables above and nothing reads them as games.
 */
export const historyStandings = pgTable(
  "history_standings",
  {
    id: serial().primaryKey(),
    seasonLabel: text()
      .notNull()
      .references(() => seasons.label),
    phase: phaseKind().notNull(),
    /** Hockey Calgary's slug: "u15-tier-2-nbc-blue". */
    leagueSlug: text().notNull(),
    /** Cleaned and upper-cased like TeamLinkt's: "U15 TIER 2 NBC BLUE". */
    leagueName: text().notNull(),
    age: text().notNull(),
    /** 0 for U11 and U13 AA, as in the comparison; then Tier 1 down. */
    tier: smallint().notNull(),
    region: text(),
    /** A split pool's colour within its tier ("BLUE"); null when the tier is one pool. */
    pool: text(),
    teamName: text().notNull(),
    communitySlug: text().references(() => communities.slug),
    gp: smallint().notNull(),
    w: smallint().notNull(),
    l: smallint().notNull(),
    t: smallint().notNull(),
    gf: smallint().notNull(),
    ga: smallint().notNull(),
    /** Where the old scraper read it: "hockeycalgary", "ramp" or "teamlinkt". */
    origin: text().notNull(),
    sourceUrl: text(),
  },
  (t) => [
    unique().on(t.seasonLabel, t.phase, t.leagueSlug, t.teamName),
    index().on(t.communitySlug),
    check("history_standings_record", sql`${t.gp} = ${t.w} + ${t.l} + ${t.t}`),
  ],
);
