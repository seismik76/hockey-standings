/**
 * The old hockey-calgary-scraper database (2021-22 to 2025-26), read once to
 * import past seasons. It holds season totals per team, scraped from three
 * places as Hockey Calgary moved its leagues: its own standings pages
 * (U13 to U18), RAMP (U11 from 2024-25) and TeamLinkt (U13 in 2025-26).
 *
 * Its quirks, found by reading it (docs/SOURCES.md has the numbers):
 *   - "Playoff" rows are exact copies of "Regular" ones; real playoffs were the
 *     City Championships, a tournament. They are not imported.
 *   - A league existed in one phase only, but the scraper asked for both, and
 *     Hockey Calgary answered the other with the same table. resolvePhases()
 *     keeps one copy, in the phase its games-played fits.
 */
import { COMMUNITIES } from "./communities.js";
import { type Region, classifyDivision } from "./teamlinkt.js";

export interface HistoryLeague {
  /** "U15 TIER 2 NBC BLUE", in TeamLinkt's style. */
  name: string;
  /** "u15-tier-2-nbc-blue". */
  slug: string;
  age: string;
  /** 0 for U11 and U13 AA, then Tier 1 down. */
  tier: number;
  region: Region | null;
  /** A split pool's colour within its tier ("BLUE"), or null. */
  pool: string | null;
}

const POOL_COLOURS = /^(.*) (BLUE|RED|BLACK|WHITE|GOLD|GREEN|GREY|ORANGE)$/;

/**
 * An old league name as one of the comparison's leagues, or null when it is
 * not one (U15 to U18 AA, which are zone teams, not associations).
 *   "U15 Tier 2 NBC Blue - Seeding"     → U15, Tier 2, nbc, BLUE
 *   "U13 / U13 TIER 1 NORTH - Seeding"  → U13, Tier 1, north
 *   "U11 AA - League"                   → U11, AA (tier 0)
 */
export function parseHistoryLeague(oldName: string): HistoryLeague | null {
  const name = oldName
    .replace(/^U\d+\s*\/\s*/i, "")
    .replace(/\s+-\s+(Seeding|League)$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  const slug = name.toLowerCase().replace(/ /g, "-");

  const aa = /^(U11|U13) AA$/.exec(name);
  if (aa) return { name, slug, age: aa[1]!, tier: 0, region: null, pool: null };

  const split = POOL_COLOURS.exec(name);
  const base = split ? split[1]! : name;
  const c = classifyDivision(base);
  if (c.kind !== "tier" || c.age === null || c.tier === null) return null;
  return { name, slug, age: c.age, tier: c.tier, region: c.region, pool: split ? split[2]! : null };
}

/** The old database's community name ("North West") as a slug ("northwest"), or null. */
export function historyCommunity(oldName: string | null): string | null {
  if (!oldName) return null;
  const key = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  return COMMUNITIES.find((c) => key(c.slug) === key(oldName))?.slug ?? null;
}

export interface HistoryRow {
  season: string;
  /** The old scraper's league type. */
  type: "Seeding" | "Regular";
  slug: string;
  team: string;
  gp: number;
  w: number;
  l: number;
  t: number;
  gf: number;
  ga: number;
}

/**
 * Seeding was about 8 games a team (RAMP's U11, 5 or 6); regular seasons 12
 * to 18. A league reported in both phases with identical tables is put in the
 * phase its average games-played falls in.
 */
export const SEEDING_MAX_GP = 10;

/**
 * Each row with the phase it belongs to. Where one league (season and slug)
 * appears as both Seeding and Regular and every team's line is identical, it
 * is one table reported twice: one copy is kept. Otherwise both phases stand.
 */
export function resolvePhases<R extends HistoryRow>(
  rows: readonly R[],
): (R & { phase: "seeding" | "regular" })[] {
  const line = (r: R) => [r.team, r.gp, r.w, r.l, r.t, r.gf, r.ga].join("|");
  const groups = new Map<string, R[]>();
  for (const r of rows) {
    const key = `${r.season}|${r.slug}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const out: (R & { phase: "seeding" | "regular" })[] = [];
  for (const group of groups.values()) {
    const seeding = group.filter((r) => r.type === "Seeding");
    const regular = group.filter((r) => r.type === "Regular");
    const a = seeding.map(line).sort();
    const b = regular.map(line).sort();
    const copies = a.length > 0 && a.length === b.length && a.every((x, i) => x === b[i]);
    if (copies) {
      const avg = regular.reduce((s, r) => s + r.gp, 0) / regular.length;
      const phase: "seeding" | "regular" = avg <= SEEDING_MAX_GP ? "seeding" : "regular";
      out.push(...regular.map((r) => ({ ...r, phase })));
    } else {
      out.push(
        ...seeding.map((r) => ({ ...r, phase: "seeding" as const })),
        ...regular.map((r) => ({ ...r, phase: "regular" as const })),
      );
    }
  }
  return out;
}
