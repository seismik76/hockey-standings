import { eq } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../client.js";
import {
  type GameRow,
  recordFetch,
  setLeagueTeams,
  upsertCommunities,
  upsertGames,
  upsertLeague,
  upsertPhase,
  upsertTeams,
} from "../queries/ingest.js";
import { games, leagueTeams, phases, teams } from "../schema/index.js";
import { closeDb, setUpTestDatabase, truncateAll, webDatabaseUrl } from "./_support.js";

beforeAll(setUpTestDatabase);
beforeEach(truncateAll);
afterAll(closeDb);

const SEEDING = {
  seasonLabel: "2026-27",
  kind: "seeding",
  source: "teamlinkt",
  sourceId: "61563",
  name: "2026-2027 Seeding",
  startDate: "2026-10-17",
  endDate: "2026-11-15",
} as const;

/** One league with two teams, the way the collector writes them. */
async function seedLeague() {
  const db = getDb();
  await upsertCommunities(db, [
    { slug: "glenlake", name: "Glenlake" },
    { slug: "knights", name: "Knights" },
  ]);
  const phaseId = await upsertPhase(db, SEEDING);
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
    {
      source: "teamlinkt",
      sourceId: "948274",
      name: "U13 Knights 2 White",
      communitySlug: "knights",
      age: "U13",
      number: 2,
      colour: "White",
    },
    {
      source: "teamlinkt",
      sourceId: "945190",
      name: "U13 Glenlake Hawks 2 Blue",
      communitySlug: "glenlake",
      age: "U13",
      number: 2,
      colour: "Blue",
    },
  ]);
  return { phaseId, leagueId, knights: ids.get("948274")!, glenlake: ids.get("945190")! };
}

function game(s: Awaited<ReturnType<typeof seedLeague>>, over: Partial<GameRow> = {}): GameRow {
  return {
    source: "teamlinkt",
    sourceId: "4192947",
    leagueId: s.leagueId,
    date: "2026-10-31",
    homeTeamId: s.knights,
    awayTeamId: s.glenlake,
    homeScore: 3,
    awayScore: 1,
    resultType: "regulation",
    status: "final",
    ...over,
  };
}

describe("upserts", () => {
  it("can be repeated without duplicating anything", async () => {
    const first = await seedLeague();
    const again = await seedLeague();
    expect(again).toEqual(first);

    const db = getDb();
    expect(await db.select().from(phases)).toHaveLength(1);
    expect(await db.select().from(teams)).toHaveLength(2);
  });

  it("update a phase in place when the source renames it", async () => {
    const id = await upsertPhase(getDb(), SEEDING);
    expect(
      await upsertPhase(getDb(), { ...SEEDING, name: "2026-27 Seeding", endDate: "2026-11-16" }),
    ).toBe(id);
    const [row] = await getDb().select().from(phases);
    expect(row).toMatchObject({ name: "2026-27 Seeding", endDate: "2026-11-16" });
  });

  it("set a league's team list exactly", async () => {
    const s = await seedLeague();
    const db = getDb();
    await setLeagueTeams(db, s.leagueId, [s.knights, s.glenlake]);
    await setLeagueTeams(db, s.leagueId, [s.glenlake]);
    expect(await db.select().from(leagueTeams)).toEqual([
      { leagueId: s.leagueId, teamId: s.glenlake },
    ]);
    await setLeagueTeams(db, s.leagueId, []);
    expect(await db.select().from(leagueTeams)).toEqual([]);
  });
});

describe("upsertGames", () => {
  it("counts only games that are new or changed", async () => {
    const s = await seedLeague();
    const db = getDb();
    const scheduled = game(s, {
      homeScore: null,
      awayScore: null,
      resultType: null,
      status: "scheduled",
    });

    expect(await upsertGames(db, [scheduled])).toBe(1);
    expect(await upsertGames(db, [scheduled])).toBe(0);
    const [before] = await db.select().from(games);

    expect(await upsertGames(db, [game(s)])).toBe(1);
    const [after] = await db.select().from(games);
    expect(after).toMatchObject({ id: before!.id, status: "final", homeScore: 3, awayScore: 1 });
    expect(after!.updatedAt.getTime()).toBeGreaterThanOrEqual(before!.updatedAt.getTime());
  });

  it("keeps calendar-feed fields that TeamLinkt does not send", async () => {
    const s = await seedLeague();
    const db = getDb();
    await upsertGames(db, [game(s)]);
    await db.update(games).set({ arena: "Glenmore Arena", gameNumber: "271S00001" });
    await upsertGames(db, [game(s, { homeScore: 4 })]);
    const [row] = await db.select().from(games).where(eq(games.sourceId, "4192947"));
    expect(row).toMatchObject({ homeScore: 4, arena: "Glenmore Arena", gameNumber: "271S00001" });
  });

  it("refuses a final game without both scores, or a team playing itself", async () => {
    const s = await seedLeague();
    const db = getDb();
    await expect(upsertGames(db, [game(s, { awayScore: null })])).rejects.toThrow();
    await expect(upsertGames(db, [game(s, { status: "scheduled" })])).rejects.toThrow();
    await expect(upsertGames(db, [game(s, { awayTeamId: s.knights })])).rejects.toThrow();
  });
});

describe("the web app's role", () => {
  it("can read every table and write none", async () => {
    const s = await seedLeague();
    await upsertGames(getDb(), [game(s)]);
    await recordFetch(getDb(), { source: "teamlinkt", method: "GET", url: "https://example.test" });

    const web = new pg.Client({ connectionString: webDatabaseUrl() });
    await web.connect();
    try {
      const { rows } = await web.query("select count(*)::int as n from games");
      expect(rows[0].n).toBe(1);
      for (const table of ["fetches", "communities", "teams", "leagues", "league_teams"]) {
        await expect(web.query(`select 1 from ${table} limit 1`)).resolves.toBeDefined();
      }
      await expect(web.query("update games set home_score = 9")).rejects.toThrow(
        /permission denied/,
      );
      await expect(web.query("delete from teams")).rejects.toThrow(/permission denied/);
      await expect(
        web.query("insert into communities (slug, name) values ('x', 'X')"),
      ).rejects.toThrow(/permission denied/);
      await expect(web.query("create table sneaky (id int)")).rejects.toThrow(/permission denied/);
    } finally {
      await web.end();
    }
  });
});
