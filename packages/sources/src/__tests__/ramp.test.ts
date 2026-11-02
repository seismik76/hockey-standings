import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseTeamName } from "../communities.js";
import { parseHistoryLeague } from "../history.js";
import {
  RAMP_GAME_TYPES,
  RAMP_SEASONS,
  RampShapeError,
  parseRampStandings,
  rampStandingsRequest,
} from "../ramp.js";

const fixture = () =>
  JSON.parse(
    readFileSync(
      new URL("../../fixtures/ramp/standings-10604-8814-3300.json", import.meta.url),
      "utf8",
    ),
  ) as unknown;

describe("rampStandingsRequest", () => {
  it("asks for every division of a category at once", () => {
    expect(
      rampStandingsRequest({ season: RAMP_SEASONS["2024-25"], gameType: RAMP_GAME_TYPES.regular }),
    ).toEqual({
      method: "GET",
      url: "https://hockeycalgary.msa4.rampinteractive.com/api/leaguegame/getstandings3cached/3741/10604/8814/3300/0/0/0",
    });
  });
});

describe("parseRampStandings", () => {
  it("reads the captured 2024-25 table, the split Tier 4 South pools included", () => {
    const rows = parseRampStandings(fixture());
    expect(rows).toHaveLength(31);
    const byDivision = Map.groupBy(rows, (r) => r.division);
    expect(byDivision.get("U11 Tier 4 South Blue")).toHaveLength(8);
    expect(byDivision.get("U11 Tier 4 South Red")).toHaveLength(8);
    expect(rows.every((r) => r.gp === r.w + r.l + r.t)).toBe(true);
    expect(rows.find((r) => r.team === "SPRINGBANK ROCKIES U11 AA")).toEqual({
      division: "U11 AA",
      team: "SPRINGBANK ROCKIES U11 AA",
      gp: 18,
      w: 13,
      l: 2,
      t: 3,
      gf: 101,
      ga: 46,
    });
  });

  it("gives divisions the history parser and teams the community matcher understand", () => {
    const rows = parseRampStandings(fixture());
    expect(parseHistoryLeague("U11 Tier 4 South Blue")).toMatchObject({
      tier: 4,
      region: "south",
      pool: "BLUE",
    });
    expect(parseHistoryLeague("U11 AA")).toMatchObject({ tier: 0 });
    expect(parseHistoryLeague("U11 Female A")).toBeNull();
    const tiered = rows.filter((r) => parseHistoryLeague(r.division));
    expect(tiered.every((r) => parseTeamName(r.team).community)).toBe(true);
  });

  it("drops subheader rows and refuses a changed shape", () => {
    const sub = {
      SID: 0,
      DID: 1,
      DivName: "x",
      TeamName: "x",
      GamesPlayed: 0,
      Wins: 0,
      Losses: 0,
      Ties: 0,
      GF: 0,
      GA: 0,
    };
    expect(parseRampStandings([sub])).toEqual([]);
    expect(() => parseRampStandings([{ TeamName: "A" }])).toThrow(RampShapeError);
  });
});
