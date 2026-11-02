import { communityHistory } from "@hockey/core";
import { describe, expect, it } from "vitest";
import {
  bandFor,
  bandLabel,
  barPosition,
  birthYearRows,
  birthYears,
  coverKey,
  defaultBirthYear,
  depthStep,
  diffStep,
  goalDomain,
  goalPosition,
  historyPhase,
  perGame,
  pickPhase,
  seasonShort,
  shareStep,
  signed,
  skaterSort,
} from "./compare";

describe("pickPhase", () => {
  const seedingOnly = [
    { phase: "seeding" as const, teams: 480, finals: 850 },
    { phase: "regular" as const, teams: 0, finals: 0 },
  ];
  const regularStarted = [
    { phase: "seeding" as const, teams: 480, finals: 864 },
    { phase: "regular" as const, teams: 480, finals: 120 },
  ];

  it("shows seeding until the regular season has about two games a team", () => {
    expect(pickPhase(seedingOnly, undefined)).toEqual({ phase: "seeding", available: ["seeding"] });
    expect(pickPhase(regularStarted, undefined).phase).toBe("seeding");
    const ready = [regularStarted[0]!, { phase: "regular" as const, teams: 480, finals: 480 }];
    expect(pickPhase(ready, undefined).phase).toBe("regular");
  });

  it("honours a phase asked for by name only when it has games", () => {
    expect(pickPhase(regularStarted, "regular")).toEqual({
      phase: "regular",
      available: ["seeding", "regular"],
    });
    expect(pickPhase(seedingOnly, "regular").phase).toBe("seeding");
    expect(pickPhase(seedingOnly, "playoffs").phase).toBe("seeding");
  });
});

describe("shareStep", () => {
  it("bins symmetrically around even, on the printed percentage", () => {
    expect([0.1, 0.3, 0.399, 0.46, 0.465, 0.5, 0.534, 0.535, 0.6, 0.7, 0.706, 0.9].map(shareStep))
      // 0.399 prints 40, 0.465 prints 47 and 0.535 prints 54: each lands in the class its label names.
      .toEqual([-3, -2, -1, -1, 0, 0, 0, 1, 1, 2, 3, 3]);
  });
});

describe("perGame", () => {
  it("signs goal differential with a real minus", () => {
    expect(perGame(17, 10)).toBe("+1.7");
    expect(perGame(-4, 10)).toBe("−0.4");
    expect(perGame(0, 10)).toBe("0.0");
    expect(perGame(3, 0)).toBe("0.0");
  });
});

describe("barPosition", () => {
  it("maps 20%–80% onto the track and clamps outside it", () => {
    expect(barPosition(0.5)).toBeCloseTo(50);
    expect(barPosition(0.2)).toBe(0);
    expect(barPosition(0.05)).toBe(0);
    expect(barPosition(0.95)).toBe(100);
  });
});

describe("goal scale", () => {
  it("is symmetric, covers every range, and rounds up to the half goal", () => {
    expect(
      goalDomain([
        { diffLow: -2.6, diffHigh: -1.4 },
        { diffLow: 0.9, diffHigh: 2.1 },
      ]),
    ).toBe(3);
    expect(goalDomain([{ diffLow: -0.3, diffHigh: 0.2 }])).toBe(1);
    expect(goalDomain([])).toBe(1);
  });

  it("puts zero in the middle and clamps outside the domain", () => {
    expect(goalPosition(0, 2)).toBe(50);
    expect(goalPosition(1, 2)).toBe(75);
    expect(goalPosition(-5, 2)).toBe(0);
    expect([signed(1.5), signed(-1.5), signed(0)]).toEqual(["+1.5", "−1.5", "0"]);
  });
});

describe("diffStep", () => {
  it("bins symmetrically around zero, on the printed tenth", () => {
    const values = [-2.5, -2.0, -1.96, -1.0, -0.95, -0.3, -0.25, -0.2, 0, 0.25, 0.3, 0.95, 1.96];
    // Halves round away from zero, so ±0.25 print ±0.3 and −0.95 prints −1.0,
    // and each lands in the class its printed value names.
    expect(values.map(diffStep)).toEqual([-3, -3, -3, -2, -2, -1, -1, 0, 0, 1, 1, 2, 3]);
    expect(values.map((v) => perGame(v, 1))).toEqual(
      ["−2.5", "−2.0", "−2.0", "−1.0", "−1.0", "−0.3", "−0.3", "−0.2", "0.0"].concat([
        "+0.3",
        "+0.3",
        "+1.0",
        "+2.0",
      ]),
    );
  });
});

