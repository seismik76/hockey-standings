import { describe, expect, it } from "vitest";
import { type TierGame, compareAges, compareCommunities, tierShares } from "../compare.js";

const game = (
  homeCommunity: string | null,
  awayCommunity: string | null,
  homeScore: number,
  awayScore: number,
  age = "U11",
): TierGame => ({ age, tier: 2, homeCommunity, awayCommunity, homeScore, awayScore });

describe("compareCommunities", () => {
  it("tallies both sides, best share first", () => {
    const [a, b] = compareCommunities([game("a", "b", 3, 1), game("b", "a", 2, 2)]);
    expect(a!.community).toBe("a");
    expect(a!.all).toMatchObject({ gp: 2, w: 1, l: 0, t: 1, gf: 5, ga: 3, share: 0.75 });
    expect(b!.all).toMatchObject({ gp: 2, w: 0, l: 1, t: 1, gf: 3, ga: 5, share: 0.25 });
  });

  it("splits by age", () => {
    const [a] = compareCommunities([game("a", "b", 1, 0, "U9"), game("a", "b", 0, 1, "U13")]);
    expect(a!.byAge.get("U9")!.share).toBe(1);
    expect(a!.byAge.get("U13")!.share).toBe(0);
    expect(a!.all.share).toBe(0.5);
  });

  it("counts a game within one community as a win and a loss for it", () => {
    const [a] = compareCommunities([game("a", "a", 4, 2)]);
    expect(a!.all).toMatchObject({ gp: 2, w: 1, l: 1, share: 0.5 });
  });

  it("skips sides with no community but keeps the game for the other", () => {
    const rows = compareCommunities([game(null, "b", 1, 2)]);
    expect(rows.map((r) => r.community)).toEqual(["b"]);
    expect(rows[0]!.all.w).toBe(1);
  });

  it("gives a range that narrows with more games and stays within 0 and 1", () => {
    const few = compareCommunities([game("a", "b", 1, 0), game("a", "b", 0, 1)])[1]!.all;
    const many = compareCommunities(
      Array.from({ length: 100 }, (_, i) => game("a", "b", i % 2, (i + 1) % 2)),
    )[1]!.all;
    expect(many.high - many.low).toBeLessThan(few.high - few.low);
    expect(many.low).toBeGreaterThan(0.4);
    expect(many.high).toBeLessThan(0.6);
    const perfect = compareCommunities([game("a", "b", 1, 0), game("a", "b", 1, 0)])[0]!.all;
    expect(perfect.high).toBe(1);
  });
});

describe("tierShares", () => {
  it("turns team counts into shares by tier", () => {
    const shares = tierShares(
      [
        { community: "a", age: "U9", tier: 1, teams: 1 },
        { community: "a", age: "U11", tier: 1, teams: 1 },
        { community: "a", age: "U11", tier: 4, teams: 2 },
        { community: "a", age: "U11", tier: 9, teams: 5 },
      ],
      5,
    );
    expect(shares.get("a")).toEqual({ teams: 4, shares: [0.5, 0, 0, 0.5, 0] });
  });
});

describe("compareAges", () => {
  it("orders by the number", () => {
    expect(["U18", "U9", "U13", "U11"].sort(compareAges)).toEqual(["U9", "U11", "U13", "U18"]);
  });
});
