import { communityLeagues } from "@hockey/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StandingsTable } from "@/app/_components/standings-table";
import { getDb, nameOfCommunity, seasonOrNull } from "@/lib/data";
import {
  type TeamCard,
  calgaryToday,
  compareLeagues,
  dateLabel,
  groupBy,
  leagueHref,
  leagueLabel,
  leagueTable,
  ordinal,
  phaseLabel,
  teamCard,
  teamLabel,
} from "@/lib/view";

// ISR: see lib/data.ts.
export const revalidate = 300;
export function generateStaticParams(): { community: string }[] {
  return [];
}

type Props = { params: Promise<{ community: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const name = await nameOfCommunity((await params).community);
  return { title: name ?? "Community not found" };
}

export default async function CommunityPage({ params }: Props) {
  const { community } = await params;
  const [name, season] = await Promise.all([nameOfCommunity(community), seasonOrNull()]);
  if (!name || !season) notFound();

  const today = calgaryToday();
  const leagues = (await communityLeagues(getDb(), season, community)).sort((a, b) =>
    compareLeagues(a.league, b.league),
  );

  return (
    <>
      <h1 className="mt-4 text-2xl font-semibold">{name}</h1>
      <p className="muted mt-1">
        {season}: every {name} team, and where it stands in its league.
      </p>
      {leagues.length === 0 && <p className="mt-6">No {name} teams found this season.</p>}

      {groupBy(leagues, (d) => d.league.phase).map(([phase, inPhase]) => (
        <section key={phase} className="mt-8">
          <h2 className="text-lg font-semibold">{phaseLabel(phase)}</h2>
          <div className="mt-3 space-y-4">
            {inPhase.map((data) => {
              const table = leagueTable(data);
              const ours = data.teams.filter((t) => t.communitySlug === community);
              const cards = ours
                .map((t) => teamCard(data, table, t.id, today))
                .filter((c): c is TeamCard => c !== null)
                .sort((a, b) => a.row.rank - b.row.rank);
              const { league } = data;
              return (
                <article key={league.id} className="card p-4">
                  <h3 className="font-semibold">
                    <Link href={leagueHref(league)}>{leagueLabel(league.name)}</Link>
                  </h3>
                  <ul className="mt-3 space-y-3">
                    {cards.map((c) => (
                      <TeamSummary key={c.row.team.id} card={c} age={league.age} />
                    ))}
                  </ul>
                  {league.finals > 0 && (
                    <details className="mt-3">
                      <summary className="muted cursor-pointer text-sm">Full table</summary>
                      <div className="mt-2">
                        <StandingsTable
                          rows={table}
                          age={league.age}
                          highlight={(r) => r.team.communitySlug === community}
                        />
                      </div>
                    </details>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}

function TeamSummary({ card, age }: { card: TeamCard; age: string | null }) {
  const { row, of, results, next } = card;
  return (
    <li>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-medium">{teamLabel(row.team.name, age)}</span>
        <span className="text-sm tabular-nums">
          {row.gp > 0 ? (
            <>
              <strong>{ordinal(row.rank)}</strong> of {of} · {row.w}-{row.l}-{row.t} · {row.pts} pts
            </>
          ) : (
            <span className="muted">No games yet</span>
          )}
        </span>
      </div>
      {(results.length > 0 || next) && (
        <p className="muted mt-1 text-sm">
          {results.map((r, i) => (
            <span key={r.date + r.opponent.id}>
              {i > 0 && " · "}
              <span
                className={r.outcome === "W" ? "text-win" : r.outcome === "L" ? "text-loss" : ""}
              >
                {r.outcome} {r.own}–{r.other}
              </span>{" "}
              {r.home ? "vs" : "at"} {teamLabel(r.opponent.name, age)}
            </span>
          ))}
          {next && (
            <span>
              {results.length > 0 && " · "}Next: {dateLabel(next.date)} {next.home ? "vs" : "at"}{" "}
              {teamLabel(next.opponent.name, age)}
            </span>
          )}
        </p>
      )}
    </li>
  );
}
