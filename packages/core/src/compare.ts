/**
 * Community against community, from tiered league games.
 *
 * Every tier pool is zero-sum: its teams share exactly half the points on
 * offer. So a community's points share across all its tiered games says how
 * its teams do against peers placed at the same level, and an even record is
 * 50% wherever its teams were placed. Placement is a separate question
 * (placements(), below): seeding spreads each community's teams across the
 * tiers by design, and the regular season's tiers come out of seeding.
 *
 * A game between two teams of the same community counts for both sides, a win
 * and a loss, which pulls that community toward 50% as it should.
 */

export interface TierGame {
  age: string;
  tier: number;
  homeCommunity: string | null;
  awayCommunity: string | null;
  homeScore: number;
  awayScore: number;
}

export interface ShareRecord {
  gp: number;
  w: number;
  l: number;
  t: number;
  gf: number;
  ga: number;
  /** Points won over points on offer, 0 to 1. */
  share: number;
  /**
   * A 90% range for `share`, treating each game as one draw. Games of the same
   * team are not independent, so read it as a guide to how much a share could
   * move by chance, not as a test.
   */
  low: number;
  high: number;
}

export interface CommunityComparison {
  community: string;
  all: ShareRecord;
  byAge: Map<string, ShareRecord>;
}

interface Tally {
  gp: number;
  w: number;
  l: number;
  t: number;
  gf: number;
  ga: number;
}

const Z90 = 1.645;

function empty(): Tally {
  return { gp: 0, w: 0, l: 0, t: 0, gf: 0, ga: 0 };
}

function add(tally: Tally, gf: number, ga: number): void {
  tally.gp += 1;
  tally.gf += gf;
  tally.ga += ga;
  if (gf > ga) tally.w += 1;
  else if (gf < ga) tally.l += 1;
  else tally.t += 1;
}

function toRecord({ gp, w, l, t, gf, ga }: Tally): ShareRecord {
  if (gp === 0) return { gp, w, l, t, gf, ga, share: 0.5, low: 0, high: 1 };
  const share = (w + t / 2) / gp;
  // Per-game outcomes are 1, 0.5 or 0; their sample variance.
  const meanSquare = (w + t / 4) / gp;
  const variance = gp > 1 ? ((meanSquare - share * share) * gp) / (gp - 1) : 0.25;
  const margin = Z90 * Math.sqrt(variance / gp);
  return {
    gp,
    w,
    l,
    t,
    gf,
    ga,
    share,
    low: Math.max(0, share - margin),
    high: Math.min(1, share + margin),
  };
}

/** One entry per community with games, best share first (then name). */
export function compareCommunities(games: readonly TierGame[]): CommunityComparison[] {
  const all = new Map<string, Tally>();
  const byAge = new Map<string, Map<string, Tally>>();
  const side = (community: string | null, age: string, gf: number, ga: number) => {
    // Visiting clubs and unmatched teams have no community; their games still
    // count for the opponent.
    if (!community) return;
    if (!all.has(community)) all.set(community, empty());
    add(all.get(community)!, gf, ga);
    const ages = byAge.get(community) ?? new Map<string, Tally>();
    byAge.set(community, ages);
    if (!ages.has(age)) ages.set(age, empty());
    add(ages.get(age)!, gf, ga);
  };
  for (const g of games) {
    side(g.homeCommunity, g.age, g.homeScore, g.awayScore);
    side(g.awayCommunity, g.age, g.awayScore, g.homeScore);
  }
  return [...all]
    .map(([community, tally]) => ({
      community,
      all: toRecord(tally),
      byAge: new Map([...byAge.get(community)!].map(([age, t]) => [age, toRecord(t)])),
    }))
    .sort((a, b) => b.all.share - a.all.share || a.community.localeCompare(b.community));
}

export interface Placement {
  community: string;
  age: string;
  tier: number;
  teams: number;
}

/**
 * Each community's teams by tier, as shares of its tiered teams: index 0 is
 * Tier 1. Ages with fewer tiers (U15 and U18 stop at 4) simply never fill the
 * last slot.
 */
export function tierShares(
  placements: readonly Placement[],
  tiers: number,
): Map<string, { teams: number; shares: number[] }> {
  const counts = new Map<string, number[]>();
  for (const p of placements) {
    if (p.tier < 1 || p.tier > tiers) continue;
    const row = counts.get(p.community) ?? new Array<number>(tiers).fill(0);
    row[p.tier - 1]! += p.teams;
    counts.set(p.community, row);
  }
  return new Map(
    [...counts].map(([community, row]) => {
      const teams = row.reduce((a, b) => a + b, 0);
      return [community, { teams, shares: row.map((n) => n / teams) }];
    }),
  );
}

/** "U9" < "U11" < "U18": by the number, not the string. */
export function compareAges(a: string, b: string): number {
  const n = (s: string) => Number(/\d+/.exec(s)?.[0] ?? Infinity);
  return n(a) - n(b) || a.localeCompare(b);
}
