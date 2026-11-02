import { describe, expect, it } from "vitest";
import {
  type HistoryRow,
  historyCommunity,
  parseHistoryLeague,
  resolvePhases,
} from "../history.js";

describe("parseHistoryLeague", () => {
  it("reads all three sources' names, split pools included", () => {
    expect(parseHistoryLeague("U15 Tier 2 NBC Blue - Seeding")).toEqual({
      name: "U15 TIER 2 NBC BLUE",
      slug: "u15-tier-2-nbc-blue",
      age: "U15",
      tier: 2,
      region: "nbc",
      pool: "BLUE",
    });
    expect(parseHistoryLeague("U13 / U13 TIER 1 NORTH - Seeding")).toMatchObject({
      slug: "u13-tier-1-north",
      age: "U13",
      tier: 1,
      region: "north",
      pool: null,
    });
    expect(parseHistoryLeague("U11 Tier 5 South - League")).toMatchObject({
      slug: "u11-tier-5-south",
      tier: 5,
    });
    expect(parseHistoryLeague("U13 Tier 6 North")).toMatchObject({ tier: 6, region: "north" });
    expect(parseHistoryLeague("U18 Tier 3 BC Black - Seeding")).toMatchObject({
      tier: 3,
      region: "bc",
      pool: "BLACK",
    });
  });

  it("makes U11 and U13 AA tier 0, and leaves out zone AA", () => {
    expect(parseHistoryLeague("U11 AA - League")).toMatchObject({ age: "U11", tier: 0 });
    expect(parseHistoryLeague("U15 AA")).toBeNull();
    expect(parseHistoryLeague("City Championships - U11 Tier 1 North")).toBeNull();
  });
});

describe("historyCommunity", () => {
  it("maps the old names onto today's slugs", () => {
    expect(historyCommunity("North West")).toBe("northwest");
    expect(historyCommunity("Bow Valley")).toBe("bow-valley");
    expect(historyCommunity("Girls Hockey Calgary")).toBe("girls-hockey-calgary");
    expect(historyCommunity("McKnight")).toBe("mcknight");
    expect(historyCommunity("Okotoks")).toBeNull();
    expect(historyCommunity(null)).toBeNull();
  });
});

describe("resolvePhases", () => {
  const row = (type: "Seeding" | "Regular", team: string, gp: number, slug = "s"): HistoryRow => ({
    season: "2025-2026",
    type,
    slug,
    team,
    gp,
    w: gp,
    l: 0,
    t: 0,
    gf: gp * 3,
    ga: 0,
  });

  it("keeps both phases when the tables differ", () => {
    const out = resolvePhases([row("Seeding", "A", 8), row("Regular", "A", 14)]);
    expect(out.map((r) => [r.phase, r.gp])).toEqual([
      ["seeding", 8],
      ["regular", 14],
    ]);
  });

  it("keeps one copy of a table reported twice, in the phase its games fit", () => {
    const seedingOnly = resolvePhases([
      row("Seeding", "A", 8),
      row("Seeding", "B", 8),
      row("Regular", "B", 8),
      row("Regular", "A", 8),
    ]);
    expect(seedingOnly.map((r) => [r.phase, r.team])).toEqual([
      ["seeding", "B"],
      ["seeding", "A"],
    ]);
    const regularOnly = resolvePhases([row("Seeding", "A", 16), row("Regular", "A", 16)]);
    expect(regularOnly.map((r) => r.phase)).toEqual(["regular"]);
  });

  it("treats each season and league on its own", () => {
    const out = resolvePhases([
      row("Seeding", "A", 8, "x"),
      row("Regular", "A", 8, "x"),
      row("Regular", "A", 14, "y"),
    ]);
    expect(out.map((r) => [r.slug, r.phase])).toEqual([
      ["x", "seeding"],
      ["y", "regular"],
    ]);
  });
});
