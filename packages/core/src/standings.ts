/**
 * Standings computed from games, never scraped: every number traces back to
 * the games behind it, whichever source they came from.
 */

export interface GameResult {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
}

export interface StandingRow {
  team: string;
  gp: number;
  w: number;
  l: number;
  t: number;
  pts: number;
  gf: number;
  ga: number;
  diff: number;
}

// Community hockey plays to a tie: no overtime, so no OT-loss point.
const POINTS = { win: 2, tie: 1, loss: 0 } as const;

/**
 * One row per team, ranked. `teams` adds rows for teams with no games yet,
 * so a league page lists everyone from the first day.
 *
 * Ranking: points, then wins, then goal differential, then goals-for share,
 * then name. That reproduces TeamLinkt's order for the captured seeding
 * table; Hockey Calgary's official tie-breaks (head-to-head and so on) are
 * not confirmed and may rank tied teams differently.
 */
export function computeStandings(
  games: readonly GameResult[],
  teams: readonly string[] = [],
): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  const row = (team: string) => {
    let r = rows.get(team);
    if (!r) {
      r = { team, gp: 0, w: 0, l: 0, t: 0, pts: 0, gf: 0, ga: 0, diff: 0 };
      rows.set(team, r);
    }
    return r;
  };
  for (const team of teams) row(team);

  for (const g of games) {
    tally(row(g.homeTeam), g.homeScore, g.awayScore);
    tally(row(g.awayTeam), g.awayScore, g.homeScore);
  }

  return [...rows.values()].sort(
    (a, b) =>
      b.pts - a.pts ||
      b.w - a.w ||
      b.diff - a.diff ||
      goalsForShare(b) - goalsForShare(a) ||
      a.team.localeCompare(b.team),
  );
}

function tally(r: StandingRow, own: number, other: number): void {
  r.gp++;
  r.gf += own;
  r.ga += other;
  r.diff = r.gf - r.ga;
  if (own > other) {
    r.w++;
    r.pts += POINTS.win;
  } else if (own < other) {
    r.l++;
    r.pts += POINTS.loss;
  } else {
    r.t++;
    r.pts += POINTS.tie;
  }
}

function goalsForShare(r: StandingRow): number {
  const total = r.gf + r.ga;
  return total === 0 ? 0 : r.gf / total;
}
