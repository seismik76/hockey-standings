import { describe, expect, it } from "vitest";
import {
  barPosition,
  diffStep,
  goalDomain,
  goalPosition,
  historyPhase,
  perGame,
  pickPhase,
  seasonShort,
  shareStep,
  signed,
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
