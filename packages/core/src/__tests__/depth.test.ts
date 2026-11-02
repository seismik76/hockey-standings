import { describe, expect, it } from "vitest";
import { type TeamScoringLine, covered, scoringDepth } from "../depth.js";

const team = (
  communitySlug: string | null,
  age: string,
  skaters: number,
  scorers: number,
  goals: number,
  topTwo: number,
  gameGoals = goals,
): TeamScoringLine => ({ communitySlug, age, skaters, scorers, goals, topTwo, gameGoals });

describe("scoringDepth", () => {
  it("rolls teams up by community and age, against the whole city", () => {
    const d = scoringDepth([
      team("a", "U11", 10, 8, 20, 8),
      team("a", "U13", 10, 4, 10, 8),
      team("b", "U11", 10, 2, 10, 9),
    ]);
    const a = d.byCommunity.get("a")!;
    expect(a.get("U11")).toMatchObject({ teams: 1, scorerShare: 0.8, topTwoShare: 0.4 });
    expect(a.get("all")).toMatchObject({ teams: 2, skaters: 20, scorers: 12, scorerShare: 0.6 });
    expect(d.city.get("U11")).toMatchObject({
      teams: 2,
      scorers: 10,
      scorerShare: 0.5,
      topTwoShare: 17 / 30,
    });
    expect(d.counted).toBe(3);
  });

  it("leaves out teams whose player lines do not account for their goals", () => {
    expect(covered({ goals: 8, gameGoals: 10 })).toBe(true);
    expect(covered({ goals: 7, gameGoals: 10 })).toBe(false);
    expect(covered({ goals: 13, gameGoals: 10 })).toBe(false);
    expect(covered({ goals: 0, gameGoals: 0 })).toBe(false);
    const d = scoringDepth([team("a", "U9", 10, 5, 5, 3), team("a", "U9", 10, 1, 1, 1, 9)]);
    expect(d).toMatchObject({ counted: 1, leftOut: 1 });
    expect(d.byCommunity.get("a")!.get("U9")!.teams).toBe(1);
  });

  it("counts visiting clubs in the city yardstick but gives them no row", () => {
    const d = scoringDepth([team(null, "U15", 10, 5, 10, 4), team("a", "U15", 10, 5, 10, 4)]);
    expect([...d.byCommunity.keys()]).toEqual(["a"]);
    expect(d.city.get("U15")!.teams).toBe(2);
  });
});
