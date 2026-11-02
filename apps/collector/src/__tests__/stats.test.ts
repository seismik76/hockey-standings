import { describe, expect, it } from "vitest";
import { mergeStatLines } from "../stats.js";

const line = (key: string, teamId: number, stats: Record<string, number>) => ({
  key,
  rosterKey: `r${key}`,
  teamId,
  stats,
});

// Player "a" wears 7 on their roster and goalie "g" has a blank number;
// "b" is not on the roster.
const roster = new Map<string, string | null>([
  ["ra", "7"],
  ["rg", null],
]);

describe("mergeStatLines", () => {
  it("joins the passes per player, with the number from the roster", () => {
    const rows = mergeStatLines(
      {
        played: [line("a", 1, { GP: 5, PIM: 2 }), line("b", 1, { GP: 4, PIM: 0 })],
        scorers: [line("a", 1, { PTS: 7, G: 3 })],
        goalies: [],
      },
      roster,
    );
    expect(rows).toEqual([
      // Assists are points less goals.
      { sourceTeamId: 1, gp: 5, g: 3, a: 4, pim: 2, jersey: "7", rostered: true, goalie: false },
      // Not on the roster: an affiliate, no number.
      { sourceTeamId: 1, gp: 4, g: 0, a: 0, pim: 0, jersey: null, rostered: false, goalie: false },
    ]);
  });

  it("makes goalie lines from the goalie passes, with games from the record if need be", () => {
    const [g] = mergeStatLines(
      {
        played: [],
        scorers: [],
        goalies: [
          line("g", 2, { W: 3, L: 1 }),
          line("g", 2, { T: 1, SO: 1 }),
          line("g", 2, { GA: 9 }),
        ],
      },
      roster,
    );
    expect(g).toEqual({
      sourceTeamId: 2,
      gp: 5,
      g: 0,
      a: 0,
      pim: 0,
      jersey: null,
      rostered: true,
      goalie: true,
      wins: 3,
      losses: 1,
      ties: 1,
      shutouts: 1,
      goalsAgainst: 9,
    });
  });

  it("leaves out players with nothing at all", () => {
    expect(
      mergeStatLines(
        {
          played: [line("x", 1, { GP: 0 })],
          scorers: [line("x", 1, { PTS: 0, G: 0 })],
          goalies: [],
        },
        roster,
      ),
    ).toEqual([]);
  });
});
