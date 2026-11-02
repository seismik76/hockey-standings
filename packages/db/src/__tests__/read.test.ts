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
  communityLeagues,
  communityName,
  currentSeason,
  leagueData,
  listCommunities,
  listLeagues,
  tierCoverage,
  tierGames,
  tierPlacements,
} from "../queries/read.js";
import { closeDb, setUpTestDatabase, truncateAll } from "../testing.js";

beforeAll(() => setUpTestDatabase("hockey_test_db"));
beforeEach(async () => {
  await truncateAll();
  await seed();
});
afterAll(closeDb);

const phase = (kind: "seeding" | "regular", sourceId: string) => ({
  seasonLabel: "2026-27",
  kind,
  source: "teamlinkt" as const,
  sourceId,
  name: `2026-2027 ${kind}`,
  startDate: "2026-10-17",
  endDate: "2027-02-21",
});

/**
 * Seeding U13 Tier 2 South: Knights 2 White beat Glenlake 2 Blue, and they
 * play again next week. Regular-season Junior C: Glenlake only, no games.
 */
async function seed() {
  const db = getDb();
  await upsertCommunities(db, [
    { slug: "glenlake", name: "Glenlake" },
    { slug: "knights", name: "Knights" },
    { slug: "southwest", name: "Southwest" },
  ]);
  const seeding = await upsertPhase(db, phase("seeding", "61563"));
  const regular = await upsertPhase(db, phase("regular", "60742"));
  const u13 = await upsertLeague(db, {
    phaseId: seeding,
    sourceId: "332824",
    slug: "u13-tier-2-south",
    name: "U13 TIER 2 SOUTH",
    age: "U13",
    kind: "tier",
    tier: 2,
    region: "south",
    stream: "community-council",
  });
  const juniorC = await upsertLeague(db, {
    phaseId: regular,
    sourceId: "999",
    slug: "u21-junior-c",
    name: "U21 Junior C",
    age: "U21",
    kind: "junior",
    level: "C",
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
    {
      source: "teamlinkt",
      sourceId: "3",
      name: "Glenlake Hawks Junior C",
      communitySlug: "glenlake",
    },
  ]);
  await setLeagueTeams(db, u13, [ids.get("1")!, ids.get("2")!]);
  await setLeagueTeams(db, juniorC, [ids.get("3")!]);
  const g = {
    source: "teamlinkt" as const,
    leagueId: u13,
    homeTeamId: ids.get("1")!,
    awayTeamId: ids.get("2")!,
  };
  await upsertGames(db, [
    {
      ...g,
      sourceId: "g1",
      date: "2026-10-31",
      homeScore: 3,
      awayScore: 1,
      resultType: "regulation",
      status: "final",
    },
    {
      ...g,
      sourceId: "g2",
      date: "2026-11-07",
      homeScore: null,
      awayScore: null,
      resultType: null,
      status: "scheduled",
    },
  ]);
}

describe("read queries", () => {
  it("find the current season", async () => {
    expect(await currentSeason(getDb())).toBe("2026-27");
  });

  it("list every league with its counts", async () => {
    const leagues = await listLeagues(getDb(), "2026-27");
    expect(
      leagues
        .map(({ slug, phase, teams, games, finals, lastPlayed }) => ({
          slug,
          phase,
          teams,
          games,
          finals,
          lastPlayed,
        }))
        .sort((a, b) => a.slug.localeCompare(b.slug)),
    ).toEqual([
      {
        slug: "u13-tier-2-south",
        phase: "seeding",
        teams: 2,
        games: 2,
        finals: 1,
        lastPlayed: "2026-10-31",
      },
      { slug: "u21-junior-c", phase: "regular", teams: 1, games: 0, finals: 0, lastPlayed: null },
    ]);
    expect(await listLeagues(getDb(), "2025-26")).toEqual([]);
  });

  it("count each community's teams, including communities with none", async () => {
    expect(await listCommunities(getDb(), "2026-27")).toEqual([
      { slug: "glenlake", name: "Glenlake", teams: 2 },
      { slug: "knights", name: "Knights", teams: 1 },
      { slug: "southwest", name: "Southwest", teams: 0 },
    ]);
  });

  it("load one league with its teams and games in date order", async () => {
    const data = await leagueData(getDb(), "2026-27", "seeding", "u13-tier-2-south");
    expect(data?.teams.map((t) => t.name)).toEqual([
      "U13 Glenlake Hawks 2 Blue",
      "U13 Knights 2 White",
    ]);
    expect(data?.games.map((g) => [g.date, g.status, g.homeScore, g.awayScore])).toEqual([
      ["2026-10-31", "final", 3, 1],
      ["2026-11-07", "scheduled", null, null],
    ]);
    expect(await leagueData(getDb(), "2026-27", "regular", "u13-tier-2-south")).toBeNull();
  });

  it("load every league a community plays in, across phases", async () => {
    const glenlake = await communityLeagues(getDb(), "2026-27", "glenlake");
    expect(glenlake.map((d) => d.league.slug).sort()).toEqual(["u13-tier-2-south", "u21-junior-c"]);
    // The league comes with all its teams, not only the community's.
    expect(glenlake.find((d) => d.league.slug === "u13-tier-2-south")?.teams).toHaveLength(2);
    expect(await communityLeagues(getDb(), "2026-27", "southwest")).toEqual([]);
    expect(await communityName(getDb(), "glenlake")).toBe("Glenlake");
    expect(await communityName(getDb(), "nowhere")).toBeNull();
  });

  it("give tiered games and placements by community, and each phase's coverage", async () => {
    // Junior C is not tiered and the scheduled game is not final: neither counts.
    expect(await tierGames(getDb(), "2026-27", "seeding")).toEqual([
      {
        age: "U13",
        tier: 2,
        homeCommunity: "knights",
        awayCommunity: "glenlake",
        homeScore: 3,
        awayScore: 1,
      },
    ]);
    expect(await tierGames(getDb(), "2026-27", "regular")).toEqual([]);
    expect(
      (await tierPlacements(getDb(), "2026-27", "seeding")).sort((a, b) =>
        a.community.localeCompare(b.community),
      ),
    ).toEqual([
      { community: "glenlake", age: "U13", tier: 2, teams: 1 },
      { community: "knights", age: "U13", tier: 2, teams: 1 },
    ]);
    expect(
      (await tierCoverage(getDb(), "2026-27")).sort((a, b) => a.phase.localeCompare(b.phase)),
    ).toEqual([
      { phase: "regular", teams: 0, finals: 0 },
      { phase: "seeding", teams: 2, finals: 1 },
    ]);
  });
});
