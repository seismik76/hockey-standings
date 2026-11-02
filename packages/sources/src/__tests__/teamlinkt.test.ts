import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SCORES_PAGE_LIMIT,
  TeamLinktShapeError,
  classifyDivision,
  divisionsRequest,
  parseDivisions,
  parseScores,
  parseSeasons,
  parseStandings,
  parseStatistics,
  scoresRequest,
  seasonsRequest,
  standingsRequest,
  statisticsRequest,
  teamsRequest,
} from "../teamlinkt.js";

// Captured 2026-10-31; see fixtures/teamlinkt/README.md for the requests.
function fixture(name: string): unknown {
  const url = new URL(`../../fixtures/teamlinkt/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8"));
}

const SEEDING = 61563;
const U13_T2_SOUTH = 332824;

describe("requests", () => {
  it("match what the fixtures were captured with", () => {
    expect(seasonsRequest()).toEqual({
      method: "GET",
      url: "https://app.teamlinkt.com/api/public/sites/hockeycalgary/seasons",
    });
    expect(divisionsRequest(SEEDING).url).toBe(
      "https://app.teamlinkt.com/api/public/sites/hockeycalgary/divisions?season_id=61563",
    );
    expect(
      scoresRequest({
        seasonId: SEEDING,
        divisionId: U13_T2_SOUTH,
        from: "2026-10-17",
        to: "2026-11-15",
      }),
    ).toEqual({
      method: "POST",
      url: "https://app.teamlinkt.com/api/public/sites/hockeycalgary/scores",
      body: {
        season_id: 61563,
        division_id: 332824,
        limit: 50,
        from: "2026-10-17",
        to: "2026-11-15",
      },
    });
    expect(standingsRequest({ seasonId: SEEDING, divisionId: U13_T2_SOUTH }).body).toEqual({
      season_id: 61563,
      division_id: 332824,
    });
    expect(teamsRequest(SEEDING)).toEqual({
      method: "POST",
      url: "https://app.teamlinkt.com/api/public/sites/hockeycalgary/teams",
      body: { season_id: 61563 },
    });
  });
});

describe("parseSeasons", () => {
  const seasons = parseSeasons(fixture("seasons.json"));

  it("labels and phases the 2026-27 seasons", () => {
    expect(seasons.find((s) => s.sourceId === SEEDING)).toEqual({
      sourceId: SEEDING,
      name: "2026-2027 Seeding", // trailing space in the source
      label: "2026-27",
      phase: "seeding",
      startDate: "2026-10-17",
      endDate: "2026-11-15",
    });
    expect(seasons.find((s) => s.sourceId === 60742)).toMatchObject({
      label: "2026-27",
      phase: "regular",
    });
  });

  it("leaves admin seasons unlabelled", () => {
    expect(seasons.find((s) => s.name === "Admin")).toMatchObject({ label: null, phase: "other" });
  });
});

describe("parseDivisions", () => {
  const divisions = parseDivisions(fixture("divisions-61563.json"));

  it("returns the 7 age groups and 90 leagues of the seeding season", () => {
    expect(divisions).toHaveLength(97);
    expect(divisions.filter((d) => d.kind === "age-group").map((d) => d.age)).toEqual([
      "U7",
      "U9",
      "U11",
      "U13",
      "U15",
      "U18",
      "U21",
    ]);
  });

  it("classifies every name in the capture", () => {
    // A new naming pattern lands as "other"; fail so the classifier is extended.
    expect(divisions.filter((d) => d.kind === "other").map((d) => d.name)).toEqual([]);
    expect(divisions.find((d) => d.sourceId === U13_T2_SOUTH)).toEqual({
      sourceId: U13_T2_SOUTH,
      seasonId: SEEDING,
      name: "U13 TIER 2 SOUTH",
      slug: "u13-tier-2-south",
      age: "U13",
      kind: "tier",
      tier: 2,
      region: "south",
      level: null,
    });
  });

  it.each([
    ["U15 TIER 3 NBC", { age: "U15", kind: "tier", tier: 3, region: "nbc", level: null }],
    ["U7 SENIOR WEST", { age: "U7", kind: "u7", tier: null, region: "west", level: "SENIOR" }],
    ["U9 FLAMES WCHL", { age: "U9", kind: "flames", tier: null, region: null, level: "WCHL" }],
    ["U13 FEMALE AA", { age: "U13", kind: "female", tier: null, region: null, level: "AA" }],
    ["U17 AAA", { age: "U17", kind: "elite", tier: null, region: null, level: "AAA" }],
    ["U21 Junior C", { age: "U21", kind: "junior", tier: null, region: null, level: "C" }],
    ["U21 Junior Rec", { age: "U21", kind: "rec", tier: null, region: null, level: null }],
    ["Showcase", { age: null, kind: "other", tier: null, region: null, level: null }],
  ])("classifies %s", (name, expected) => {
    expect(classifyDivision(name)).toEqual(expected);
  });
});

describe("parseScores", () => {
  const { games, mayBeTruncated } = parseScores(fixture("scores-61563-332824.json"));

  it("returns every completed seeding game in the window", () => {
    expect(games).toHaveLength(25);
    expect(mayBeTruncated).toBe(false);
    expect(games.every((g) => g.status === "final" && g.divisionId === U13_T2_SOUTH)).toBe(true);
    expect(games.find((g) => g.sourceId === "4192947")).toEqual({
      source: "teamlinkt",
      sourceId: "4192947",
      date: "2026-10-31",
      divisionId: U13_T2_SOUTH,
      home: { sourceId: 948274, name: "U13 Knights 2 White" },
      away: { sourceId: 945190, name: "U13 Glenlake Hawks 2 Blue" },
      homeScore: 3,
      awayScore: 1,
      resultType: "regulation",
      status: "final",
    });
  });

  it("drops non-game events, marks unplayed games scheduled and flags a full page", () => {
    const game = {
      id: 1,
      date: "2026-11-01",
      homeTeamId: 10,
      homeTeamName: "Home ",
      awayTeamId: 20,
      awayTeamName: "Away",
      homeScore: null,
      awayScore: null,
      resultType: null,
      divisionId: 5,
      isGame: true,
    };
    const practice = { ...game, id: 2, isGame: false, homeTeamId: null, awayTeamId: null };
    const filler = Array.from({ length: SCORES_PAGE_LIMIT - 2 }, (_, i) => ({
      ...game,
      id: 100 + i,
    }));

    const parsed = parseScores({ games: [game, practice, ...filler], divisionId: 5 });

    expect(parsed.mayBeTruncated).toBe(true);
    expect(parsed.games).toHaveLength(SCORES_PAGE_LIMIT - 1);
    expect(parsed.games[0]).toMatchObject({
      home: { sourceId: 10, name: "Home" },
      homeScore: null,
      status: "scheduled",
    });
  });

  it("throws on a changed shape instead of returning nothing", () => {
    expect(() => parseScores({ games: [{ id: "4192947" }], divisionId: 1 })).toThrow(
      TeamLinktShapeError,
    );
    expect(() => parseScores({ data: [] })).toThrow(/scores response changed shape/);
  });
});

describe("parseStandings", () => {
  const standings = parseStandings(fixture("standings-61563-332824.json"));

  it("returns the 12-team table", () => {
    expect(standings).toHaveLength(12);
    expect(standings.find((s) => s.team.name === "U13 Glenlake Hawks 2 Green")).toEqual({
      team: { sourceId: 945191, name: "U13 Glenlake Hawks 2 Green" },
      divisionId: U13_T2_SOUTH,
      gp: 4,
      w: 3,
      l: 0,
      t: 1,
      otw: 0,
      otl: 0,
      pts: 7,
      gf: 13,
      ga: 4,
      streak: "W2",
    });
  });
});

describe("statistics", () => {
  const stats = () => fixture("statistics-61563-332824-pts.json");

  it("asks for every player of the given leagues, two statistics at a time", () => {
    expect(
      statisticsRequest({
        seasonId: 61563,
        divisionIds: [332824],
        group: "offensive",
        primary: "PTS",
        secondary: "G",
        sortBy: 11220800,
        page: 2,
      }),
    ).toEqual({
      method: "POST",
      url: "https://app.teamlinkt.com/api/public/sites/hockeycalgary/statistics",
      body: {
        season_id: 61563,
        mode: "all_players",
        statistic_group_type: "offensive",
        statistic_abbreviation: "PTS",
        secondary_statistic_abbreviation: "G",
        sort_by: "11220800",
        sort_dir: "desc",
        page: 2,
        per_page: 50,
        filteredDivisionIds: [332824],
      },
    });
  });

  it("reads lines by abbreviation, with a one-way key and no name", () => {
    const page = parseStatistics(stats());
    expect(page.total).toBe(192);
    expect(page.lines).toHaveLength(50);
    expect(page.ids.get("PTS")).toBe(11220800);
    expect(Object.keys(page.lines[0]!.stats).sort()).toEqual(["G", "PTS"]);
    // Sorted by points, high to low.
    const pts = page.lines.map((l) => l.stats.PTS!);
    expect(pts).toEqual([...pts].sort((a, b) => b - a));
    expect(new Set(page.lines.map((l) => l.key)).size).toBe(50);
    // Nothing that left the parser carries the name.
    expect(JSON.stringify(page.lines)).not.toMatch(/Player \d/);
    expect(Object.keys(page.lines[0]!)).toEqual(["key", "teamId", "stats"]);
  });

  it("reads a player with no stats sent as an empty list, and numbers sent as strings", () => {
    const page = parseStatistics({
      statistics: [
        { id: 1, abbreviation: "GP" },
        { id: 2, abbreviation: "SV%" },
      ],
      players: [
        { name: "x", teamId: 5, picture: null, stats: [] },
        { name: "y", teamId: 5, picture: null, stats: { "1": "3", "2": "0.000", "9": null } },
        { name: "z", teamId: 5, picture: null, stats: null },
      ],
      page: 1,
      total: 3,
    });
    expect(page.lines.map((l) => l.stats)).toEqual([{}, { GP: 3, "SV%": 0 }, {}]);
  });

  it("reads stats sent as a JSON string, as the default view sends them", () => {
    const page = parseStatistics({
      statistics: [{ id: 1, abbreviation: "GP" }],
      players: [{ name: "x", teamId: 5, picture: null, stats: '{"1":4}' }],
      page: 1,
      total: 1,
    });
    expect(page.lines[0]!.stats).toEqual({ GP: 4 });
  });
});
