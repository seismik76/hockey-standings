import type { LeagueData, LeagueSummary } from "@hockey/db";
import { describe, expect, it } from "vitest";
import {
  compareLeagues,
  dateLabel,
  groupBy,
  leagueLabel,
  leagueTable,
  calgaryToday,
  ordinal,
  scheduled,
  teamCard,
  teamLabel,
} from "../view.js";

const summary = (over: Partial<LeagueSummary> = {}): LeagueSummary => ({
  id: 1,
  phase: "seeding",
  phaseName: "2026-2027 Seeding",
  slug: "u13-tier-2-south",
  name: "U13 TIER 2 SOUTH",
  age: "U13",
  kind: "tier",
  tier: 2,
  region: "south",
  teams: 3,
  games: 3,
  finals: 2,
  lastPlayed: "2026-10-25",
  ...over,
});

const knights = { id: 1, name: "U13 Knights 2 White", communitySlug: "knights" };
const glenlake = { id: 2, name: "U13 Glenlake Hawks 2 Blue", communitySlug: "glenlake" };
const southwest = { id: 3, name: "U13 Southwest 2 Gold", communitySlug: "southwest" };

const final = (id: number, date: string, home: number, away: number, hs: number, as: number) => ({
  id,
  date,
  status: "final" as const,
  homeTeamId: home,
  awayTeamId: away,
  homeScore: hs,
  awayScore: as,
  resultType: "regulation",
});

const data: LeagueData = {
  league: summary(),
  teams: [glenlake, knights, southwest],
  games: [
    final(1, "2026-10-18", 1, 2, 3, 1), // Knights beat Glenlake
    final(2, "2026-10-25", 2, 3, 2, 2), // Glenlake tie Southwest
    {
      id: 3,
      date: "2026-11-01",
      status: "scheduled",
      homeTeamId: 3,
      awayTeamId: 2,
      homeScore: null,
      awayScore: null,
      resultType: null,
    },
  ],
};

describe("leagueTable", () => {
  it("ranks every team from final games only", () => {
    expect(leagueTable(data).map((r) => [r.rank, r.team.name, r.gp, r.pts])).toEqual([
      [1, "U13 Knights 2 White", 1, 2],
      [2, "U13 Southwest 2 Gold", 1, 1],
      [3, "U13 Glenlake Hawks 2 Blue", 2, 1],
    ]);
  });
});

describe("teamCard", () => {
  it("gives rank, latest results first, and the next game", () => {
    const card = teamCard(data, leagueTable(data), glenlake.id, "2026-10-31")!;
    expect(card.row.rank).toBe(3);
    expect(card.of).toBe(3);
    expect(
      card.results.map((r) => [r.date, r.outcome, r.own, r.other, r.opponent.name, r.home]),
    ).toEqual([
      ["2026-10-25", "T", 2, 2, "U13 Southwest 2 Gold", true],
      ["2026-10-18", "L", 1, 3, "U13 Knights 2 White", false],
    ]);
    expect(card.next).toEqual({ date: "2026-11-01", opponent: southwest, home: false });
  });

  it("is null for a team not in the league", () => {
    expect(teamCard(data, leagueTable(data), 99, "2026-10-31")).toBeNull();
  });

  it("never calls a past game without a score the next one", () => {
    expect(teamCard(data, leagueTable(data), glenlake.id, "2026-11-02")!.next).toBeNull();
    expect(teamCard(data, leagueTable(data), glenlake.id, "2026-11-01")!.next?.date).toBe(
      "2026-11-01",
    );
  });
});

describe("scheduled", () => {
  it("splits open games at today", () => {
    expect(scheduled(data.games, "2026-11-01").upcoming.map((g) => g.id)).toEqual([3]);
    expect(scheduled(data.games, "2026-11-02")).toMatchObject({
      upcoming: [],
      noScore: [{ id: 3 }],
    });
  });

  it("knows Calgary's date across midnight UTC", () => {
    // 2026-11-01 05:30 UTC is still Oct 31 in Calgary (UTC-6).
    expect(calgaryToday(new Date("2026-11-01T05:30:00Z"))).toBe("2026-10-31");
  });
});

describe("labels", () => {
  it.each([
    ["U13 TIER 2 SOUTH", "U13 Tier 2 South"],
    ["U15 TIER 1 NBC", "U15 Tier 1 NBC"],
    ["U9 FLAMES WCHL", "U9 Flames WCHL"],
    ["U21 Junior C", "U21 Junior C"],
    ["U7 SENIOR WEST", "U7 Senior West"],
  ])("leagueLabel(%s)", (name, label) => {
    expect(leagueLabel(name)).toBe(label);
  });

  it("drops a matching age prefix from team names", () => {
    expect(teamLabel("U13 Knights 2 White", "U13")).toBe("Knights 2 White");
    expect(teamLabel("Glenlake Hawks Junior C", "U21")).toBe("Glenlake Hawks Junior C");
  });

  it("formats calendar dates without shifting them", () => {
    expect(dateLabel("2026-10-31")).toBe("Sat Oct 31");
    expect(dateLabel("2027-01-01")).toBe("Fri Jan 1");
  });

  it("writes ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "101st",
      "111th",
    ]);
  });
});

describe("compareLeagues", () => {
  it("puts the latest phase first, then age, tier and region", () => {
    const leagues = [
      summary({ slug: "a", phase: "seeding", age: "U13", tier: 2, region: "south" }),
      summary({ slug: "b", phase: "seeding", age: "U9", tier: 1, region: "south" }),
      summary({ slug: "c", phase: "seeding", age: "U13", tier: 1, region: "south" }),
      summary({
        slug: "d",
        phase: "regular",
        age: "U21",
        kind: "junior",
        tier: null,
        region: null,
      }),
      summary({ slug: "e", phase: "seeding", age: "U13", tier: 1, region: "north" }),
      summary({
        slug: "f",
        phase: "seeding",
        age: "U13",
        kind: "flames",
        tier: null,
        region: null,
      }),
    ];
    expect(leagues.sort(compareLeagues).map((l) => l.slug)).toEqual(["d", "b", "e", "c", "a", "f"]);
  });

  it("groups in order", () => {
    expect(groupBy([1, 2, 3, 4, 5], (n) => n % 2)).toEqual([
      [1, [1, 3, 5]],
      [0, [2, 4]],
    ]);
  });
});
