import { readFileSync } from "node:fs";
import { getDb, schema } from "@hockey/db";
import { closeDb, setUpTestDatabase, truncateAll } from "@hockey/db/testing";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { collect, scoresBetween, seasonLabelFor } from "../collect.js";
import { type HttpRequest, type Transport, createClient } from "../http.js";

beforeAll(() => setUpTestDatabase("hockey_test_collector"));
beforeEach(truncateAll);
afterAll(closeDb);

const FIXTURES = new URL("../../../../packages/sources/fixtures/", import.meta.url);
const fixture = (path: string) => readFileSync(new URL(path, FIXTURES), "utf8");

const SEEDING = 61563;
const U13_T2_SOUTH = 332824;
const TODAY = "2026-10-31";

/**
 * TeamLinkt and Hockey Calgary as captured on 2026-10-31: the real seasons,
 * divisions and league index, real scores and standings for U13 Tier 2 South,
 * and empty ones for every other league.
 */
const captured: Transport = async (req) => {
  const ok = (text: string) => ({ status: 200, text });
  const body = (req.body ?? {}) as { season_id?: number; division_id?: number };
  const path = new URL(req.url).pathname;

  if (req.source === "hockeycalgary") return ok(fixture("hockeycalgary/community-council.html"));
  if (path.endsWith("/seasons")) return ok(fixture("teamlinkt/seasons.json"));
  if (path.endsWith("/divisions")) {
    return ok(
      req.url.endsWith(`season_id=${SEEDING}`) ? fixture("teamlinkt/divisions-61563.json") : "[]",
    );
  }
  const ours = body.season_id === SEEDING && body.division_id === U13_T2_SOUTH;
  if (path.endsWith("/standings")) {
    return ok(
      ours
        ? fixture("teamlinkt/standings-61563-332824.json")
        : JSON.stringify({ columns: [], teams: [], divisionId: body.division_id }),
    );
  }
  if (path.endsWith("/scores")) {
    return ok(
      ours
        ? fixture("teamlinkt/scores-61563-332824.json")
        : JSON.stringify({ games: [], divisionId: body.division_id }),
    );
  }
  return { status: 404, text: "not found" };
};

describe("seasonLabelFor", () => {
  it("rolls over in September", () => {
    expect(seasonLabelFor("2026-08-31")).toBe("2025-26");
    expect(seasonLabelFor("2026-09-01")).toBe("2026-27");
    expect(seasonLabelFor("2027-02-21")).toBe("2026-27");
    expect(seasonLabelFor("2099-12-01")).toBe("2099-00");
  });
});

describe("collect", () => {
  it("loads every Community Council league of the season", async () => {
    const db = getDb();
    const summary = await collect(db, createClient(db, captured, { gapMs: 0 }), { today: TODAY });

    expect(summary).toMatchObject({
      season: "2026-27",
      // The regular season has started in TeamLinkt's calendar but has no divisions yet.
      // The two "other" seasons are read for AA only, and have none here.
      phases: expect.arrayContaining([
        "2026-2027 Regular Season",
        "2026-2027 Seeding",
        "2026-2027 Season",
        "2026-2027 TeamLinkt",
      ]),
      // 59 Community Council leagues, less U11 AA, empty in seeding and so skipped.
      leagues: 58,
      teams: 12,
      gamesChanged: 25,
      errors: [],
      unmatchedTeams: [],
    });

    const [{ n: leagues }] = (await db.select({ n: count() }).from(schema.leagues)) as [
      { n: number },
    ];
    expect(leagues).toBe(58);
    const [league] = await db
      .select()
      .from(schema.leagues)
      .where(eq(schema.leagues.slug, "u13-tier-2-south"));
    expect(league).toMatchObject({
      kind: "tier",
      tier: 2,
      region: "south",
      stream: "community-council",
    });
    expect(
      await db.select().from(schema.leagueTeams).where(eq(schema.leagueTeams.leagueId, league!.id)),
    ).toHaveLength(12);
    expect(await db.select().from(schema.games)).toHaveLength(25);

    const glenlake = await db
      .select()
      .from(schema.teams)
      .where(eq(schema.teams.communitySlug, "glenlake"));
    expect(glenlake.map((t) => t.name).sort()).toEqual([
      "U13 Glenlake Hawks 2 Blue",
      "U13 Glenlake Hawks 2 Green",
      "U13 Glenlake Hawks 2 White",
    ]);
  });

  it("logs every request, and changes nothing on a second run", async () => {
    const db = getDb();
    const first = await collect(db, createClient(db, captured, { gapMs: 0 }), { today: TODAY });
    const second = await collect(db, createClient(db, captured, { gapMs: 0 }), { today: TODAY });

    expect(second.gamesChanged).toBe(0);
    const fetches = await db.select().from(schema.fetches);
    expect(fetches).toHaveLength(first.requests + second.requests);
    // seasons + league index + 4 division lists + standings and scores for 59
    // Community Council leagues and U13 AA (looked at, then skipped as empty)
    expect(first.requests).toBe(6 + 60 * 2);
    expect(
      fetches.every((f) => f.status === 200 && f.contentHash?.length === 64 && f.error === null),
    ).toBe(true);
    const scores = fetches.find(
      (f) =>
        (f.body as { division_id?: number } | null)?.division_id === U13_T2_SOUTH &&
        f.url.endsWith("/scores"),
    );
    expect(scores).toMatchObject({
      records: 25,
      body: { season_id: SEEDING, from: "2026-10-17", to: TODAY },
    });
  });

  it("carries on past a league that fails, and records why", async () => {
    const db = getDb();
    const flaky: Transport = (req: HttpRequest) => {
      const body = req.body as { division_id?: number } | undefined;
      return body?.division_id === U13_T2_SOUTH
        ? Promise.resolve({ status: 503, text: "busy" })
        : captured(req);
    };
    const summary = await collect(db, createClient(db, flaky, { gapMs: 0 }), { today: TODAY });

    expect(summary.leagues).toBe(57);
    expect(summary.errors).toEqual([
      expect.stringMatching(
        /^2026-2027 Seeding \/ U13 TIER 2 SOUTH: POST .*\/standings answered 503$/,
      ),
    ]);
    const failed = await db.select().from(schema.fetches).where(eq(schema.fetches.status, 503));
    expect(failed).toHaveLength(1);
    expect(failed[0]!.error).toMatch(/answered 503/);
  });
});

