import { z } from "zod";

/**
 * RAMP Interactive, where Hockey Calgary kept U11 standings for 2024-25 and
 * 2025-26 (hockeycalgary.msa4.rampinteractive.com). Read once, to fill past
 * seasons, with Pat's permission; see docs/SOURCES.md. Nothing reads it on a
 * schedule.
 *
 * The site's standings page loads its table from
 *   /api/leaguegame/getstandings3cached/{assoc}/{season}/{gameType}/{category}/{division}/0/0
 * and division 0 answers every division of the category at once, which is how
 * a past season's divisions are found: the site's pages only link the current
 * season's.
 */

export const RAMP_ORIGIN = "https://hockeycalgary.msa4.rampinteractive.com";
/** Hockey Calgary's association id on RAMP. */
export const RAMP_ASSOCIATION = 3741;
/** The U11 category: the only one RAMP has tiered leagues in. */
export const RAMP_U11 = 3300;
export const RAMP_GAME_TYPES = { seeding: 8361, regular: 8814 } as const;

/**
 * The seasons in RAMP's season list, captured 2026-11-01. 2023-24 (10603)
 * holds only a U11 development program, not the tiered leagues, so it is not
 * read.
 */
export const RAMP_SEASONS = { "2024-25": 10604, "2025-26": 12371 } as const;

export class RampShapeError extends Error {
  constructor(readonly issues: z.core.$ZodIssue[]) {
    super(`RAMP standings response changed shape: ${z.prettifyError(new z.ZodError(issues))}`);
    this.name = "RampShapeError";
  }
}

export function rampStandingsRequest({
  season,
  gameType,
  category = RAMP_U11,
}: {
  season: number;
  gameType: number;
  category?: number;
}): { method: "GET"; url: string } {
  return {
    method: "GET",
    url: `${RAMP_ORIGIN}/api/leaguegame/getstandings3cached/${RAMP_ASSOCIATION}/${season}/${gameType}/${category}/0/0/0`,
  };
}

const count = z.number().int().nonnegative();
const rowSchema = z.object({
  SID: z.number().int(),
  DID: z.number().int(),
  DivName: z.string().nullable(),
  TeamName: z.string().nullable(),
  GamesPlayed: count,
  Wins: count,
  Losses: count,
  Ties: count,
  GF: count,
  GA: count,
});

export interface RampStanding {
  /** "U11 Tier 4 South Blue". RAMP files seeding results under the team's final division. */
  division: string;
  team: string;
  gp: number;
  w: number;
  l: number;
  t: number;
  gf: number;
  ga: number;
}

/** A standings response as one line per team. Subheader rows (SID 0) are dropped. */
export function parseRampStandings(json: unknown): RampStanding[] {
  const result = z.array(rowSchema).safeParse(json);
  if (!result.success) throw new RampShapeError(result.error.issues);
  return result.data
    .filter((r) => r.SID !== 0 && r.DivName && r.TeamName)
    .map((r) => ({
      division: r.DivName!.trim(),
      team: r.TeamName!.trim(),
      gp: r.GamesPlayed,
      w: r.Wins,
      l: r.Losses,
      t: r.Ties,
      gf: r.GF,
      ga: r.GA,
    }));
}
