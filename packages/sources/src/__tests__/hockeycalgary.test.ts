import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  HockeyCalgaryShapeError,
  leagueIndexUrl,
  parseLeagueIndex,
  teamLinktSlug,
} from "../hockeycalgary.js";
import { parseDivisions } from "../teamlinkt.js";

function fixture(path: string): string {
  return readFileSync(new URL(`../../fixtures/${path}`, import.meta.url), "utf8");
}

// Captured 2026-10-31 from leagueIndexUrl().
const leagues = parseLeagueIndex(fixture("hockeycalgary/community-council.html"));

describe("parseLeagueIndex", () => {
  it("builds the index URL", () => {
    expect(leagueIndexUrl()).toBe(
      "https://www.hockeycalgary.ca/stream/view/stream/community-council",
    );
  });

  it("finds all 59 Community Council leagues", () => {
    expect(leagues).toHaveLength(59);
    const byAge: Record<string, number> = {};
    for (const l of leagues) {
      const age = /^U\d+/.exec(l.name)?.[0] ?? l.name;
      byAge[age] = (byAge[age] ?? 0) + 1;
    }
    expect(byAge).toEqual({
      U7: 6,
      U9: 12,
      U11: 15,
      U13: 11,
      U15: 7,
      U18: 7,
      "Junior C": 1,
    });
    expect(leagues.find((l) => l.slug === "u13-tier-2-south")).toEqual({
      slug: "u13-tier-2-south",
      name: "U13 Tier 2 South",
      stream: "community-council",
      url: "https://www.hockeycalgary.ca/league/view/stream/community-council/league/u13-tier-2-south",
    });
  });

  it("throws on a page with no league links", () => {
    expect(() => parseLeagueIndex("<html><body>Maintenance</body></html>")).toThrow(
      HockeyCalgaryShapeError,
    );
  });
});

describe("teamLinktSlug", () => {
  it("maps every league to a TeamLinkt division of the seeding season", () => {
    const divisions = parseDivisions(JSON.parse(fixture("teamlinkt/divisions-61563.json")));
    const bySlug = new Map(divisions.map((d) => [d.slug, d]));

    expect(leagues.filter((l) => !bySlug.has(teamLinktSlug(l.slug))).map((l) => l.slug)).toEqual(
      [],
    );
    expect(bySlug.get(teamLinktSlug("junior-c"))?.name).toBe("U21 Junior C");
  });
});