describe("AA", () => {
  const OTHER = 56273;
  const U13_AA = 332817;
  // The "2026-2027 TeamLinkt" season lists every division, and U13 AA has games.
  const withAa: Transport = async (req) => {
    const body = (req.body ?? {}) as { season_id?: number; division_id?: number };
    const path = new URL(req.url).pathname;
    if (path.endsWith("/divisions") && req.url.endsWith(`season_id=${OTHER}`)) {
      return { status: 200, text: fixture("teamlinkt/divisions-61563.json") };
    }
    if (body.season_id === OTHER && body.division_id === U13_AA) {
      if (path.endsWith("/standings")) {
        return { status: 200, text: fixture("teamlinkt/standings-61563-332824.json") };
      }
      if (path.endsWith("/scores")) {
        return { status: 200, text: fixture("teamlinkt/scores-61563-332824.json") };
      }
    }
    return captured(req);
  };

  it("reads AA, and only AA, from TeamLinkt's other seasons", async () => {
    const db = getDb();
    const summary = await collect(db, createClient(db, withAa, { gapMs: 0 }), { today: TODAY });
    expect(summary.errors).toEqual([]);
    const other = await db
      .select({ slug: schema.leagues.slug, stream: schema.leagues.stream })
      .from(schema.leagues)
      .innerJoin(schema.phases, eq(schema.phases.id, schema.leagues.phaseId))
      .where(eq(schema.phases.kind, "other"));
    // U11 AA is listed there too, with no games, so skipped.
    expect(other).toEqual([{ slug: "u13-aa", stream: "aa" }]);
    expect(summary.leagues).toBe(59);
  });
});

describe("scoresBetween", () => {
  it("halves a window that fills a whole page until each part fits", async () => {
    const db = getDb();
    const windows: string[] = [];
    // 10 games a day: a 30-day window overflows the 50-game page, a 4-day one fits.
    const busy: Transport = async (req) => {
      const { from, to } = req.body as { from: string; to: string };
      windows.push(`${from}..${to}`);
      const games = [];
      for (let d = Date.parse(from); d <= Date.parse(to); d += 86_400_000) {
        const date = new Date(d).toISOString().slice(0, 10);
        for (let i = 0; i < 10; i++) {
          games.push({
            id: Number(date.replaceAll("-", "")) * 100 + i,
            date,
            homeTeamId: 1,
            homeTeamName: "U13 Knights 1",
            awayTeamId: 2,
            awayTeamName: "U13 Southwest 1",
            homeScore: 1,
            awayScore: 0,
            resultType: "regulation",
            divisionId: 5,
            isGame: true,
          });
        }
      }
      return { status: 201, text: JSON.stringify({ games: games.slice(0, 50), divisionId: 5 }) };
    };

    const games = await scoresBetween(createClient(db, busy, { gapMs: 0 }), {
      seasonId: 1,
      divisionId: 5,
      from: "2026-10-17",
      to: "2026-11-15",
    });

    expect(games).toHaveLength(300);
    expect(new Set(games.map((g) => g.sourceId)).size).toBe(300);
    expect(windows[0]).toBe("2026-10-17..2026-11-15");
    expect(windows.length).toBeGreaterThan(8);
  });
});
