import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COMMUNITIES, communityBySlug, parseTeamName } from "../communities.js";
import { parseTeams } from "../teamlinkt.js";

const teams = parseTeams(
  JSON.parse(
    readFileSync(new URL("../../fixtures/teamlinkt/teams-61563.json", import.meta.url), "utf8"),
  ),
);

describe("parseTeamName", () => {
  it.each([
    [
      "U15 Glenlake Hawks NBC 1",
      { age: "U15", slug: "glenlake", stream: "NBC", number: 1, colour: null, rest: "" },
    ],
    [
      "U11 Bow Valley Flames 1 Black",
      { age: "U11", slug: "bow-valley", stream: null, number: 1, colour: "Black", rest: "" },
    ],
    [
      "U13 Raiders Hockey Club 1 Black",
      { age: "U13", slug: "raiders", stream: null, number: 1, colour: "Black", rest: "" },
    ],
    [
      "U11 Raiders 2 White",
      { age: "U11", slug: "raiders", stream: null, number: 2, colour: "White", rest: "" },
    ],
    [
      "U11 GHC Inferno Blaze",
      {
        age: "U11",
        slug: "girls-hockey-calgary",
        stream: null,
        number: null,
        colour: null,
        rest: "Blaze",
      },
    ],
    // The old history: no age, other spellings, all caps.
    [
      "Southwest 2 Gold",
      { age: null, slug: "southwest", stream: null, number: 2, colour: "Gold", rest: "" },
    ],
    [
      "BOW RIVER BRUINS 4 BLACK",
      { age: null, slug: "bow-river", stream: null, number: 4, colour: "Black", rest: "" },
    ],
    [
      "North West 3",
      { age: null, slug: "northwest", stream: null, number: 3, colour: null, rest: "" },
    ],
  ])("reads %s", (name, expected) => {
    const { community, ...parts } = parseTeamName(name);
    expect({ ...parts, slug: community?.slug ?? null }).toEqual(expected);
  });

  it("does not read McKnight as Knights, or Knights as McKnight", () => {
    expect(parseTeamName("U11 McKnight Mustangs 1").community?.slug).toBe("mcknight");
    expect(parseTeamName("U11 Knights 1 Black").community?.slug).toBe("knights");
  });

  it("leaves an unknown association unmatched", () => {
    expect(parseTeamName("U13 Calgary Royals 1")).toMatchObject({
      community: null,
      number: 1,
      rest: "Calgary Royals",
    });
  });
});

describe("the 2026-27 seeding teams", () => {
  it("all 492 resolve to a community", () => {
    expect(teams).toHaveLength(492);
    expect(teams.filter((t) => !parseTeamName(t.name).community).map((t) => t.name)).toEqual([]);
  });

  it("split across the 12 associations as captured", () => {
    const counts: Record<string, number> = {};
    for (const t of teams) {
      const slug = parseTeamName(t.name).community!.slug;
      counts[slug] = (counts[slug] ?? 0) + 1;
    }
    expect(counts).toEqual({
      "bow-river": 34,
      "bow-valley": 61,
      "girls-hockey-calgary": 6,
      glenlake: 54,
      knights: 48,
      mcknight: 36,
      northwest: 40,
      raiders: 44,
      southwest: 41,
      springbank: 44,
      "trails-west": 44,
      wolverines: 40,
    });
    expect(Object.keys(counts).sort()).toEqual(COMMUNITIES.map((c) => c.slug).sort());
  });

  it("leave nothing unread except Girls Hockey Calgary's team names", () => {
    // A nickname or suffix the parser does not know shows up here as leftover text.
    const leftovers = teams
      .map((t) => parseTeamName(t.name))
      .filter((p) => p.rest !== "")
      .map((p) => `${p.community!.slug}: ${p.rest}`);
    expect(leftovers.sort()).toEqual([
      "girls-hockey-calgary: Blaze",
      "girls-hockey-calgary: Flames",
      "girls-hockey-calgary: Heat",
      "girls-hockey-calgary: Ignite",
      "girls-hockey-calgary: Scorch",
      "girls-hockey-calgary: Spark",
    ]);
  });
});

describe("communityBySlug", () => {
  it("finds a community by its URL slug", () => {
    expect(communityBySlug("glenlake")?.name).toBe("Glenlake");
    expect(communityBySlug("nowhere")).toBeUndefined();
  });

  it("has unique slugs", () => {
    expect(new Set(COMMUNITIES.map((c) => c.slug)).size).toBe(COMMUNITIES.length);
  });
});
