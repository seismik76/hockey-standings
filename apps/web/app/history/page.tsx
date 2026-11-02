import { communityHistory, compareCommunities, toSeasonTotals } from "@hockey/core";
import { historyTotals, listCommunities, tierGames } from "@hockey/db";
import type { Metadata } from "next";
import Link from "next/link";
import { BirthYearGrid, SeasonHeatmap } from "@/app/_components/history";
import {
  type HistoryPhase,
  bandFor,
  birthYearRows,
  birthYears,
  coverKey,
  defaultBirthYear,
  historyPhase,
} from "@/lib/compare";
import { getDb, seasonOrNull } from "@/lib/data";

// Past seasons barely change, but this season's column is live.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Past seasons" };

type Props = { searchParams: Promise<{ phase?: string; born?: string }> };

/** The page's URL for a phase and birth year, leaving out the defaults. */
function href(phase: HistoryPhase, born: number | null): string {
  const q = new URLSearchParams();
  if (phase !== "all") q.set("phase", phase);
  if (born !== null) q.set("born", String(born));
  const s = q.toString();
  return s ? `/history?${s}` : "/history";
}

const TABS: { phase: HistoryPhase; label: string }[] = [
  { phase: "all", label: "Seeding and regular" },
  { phase: "seeding", label: "Seeding" },
  { phase: "regular", label: "Regular season" },
];

export default async function History({ searchParams }: Props) {
  const params = await searchParams;
  const phase = historyPhase(params.phase);
  const season = await seasonOrNull();
  const db = getDb();
  const [past, communities, nowSeeding, nowRegular] = await Promise.all([
    historyTotals(db, phase === "all" ? undefined : phase),
    season ? listCommunities(db, season) : Promise.resolve([]),
    season && phase !== "regular" ? tierGames(db, season, "seeding") : Promise.resolve([]),
    season && phase !== "seeding" ? tierGames(db, season, "regular") : Promise.resolve([]),
  ]);
  const now = season
    ? toSeasonTotals(season, compareCommunities([...nowSeeding, ...nowRegular]))
    : [];
  const all = [...past, ...now];
  const rows = communityHistory(all);
  const seasons = [...new Set(all.map((r) => r.season))].sort();
  // Which ages have data in which seasons: U9 only this season, U11 from 2024-25.
  const covered = new Set(all.filter((r) => r.gp > 0).map((r) => coverKey(r.age, r.season)));
  const years = birthYears(seasons, covered);
  const asked = Number(params.born);
  const born = years.includes(asked) ? asked : defaultBirthYear(seasons, covered);
  const bornSeasons =
    born === null
      ? []
      : seasons.filter((s) => {
          const band = bandFor(born, s);
          return band !== null && covered.has(coverKey(band.age, s));
        });
  const current = season && now.length > 0 ? season : null;
  const names = new Map(communities.map((c) => [c.slug, c.name]));

  return (
    <>
      <h1 className="mt-4 text-2xl font-semibold">Past seasons</h1>
      <p className="muted mt-1">
        Points share against same-level teams, season by season since 2021-22, with this season so
        far. A pattern that holds year after year is the community, not one team.
      </p>

      <nav className="phase-tabs mt-4 flex flex-wrap gap-2" aria-label="Phase">
        {TABS.map((t) => (
          <Link
            key={t.phase}
            href={href(t.phase, params.born ? born : null)}
            aria-current={t.phase === phase ? "page" : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="mt-6">No past seasons have been imported.</p>
      ) : (
        <>
          <SeasonHeatmap rows={rows} seasons={seasons} current={current} names={names} />
          {born !== null && (
            <BirthYearGrid
              rows={birthYearRows(rows, bornSeasons, born)}
              seasons={bornSeasons}
              born={born}
              years={years}
              hrefFor={(y) => href(phase, y)}
              current={current}
              names={names}
            />
          )}
        </>
      )}

      <p className="muted mt-8 text-xs">
        Past seasons are season totals from the old hockey-calgary-scraper (Hockey Calgary&apos;s
        standings, RAMP and TeamLinkt), imported once; this season comes from the games collected
        now. Tiered leagues plus U11 and U13 AA, as on the home page. Playoffs and tournaments are
        left out. In 2021-22 and 2022-23 the standings include some games against teams outside each
        pool, so read those seasons as rougher. <Link href="/">Back to this season</Link>
      </p>
    </>
  );
}
