import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../client.js";
import {
  setLeagueTeams,
  upsertCommunities,
  upsertGames,
  upsertLeague,
  upsertPhase,
  upsertTeams,
} from "../queries/ingest.js";
import {
  type PlayerStatRow,
  goalieLeaders,
  hasPlayerStats,
  leaguePlayerLines,
  phaseTeams,
  replacePlayerStats,
  skaterLeaders,
  statsLeagues,
  teamScoring,
} from "../queries/stats.js";
import { closeDb, setUpTestDatabase, truncateAll } from "../testing.js";

beforeAll(() => setUpTestDatabase("hockey_test_db"));
beforeEach(truncateAll);
afterAll(closeDb);

/** Seeding U13 Tier 2 South: Knights 2 beat Glenlake 2, 4-1. */
async function seed() {
  const db = getDb();
  await upsertCommunities(db, [
    { slug: "glenlake", name: "Glenlake" },
    { slug: "knights", name: "Knights" },
  ]);
  const phaseId = await upsertPhase(db, {
    seasonLabel: "2026-27",
    kind: "seeding",
    source: "teamlinkt",
    sourceId: "61563",
    name: "2026-2027 Seeding",
    startDate: "2026-10-17",
    endDate: "2026-11-15",
  });
  const leagueId = await upsertLeague(db, {
    phaseId,
    sourceId: "332824",
    slug: "u13-tier-2-south",
    name: "U13 TIER 2 SOUTH",
    age: "U13",
    kind: "tier",
    tier: 2,
    region: "south",
    stream: "community-council",
  });
  const ids = await upsertTeams(db, [
    { source: "teamlinkt", sourceId: "1", name: "U13 Knights 2 White", communitySlug: "knights" },
    {
      source: "teamlinkt",
      sourceId: "2",
      name: "U13 Glenlake Hawks 2 Blue",
      communitySlug: "glenlake",
    },
  ]);
  const knights = ids.get("1")!;
  const glenlake = ids.get("2")!;
  await setLeagueTeams(db, leagueId, [knights, glenlake]);
  await upsertGames(db, [
    {
      source: "teamlinkt",
      sourceId: "g1",
      leagueId,
      homeTeamId: knights,
      awayTeamId: glenlake,
      date: "2026-10-31",
      homeScore: 4,
      awayScore: 1,
      resultType: "regulation",
      status: "final",
    },
  ]);
  const skater = (teamId: number, g: number, a: number, gp = 1, pim = 0): PlayerStatRow => ({
    leagueId,
    teamId,
    gp,
    g,
    a,
    pim,
    goalie: false,
  });
  const goalie = (teamId: number, w: number, l: number, ga: number): PlayerStatRow => ({
    leagueId,
    teamId,
    gp: w + l,
    g: 0,
    a: 0,
    pim: 0,
    goalie: true,
    wins: w,
    losses: l,
    ties: 0,
    shutouts: 0,
    goalsAgainst: ga,
  });
  const rows = [
    // Knights: four goals from three scorers, one more skater with none.
    skater(knights, 2, 1),
    skater(knights, 1, 2, 1, 4),
    skater(knights, 1, 0),
    skater(knights, 0, 0),
    // Glenlake: their one goal, and a skater who did not play.
    skater(glenlake, 1, 0),
    skater(glenlake, 0, 1),
    skater(glenlake, 0, 0, 0),
    goalie(knights, 1, 0, 1),
    goalie(glenlake, 0, 1, 4),
  ];
  return { db, phaseId, leagueId, knights, glenlake, rows };
}

describe("player stats", () => {
  it("map TeamLinkt team ids to ours, and replace a phase whole", async () => {
    const { db, phaseId, leagueId, knights, rows } = await seed();
    expect((await phaseTeams(db, phaseId)).get("1")).toEqual({ teamId: knights, leagueId });
    expect(await hasPlayerStats(db, phaseId)).toBe(false);
    expect(await replacePlayerStats(db, phaseId, rows)).toBe(9);
    expect(await replacePlayerStats(db, phaseId, rows.slice(0, 2))).toBe(2);
    expect(await leaguePlayerLines(db, "2026-27", "seeding", "u13-tier-2-south")).toHaveLength(2);
    expect(await hasPlayerStats(db, phaseId)).toBe(true);
  });

  it("rank skaters by the asked statistic and goalies by goals against a game", async () => {
    const { db, phaseId, rows } = await seed();
    await replacePlayerStats(db, phaseId, rows);
    const byPoints = await skaterLeaders(db, "2026-27", "seeding", { sort: "pts", limit: 3 });
    expect(byPoints.map((l) => [l.g, l.a])).toEqual([
      [2, 1],
      [1, 2],
      [1, 0],
    ]);
    const byPim = await skaterLeaders(db, "2026-27", "seeding", { sort: "pim", limit: 1 });
    expect(byPim[0]).toMatchObject({
      pim: 4,
      team: "U13 Knights 2 White",
      communitySlug: "knights",
    });
    expect(
      await skaterLeaders(db, "2026-27", "seeding", { age: "U9", sort: "pts", limit: 5 }),
    ).toEqual([]);
    const goalies = await goalieLeaders(db, "2026-27", "seeding", { minGames: 1, limit: 5 });
    expect(goalies.map((l) => l.goalsAgainst)).toEqual([1, 4]);
    expect(await goalieLeaders(db, "2026-27", "seeding", { minGames: 2, limit: 5 })).toEqual([]);
    // A goalie with no goals against entered is not ranked.
    await replacePlayerStats(db, phaseId, [...rows, { ...rows.at(-1)!, goalsAgainst: 0 }]);
    expect(await goalieLeaders(db, "2026-27", "seeding", { minGames: 1, limit: 5 })).toHaveLength(
      2,
    );
    expect(await statsLeagues(db, "2026-27", "seeding")).toEqual([
      // Nine lines, and the goalie with no goals against added above.
      { slug: "u13-tier-2-south", name: "U13 TIER 2 SOUTH", age: "U13", players: 10 },
    ]);
  });

  it("give each team's scoring depth beside its goals in games", async () => {
    const { db, phaseId, knights, glenlake, rows } = await seed();
    await replacePlayerStats(db, phaseId, rows);
    const teams = await teamScoring(db, "2026-27", "seeding");
    expect(teams.find((t) => t.teamId === knights)).toEqual({
      teamId: knights,
      communitySlug: "knights",
      age: "U13",
      skaters: 4,
      scorers: 3,
      goals: 4,
      topTwo: 3,
      gameGoals: 4,
    });
    // Goalies and skaters who did not play are left out.
    expect(teams.find((t) => t.teamId === glenlake)).toMatchObject({
      skaters: 2,
      scorers: 1,
      goals: 1,
      topTwo: 1,
      gameGoals: 1,
    });
  });
});
