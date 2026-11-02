/**
 * Scoring depth, to test the thin-talent idea: if a community's teams are
 * short of good players, fewer of their skaters score and more of their goals
 * come from one or two players. From anonymous player lines rolled up per team.
 *
 * Gamesheets are not always complete: a game's score is entered but not its
 * scorers. A team counts only if its players' goals come to between 80% and
 * 125% of its goals in final games, so a missing gamesheet is never read as a
 * thin roster.
 */

export interface TeamScoringLine {
  communitySlug: string | null;
  age: string;
  /** Skaters (not goalies) with a game played. */
  skaters: number;
  /** Of them, how many have a goal. */
  scorers: number;
  /** Goals on the team's player lines. */
  goals: number;
  /** Goals of its two top scorers. */
  topTwo: number;
  /** Goals in its final games, from the scores. */
  gameGoals: number;
}

export interface Depth {
  teams: number;
  skaters: number;
  scorers: number;
  goals: number;
  topTwo: number;
  /** Share of skaters with a goal, 0 to 1: higher is deeper. */
  scorerShare: number;
  /** Share of goals from each team's top two scorers, 0 to 1: higher leans on fewer players. */
  topTwoShare: number;
}

export const COVERAGE_MIN = 0.8;
export const COVERAGE_MAX = 1.25;

/** Whether a team's player lines account for its goals well enough to count. */
export function covered(t: Pick<TeamScoringLine, "goals" | "gameGoals">): boolean {
  if (t.gameGoals === 0) return false;
  const c = t.goals / t.gameGoals;
  return c >= COVERAGE_MIN && c <= COVERAGE_MAX;
}

function roll(teams: readonly TeamScoringLine[]): Depth {
  const sum = (k: "skaters" | "scorers" | "goals" | "topTwo") =>
    teams.reduce((n, t) => n + t[k], 0);
  const skaters = sum("skaters");
  const goals = sum("goals");
  return {
    teams: teams.length,
    skaters,
    scorers: sum("scorers"),
    goals,
    topTwo: sum("topTwo"),
    scorerShare: skaters > 0 ? sum("scorers") / skaters : 0,
    topTwoShare: goals > 0 ? sum("topTwo") / goals : 0,
  };
}

export interface DepthTable {
  /** Community, then age, then "all". */
  byCommunity: Map<string, Map<string, Depth>>;
  /** Every community together, by age, then "all": the yardstick for each cell. */
  city: Map<string, Depth>;
  /** Teams counted and left out for incomplete gamesheets. */
  counted: number;
  leftOut: number;
}

export function scoringDepth(teams: readonly TeamScoringLine[]): DepthTable {
  const kept = teams.filter(covered);
  const group = <K>(list: readonly TeamScoringLine[], key: (t: TeamScoringLine) => K) => {
    const m = new Map<K, TeamScoringLine[]>();
    for (const t of list) m.set(key(t), [...(m.get(key(t)) ?? []), t]);
    return m;
  };
  const byAge = (list: readonly TeamScoringLine[]) => {
    const m = new Map<string, Depth>([...group(list, (t) => t.age)].map(([a, l]) => [a, roll(l)]));
    m.set("all", roll(list));
    return m;
  };
  const withCommunity = kept.filter((t) => t.communitySlug !== null);
  return {
    byCommunity: new Map(
      [...group(withCommunity, (t) => t.communitySlug!)].map(([c, l]) => [c, byAge(l)]),
    ),
    city: byAge(kept),
    counted: kept.length,
    leftOut: teams.length - kept.length,
  };
}
