import { readFileSync } from "node:fs";
import { parseScores, parseStandings } from "@hockey/sources";
import { describe, expect, it } from "vitest";
import { computeStandings } from "../standings.js";

function teamlinkt(name: string): unknown {
  const url = new URL(`../../../sources/fixtures/teamlinkt/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8"));
}

describe("computeStandings", () => {
  it("scores 2 for a win, 1 for a tie, and tallies goals", () => {
    const table = computeStandings([
      { homeTeam: "A", awayTeam: "B", homeScore: 3, awayScore: 1 },
      { homeTeam: "B", awayTeam: "C", homeScore: 2, awayScore: 2 },
    ]);
    expect(table).toEqual([
      { team: "A", gp: 1, w: 1, l: 0, t: 0, pts: 2, gf: 3, ga: 1, diff: 2 },
      { team: "C", gp: 1, w: 0, l: 0, t: 1, pts: 1, gf: 2, ga: 2, diff: 0 },
      { team: "B", gp: 2, w: 0, l: 1, t: 1, pts: 1, gf: 3, ga: 5, diff: -2 },
    ]);
  });

  it("lists teams with no games yet", () => {
    const table = computeStandings(
      [{ homeTeam: "A", awayTeam: "B", homeScore: 1, awayScore: 1 }],
      ["A", "B", "Z"],
    );
    expect(table.map((r) => [r.team, r.gp, r.pts])).toEqual([
      ["A", 1, 1],
      ["B", 1, 1],
      ["Z", 0, 0],
    ]);
  });

  it("ranks points, then wins, then goal differential", () => {
    const rank = (games: Parameters<typeof computeStandings>[0], team: string) =>
      computeStandings(games).findIndex((r) => r.team === team);
    const vs = (homeTeam: string, awayTeam: string, homeScore: number, awayScore: number) => ({
      homeTeam,
      awayTeam,
      homeScore,
      awayScore,
    });

    // A and B both on 2 points: A from a win and a loss, B from two ties.
    const onWins = [vs("A", "P", 1, 0), vs("A", "Q", 0, 3), vs("B", "R", 0, 0), vs("B", "S", 0, 0)];
    expect(rank(onWins, "A")).toBeLessThan(rank(onWins, "B"));

    // C and D both one win: C by more.
    const onDiff = [vs("C", "P", 5, 0), vs("D", "Q", 1, 0)];
    expect(rank(onDiff, "C")).toBeLessThan(rank(onDiff, "D"));
  });

  it("reproduces TeamLinkt's table for U13 Tier 2 South seeding, in order", () => {
    const { games } = parseScores(teamlinkt("scores-61563-332824.json"));
    const theirs = parseStandings(teamlinkt("standings-61563-332824.json"));

    const ours = computeStandings(
      games.map((g) => ({
        homeTeam: g.home.name,
        awayTeam: g.away.name,
        homeScore: g.homeScore!,
        awayScore: g.awayScore!,
      })),
      theirs.map((s) => s.team.name),
    );

    expect(
      ours.map(({ team, gp, w, l, t, pts, gf, ga }) => ({ team, gp, w, l, t, pts, gf, ga })),
    ).toEqual(
      theirs.map(({ team, gp, w, l, t, pts, gf, ga }) => ({
        team: team.name,
        gp,
        w,
        l,
        t,
        pts,
        gf,
        ga,
      })),
    );
  });
});
