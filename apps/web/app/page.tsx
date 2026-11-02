import { compareAges, compareCommunities, tierShares } from "@hockey/core";
import { listCommunities, tierCoverage, tierGames, tierPlacements } from "@hockey/db";
import Link from "next/link";
import { AgeHeatmap, GoalBars, ShareBars, TierPlacement } from "@/app/_components/compare";
import { type ComparePhase, pickPhase } from "@/lib/compare";
import { getDb, seasonOrNull } from "@/lib/data";
import { phaseLabel } from "@/lib/view";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ phase?: string }> };

export default async function Home({ searchParams }: Props) {
  const season = await seasonOrNull();
  if (!season) return <p className="mt-6">No data yet: the collector has not run.</p>;
  const db = getDb();
  const [coverage, communities] = await Promise.all([
    tierCoverage(db, season),
    listCommunities(db, season),
  ]);
  const { phase, available } = pickPhase(coverage, (await searchParams).phase);
  const [games, placements] = await Promise.all([
    tierGames(db, season, phase),
    phase === "regular" ? tierPlacements(db, season, phase) : Promise.resolve([]),
  ]);

  const names = new Map(communities.map((c) => [c.slug, c.name]));
  const rows = compareCommunities(games);
  // Goal differential can rank communities differently from points, when one
  // wins close games and another wins big; its charts get their own order.
  const byDiff = [...rows].sort((a, b) => b.all.diff - a.all.diff);
  const ages = [...new Set(games.map((g) => g.age))].sort(compareAges);
  // The levels present, AA (0) first, then Tier 1 down.
  const levels = [...new Set(placements.map((p) => p.tier))].sort((a, b) => a - b);
  // Most teams at the top first: by average level, lowest first.
  const placed = [...tierShares(placements, levels)]
    .map(([community, s]) => ({ community, ...s }))
    .sort((a, b) => averageTier(a.shares) - averageTier(b.shares));

  return (
    <>
      <h1 className="mt-4 text-2xl font-semibold">How the communities compare</h1>
      <p className="muted mt-1">
        {season} {phaseLabel(phase).toLowerCase()}: points won against teams placed at the same
        level, {ages[0] ?? "U9"} to {ages.at(-1) ?? "U18"}. Every tier is its own pool, so an even
        record is 50% wherever a community&apos;s teams were placed.
      </p>

      <PhaseTabs phase={phase} available={available} />
      <p className="mt-3 text-sm">
        <Link href="/history">How they compared in past seasons →</Link>
      </p>

      {rows.length === 0 ? (
        <p className="mt-6">No {phaseLabel(phase).toLowerCase()} games have been played yet.</p>
      ) : (
        <>
          <ShareBars rows={rows} names={names} />
          <AgeHeatmap rows={rows} ages={ages} names={names} metric="share" />
          <GoalBars rows={byDiff} ages={ages} names={names} />
          <AgeHeatmap rows={byDiff} ages={ages} names={names} metric="diff" />
          {phase === "regular" && placed.length > 0 ? (
            <TierPlacement rows={placed} names={names} levels={levels} />
          ) : (
            <p className="muted mt-5 text-sm">
              Seeding spreads each community&apos;s teams across the tiers by design, so where teams
              were placed is compared once the regular season starts.
            </p>
          )}
        </>
      )}

      <h2 className="mt-10 text-lg font-semibold">Your community</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {communities
          .filter((c) => c.teams > 0)
          .map((c) => (
            <li key={c.slug}>
              <Link
                href={`/c/${c.slug}`}
                className="card block px-3 py-1.5 text-sm text-[var(--fg)] no-underline hover:border-[var(--accent)]"
              >
                {c.name} <span className="muted">· {c.teams}</span>
              </Link>
            </li>
          ))}
      </ul>

      <p className="muted mt-8 text-xs">
        Tiered Community Council leagues, plus U11 and U13 AA counted with their age as a level
        above Tier 1. AA plays no seeding, so an AA game counts in seeding if it was played by the
        end of seeding, and in the regular season after. No Flames, U7 or Junior. Visiting clubs
        count as opponents but get no row. A game between two teams of the same community counts as
        a win and a loss for it. The 90% range treats every game as independent, which they are not
        quite, so read it as a guide to how much a share could move by chance.
      </p>
    </>
  );
}

function averageTier(shares: number[]): number {
  return shares.reduce((sum, s, i) => sum + s * i, 0);
}

function PhaseTabs({ phase, available }: { phase: ComparePhase; available: ComparePhase[] }) {
  return (
    <nav className="phase-tabs mt-4 flex gap-2" aria-label="Phase">
      {(["seeding", "regular"] as const).map((p) =>
        available.includes(p) ? (
          <Link
            key={p}
            href={p === "seeding" ? "/?phase=seeding" : "/?phase=regular"}
            aria-current={p === phase ? "page" : undefined}
          >
            {phaseLabel(p)}
          </Link>
        ) : (
          <span key={p}>{phaseLabel(p)}: not started</span>
        ),
      )}
    </nav>
  );
}
