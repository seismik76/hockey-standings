import { compareAges, scoringDepth } from "@hockey/core";
import {
  goalieLeaders,
  leaguePlayerLines,
  listCommunities,
  skaterLeaders,
  statsLeagues,
  teamScoring,
} from "@hockey/db";
import type { Metadata } from "next";
import Link from "next/link";
import { DepthHeatmap, GoalieTable, SkaterTable } from "@/app/_components/stats";
import { type ComparePhase, type SkaterSortKey, percent, skaterSort } from "@/lib/compare";
import { getDb, seasonOrNull } from "@/lib/data";
import { leagueLabel, phaseLabel, teamLabel } from "@/lib/view";

// Stats change with every collector run, and the filters are in the URL.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Player stats" };

type Props = {
  searchParams: Promise<{
    phase?: string;
    age?: string;
    sort?: string;
    league?: string;
    team?: string;
  }>;
};

const SORTS: { key: SkaterSortKey; label: string }[] = [
  { key: "pts", label: "Points" },
  { key: "g", label: "Goals" },
  { key: "a", label: "Assists" },
  { key: "pim", label: "PIM" },
];

/** Goalies need this many games to be ranked. */
const GOALIE_MIN_GAMES = 3;

export default async function Stats({ searchParams }: Props) {
  const params = await searchParams;
  const season = await seasonOrNull();
  if (!season) return <p className="mt-6">No data yet: the collector has not run.</p>;
  const db = getDb();

  const [seedingLeagues, regularLeagues] = await Promise.all([
    statsLeagues(db, season, "seeding"),
    statsLeagues(db, season, "regular"),
  ]);
  const has = { seeding: seedingLeagues.length > 0, regular: regularLeagues.length > 0 };
  // The regular season once it has stats, seeding before; either if asked.
  const phase: ComparePhase =
    params.phase === "seeding" && has.seeding
      ? "seeding"
      : params.phase === "regular" && has.regular
        ? "regular"
        : has.regular
          ? "regular"
          : "seeding";
  const leagues = phase === "seeding" ? seedingLeagues : regularLeagues;
  const ages = [...new Set(leagues.map((l) => l.age).filter((a): a is string => a !== null))].sort(
    compareAges,
  );
  const age = params.age && ages.includes(params.age) ? params.age : undefined;
  const sort = skaterSort(params.sort);
  const leagueSlug =
    params.league && leagues.some((l) => l.slug === params.league) ? params.league : undefined;

  const [scoring, communities, skaters, goalies, leagueLines] = await Promise.all([
    teamScoring(db, season, phase),
    listCommunities(db, season),
    skaterLeaders(db, season, phase, { age, sort, limit: 25 }),
    goalieLeaders(db, season, phase, { age, minGames: GOALIE_MIN_GAMES, limit: 10 }),
    leagueSlug ? leaguePlayerLines(db, season, phase, leagueSlug) : Promise.resolve([]),
  ]);
  const depth = scoringDepth(scoring);
  // The chosen league's teams, and the one picked, if any.
  const leagueTeams = [...new Map(leagueLines.map((l) => [l.teamId, l.team])).entries()].sort(
    (a, b) => a[1].localeCompare(b[1]),
  );
  const askedTeam = Number(params.team);
  const teamId = leagueTeams.some(([id]) => id === askedTeam) ? askedTeam : undefined;
  const shown = teamId === undefined ? leagueLines : leagueLines.filter((l) => l.teamId === teamId);
  const names = new Map(communities.map((c) => [c.slug, c.name]));
  // Deepest overall first.
  const rows = [...depth.byCommunity.keys()].sort(
    (a, b) =>
      (depth.byCommunity.get(b)!.get("all")!.scorerShare ?? 0) -
        (depth.byCommunity.get(a)!.get("all")!.scorerShare ?? 0) || a.localeCompare(b),
  );
  const depthAges = ages.filter((a) => depth.city.has(a));
  // How complete the gamesheets are: goals on player lines against goals in games.
  const completeness = ages.flatMap((a) => {
    const at = scoring.filter((t) => t.age === a);
    const game = at.reduce((n, t) => n + t.gameGoals, 0);
    return game > 0 ? [{ age: a, share: at.reduce((n, t) => n + t.goals, 0) / game }] : [];
  });

  const href = (
    change: Partial<Record<"phase" | "age" | "sort" | "league" | "team", string | undefined>>,
  ) => {
    // A new league, age or phase starts with all its teams.
    const keepTeam = !("league" in change || "age" in change || "phase" in change);
    const next = {
      phase,
      age,
      sort: sort === "pts" ? undefined : sort,
      league: leagueSlug,
      team: keepTeam && teamId !== undefined ? String(teamId) : undefined,
      ...change,
    };
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/stats?${s}` : "/stats";
  };
  const ageLeagues = leagues
    .filter((l) => !age || l.age === age)
    .sort((a, b) => compareAges(a.age ?? "", b.age ?? "") || a.name.localeCompare(b.name));
  const chosen = leagues.find((l) => l.slug === leagueSlug);

  return (
    <>
      <h1 className="mt-4 text-2xl font-semibold">Player stats</h1>
      <p className="muted mt-1">
        {season} {phaseLabel(phase).toLowerCase()}, from TeamLinkt&apos;s gamesheets. No names: each
        line is a player on a team, shown with a rank, the team and the jersey number on the team's
        roster (AP: an affiliate player called up from another team).
      </p>

      <nav className="phase-tabs mt-4 flex flex-wrap gap-2" aria-label="Phase">
        {(["seeding", "regular"] as const).map((p) =>
          has[p] ? (
            <Link
              key={p}
              href={href({ phase: p, league: undefined })}
              aria-current={p === phase ? "page" : undefined}
            >
              {phaseLabel(p)}
            </Link>
          ) : (
            <span key={p}>{phaseLabel(p)}: no stats yet</span>
          ),
        )}
      </nav>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Scoring depth</h2>
        <p className="muted mt-1 text-sm">
          A test of the thin-talent idea: if a community is short of good players, fewer of its
          skaters score and more of its goals come from one or two players. Tiered leagues and AA.
          Counted: {depth.counted} teams whose players&apos; goals account for their goals in games;
          left out: {depth.leftOut} with incomplete gamesheets (U9 gamesheets rarely name scorers).
          Teams with no player lines on TeamLinkt at all do not appear.
        </p>
        <DepthHeatmap table={depth} rows={rows} ages={depthAges} names={names} metric="scorers" />
        <DepthHeatmap table={depth} rows={rows} ages={depthAges} names={names} metric="topTwo" />
      </section>

      <section className="mt-10" id="leaders">
        <h2 className="text-lg font-semibold">Leaders</h2>
        <nav className="mt-3 flex flex-wrap gap-1.5" aria-label="Age">
          <Link
            href={href({ age: undefined, league: undefined })}
            aria-current={!age ? "page" : undefined}
            className="year-chip"
          >
            All ages
          </Link>
          {ages.map((a) => (
            <Link
              key={a}
              href={href({ age: a, league: undefined })}
              aria-current={a === age ? "page" : undefined}
              className="year-chip"
            >
              {a}
            </Link>
          ))}
        </nav>
        <nav className="mt-2 flex flex-wrap gap-1.5" aria-label="Sort skaters by">
          {SORTS.map((s) => (
            <Link
              key={s.key}
              href={href({ sort: s.key === "pts" ? undefined : s.key })}
              aria-current={s.key === sort ? "page" : undefined}
              className="year-chip"
            >
              {s.label}
            </Link>
          ))}
        </nav>
        <p className="muted mt-3 text-xs">
          How complete the gamesheets are (goals on player lines, of goals in games):{" "}
          {completeness.map((c) => `${c.age} ${percent(c.share)}`).join(" · ")}. Where scorers are
          missing, players' totals are short.
        </p>
        <h3 className="mt-5 font-semibold">
          Top skaters{age ? `, ${age}` : ""} by{" "}
          {SORTS.find((s) => s.key === sort)!.label.toLowerCase()}
        </h3>
        <SkaterTable lines={skaters} showAge={!age} />
        <h3 className="mt-6 font-semibold">
          Top goalies{age ? `, ${age}` : ""} by goals against a game
        </h3>
        <p className="muted text-xs">
          At least {GOALIE_MIN_GAMES} games, with goals against entered. Saves, wins and losses are
          rarely entered, so there is no save percentage or record.
        </p>
        <GoalieTable lines={goalies} showAge={!age} />
      </section>

      <section className="mt-10" id="league">
        <h2 className="text-lg font-semibold">Every player in a league</h2>
        <p className="muted mt-1 text-sm">
          Pick a league{age ? ` (${age})` : ""} for all its player lines, then a team to see just
          its players.
        </p>
        <nav className="mt-3 flex flex-wrap gap-1.5" aria-label="League">
          {ageLeagues.map((l) => (
            <Link
              key={l.slug}
              href={`${href({ league: l.slug })}#league`}
              aria-current={l.slug === leagueSlug ? "page" : undefined}
              className="year-chip"
            >
              {leagueLabel(l.name)}
            </Link>
          ))}
        </nav>
        {chosen && (
          <>
            <nav className="mt-3 flex flex-wrap gap-1.5" aria-label="Team">
              <Link
                href={`${href({ team: undefined })}#league`}
                aria-current={teamId === undefined ? "page" : undefined}
                className="year-chip"
              >
                All teams
              </Link>
              {leagueTeams.map(([id, name]) => (
                <Link
                  key={id}
                  href={`${href({ team: String(id) })}#league`}
                  aria-current={id === teamId ? "page" : undefined}
                  className="year-chip"
                >
                  {teamLabel(name, chosen.age)}
                </Link>
              ))}
            </nav>
            <h3 className="mt-5 font-semibold">
              {teamId === undefined
                ? leagueLabel(chosen.name)
                : teamLabel(leagueTeams.find(([id]) => id === teamId)![1], chosen.age)}
              : {shown.length} players
            </h3>
            <SkaterTable
              lines={shown.filter((l) => !l.goalie)}
              showAge={false}
              showTeam={teamId === undefined}
            />
            <GoalieTable
              lines={shown.filter((l) => l.goalie)}
              showAge={false}
              showTeam={teamId === undefined}
            />
          </>
        )}
      </section>

      <p className="muted mt-8 text-xs">
        Player lines come from TeamLinkt&apos;s gamesheets and are refreshed with each collector run
        while a phase is on. A gamesheet with a score but no scorers leaves goals off the player
        lines; the depth charts leave such teams out.
      </p>
    </>
  );
}
