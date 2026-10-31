import { leagueData } from "@hockey/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StandingsTable } from "@/app/_components/standings-table";
import { getDb, seasonOrNull } from "@/lib/data";
import {
  PHASE_KINDS,
  calgaryToday,
  dateLabel,
  groupBy,
  leagueLabel,
  leagueTable,
  phaseLabel,
  scheduled,
  teamLabel,
} from "@/lib/view";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ phase: string; slug: string }> };

async function load({ phase, slug }: { phase: string; slug: string }) {
  if (!(PHASE_KINDS as string[]).includes(phase)) return null;
  const season = await seasonOrNull();
  if (!season) return null;
  return leagueData(getDb(), season, phase as (typeof PHASE_KINDS)[number], slug);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load(await params);
  return {
    title: data
      ? `${leagueLabel(data.league.name)} (${phaseLabel(data.league.phase)})`
      : "League not found",
  };
}

export default async function LeaguePage({ params }: Props) {
  const data = await load(await params);
  if (!data) notFound();
  const { league } = data;
  const table = leagueTable(data);
  const byId = new Map(data.teams.map((t) => [t.id, t]));
  const name = (id: number) => teamLabel(byId.get(id)?.name ?? "?", league.age);
  const finals = data.games.filter((g) => g.status === "final").reverse();
  const { upcoming, noScore } = scheduled(data.games, calgaryToday());

  return (
    <>
      <p className="muted mt-4 text-sm">{phaseLabel(league.phase)}</p>
      <h1 className="text-2xl font-semibold">{leagueLabel(league.name)}</h1>

      <section className="card mt-5 p-2 sm:p-4">
        <StandingsTable rows={table} age={league.age} />
      </section>

      {upcoming.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Coming up</h2>
          <GameDays
            games={upcoming}
            render={(g) => `${name(g.awayTeamId)} at ${name(g.homeTeamId)}`}
          />
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Results</h2>
        {finals.length === 0 ? (
          <p className="muted mt-2">No games played yet.</p>
        ) : (
          <GameDays
            games={finals}
            render={(g) => (
              <>
                {name(g.awayTeamId)} <strong className="tabular-nums">{g.awayScore}</strong> at{" "}
                {name(g.homeTeamId)} <strong className="tabular-nums">{g.homeScore}</strong>
              </>
            )}
          />
        )}
      </section>

      {noScore.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">No score posted</h2>
          <p className="muted mt-1 text-sm">
            Scheduled games with no result on TeamLinkt: not yet entered, or not played.
          </p>
          <GameDays
            games={noScore}
            render={(g) => `${name(g.awayTeamId)} at ${name(g.homeTeamId)}`}
          />
        </section>
      )}

      <p className="mt-8 text-sm">
        <Link href="/leagues">← All leagues</Link>
      </p>
    </>
  );
}

function GameDays<G extends { id: number; date: string }>({
  games,
  render,
}: {
  games: G[];
  render: (g: G) => React.ReactNode;
}) {
  return (
    <div className="mt-3 space-y-3">
      {groupBy(games, (g) => g.date).map(([date, onDay]) => (
        <div key={date}>
          <h3 className="muted text-sm font-medium">{dateLabel(date)}</h3>
          <ul className="mt-1 space-y-1">
            {onDay.map((g) => (
              <li key={g.id}>{render(g)}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