describe("past seasons", () => {
  it("reads the phase, defaulting to both", () => {
    expect([
      historyPhase("seeding"),
      historyPhase("regular"),
      historyPhase(undefined),
      historyPhase("x"),
    ]).toEqual(["seeding", "regular", "all", "all"]);
  });

  it("shortens season labels", () => {
    expect(seasonShort("2024-25")).toBe("24–25");
    expect(seasonShort("odd")).toBe("odd");
  });
});

describe("birth years", () => {
  it("puts a birth year in its band and year, by age on December 31", () => {
    // Born January 2016: U11 for 2025-26 and 2026-27.
    expect(bandFor(2016, "2025-26")).toEqual({ age: "U11", year: 1 });
    expect(bandFor(2016, "2026-27")).toEqual({ age: "U11", year: 2 });
    expect(bandFor(2016, "2027-28")).toEqual({ age: "U13", year: 1 });
    expect(bandFor(2019, "2026-27")).toEqual({ age: "U9", year: 1 });
    expect(bandFor(2009, "2026-27")).toEqual({ age: "U18", year: 3 });
    expect(bandFor(2008, "2026-27")).toBeNull();
    expect(bandLabel({ age: "U18", year: 3 })).toBe("U18 · 3rd yr");
  });

  it("lists the birth years the data covers, and picks the longest-followed, youngest first", () => {
    const seasons = ["2024-25", "2025-26", "2026-27"];
    // U11 to U18 every season, U9 only in 2026-27, as the real data has it.
    const covered = new Set(
      seasons.flatMap((s) => ["U11", "U13", "U15", "U18"].map((a) => coverKey(a, s))),
    );
    covered.add(coverKey("U9", "2026-27"));
    expect(birthYears(seasons, covered)).toEqual(
      Array.from({ length: 2019 - 2007 + 1 }, (_, i) => 2007 + i),
    );
    // 2016 was U9 in 2024-25, which has no U9, so it is seen twice; 2015 and
    // older (to 2009) three times. The youngest of those wins.
    expect(defaultBirthYear(seasons, covered)).toBe(2015);
    expect(defaultBirthYear(seasons, new Set(seasons.map((s) => coverKey("U13", s))))).toBe(2014);
    expect(defaultBirthYear([], covered)).toBeNull();
  });
});

describe("birthYearRows", () => {
  const totals = (season: string, community: string, age: string, w: number, l: number) => ({
    season,
    community,
    age,
    gp: w + l,
    w,
    l,
    t: 0,
    gf: w,
    ga: l,
  });

  it("follows one birth year through its bands, best overall first", () => {
    const history = communityHistory([
      // Born 2016: U11 in 2025-26 and 2026-27. U13 in 2026-27 is someone else.
      totals("2025-26", "a", "U11", 2, 8),
      totals("2026-27", "a", "U11", 8, 2),
      totals("2026-27", "a", "U13", 0, 10),
      totals("2025-26", "b", "U11", 7, 3),
      totals("2026-27", "c", "U13", 9, 1),
    ]);
    const rows = birthYearRows(history, ["2025-26", "2026-27"], 2016);
    expect(rows.map((r) => r.community)).toEqual(["b", "a"]);
    const a = rows.find((r) => r.community === "a")!;
    expect(a.cells.get("2025-26")!.share).toBe(0.2);
    expect(a.cells.get("2026-27")!.share).toBe(0.8);
    expect(a.all).toMatchObject({ gp: 20, w: 10, share: 0.5 });
  });
});

describe("depth", () => {
  it("colours a cell by its difference from the city, deeper always positive", () => {
    // 60% of skaters scored against a city 50%: 10 points deeper.
    expect(depthStep(0.6, 0.5, true)).toBe(2);
    expect(depthStep(0.48, 0.5, true)).toBe(0);
    expect(depthStep(0.3, 0.5, true)).toBe(-3);
    // Top two scoring 60% of goals against a city 50%: leaning more, so thinner.
    expect(depthStep(0.6, 0.5, false)).toBe(-2);
    expect(depthStep(0.45, 0.5, false)).toBe(1);
  });

  it("reads the leaderboard sort, points by default", () => {
    expect([skaterSort("g"), skaterSort("pim"), skaterSort(undefined), skaterSort("x")]).toEqual([
      "g",
      "pim",
      "pts",
      "pts",
    ]);
  });
});
