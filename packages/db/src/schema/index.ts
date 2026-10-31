import { sql } from "drizzle-orm";
import {
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
