import { describe, expect, it } from "vitest";
import { mergeStatLines } from "../stats.js";

const line = (key: string, teamId: number, stats: Record<string, number>) => ({
  key,
  teamId,
  stats,
});

describe("mergeStatLines", () => {
  it("joins the passes per player: assists are points less goals", () => {
    const rows = mergeStatLines({
      played: [line("a", 1, { GP: 5, PIM: 2 }), line("b", 1, { GP: 4, PIM: 0 })],
      scorers: [line("a", 1, { PTS: 7, G: 3 })],
      goalies: [],
    });
    expect(rows).toEqual([
      { sourceTeamId: 1, gp: 5, g: 3, a: 4, pim: 2, goalie: false },
      { sourceTeamId: 1, gp: 4, g: 0, a: 0, pim: 0, goalie: false },
    ]);
  });

  it("makes goalie lines from the goalie passes, with games from the record if need be", () => {
    const [g] = mergeStatLines({
      played: [],
      scorers: [],
      goalies: [
        line("g", 2, { W: 3, L: 1 }),
        line("g", 2, { T: 1, SO: 1 }),
        line("g", 2, { GA: 9 }),
      ],
    });
    expect(g).toEqual({
      sourceTeamId: 2,
      gp: 5,
      g: 0,
      a: 0,
      pim: 0,
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
      mergeStatLines({
        played: [line("x", 1, { GP: 0 })],
        scorers: [line("x", 1, { PTS: 0, G: 0 })],
        goalies: [],
      }),
    ).toEqual([]);
  });
});
