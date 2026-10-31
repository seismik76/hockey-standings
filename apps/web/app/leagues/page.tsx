import { listLeagues } from "@hockey/db";
import type { Metadata } from "next";
import Link from "next/link";
import { getDb, seasonOrNull } from "@/lib/data";
import { compareLeagues, groupBy, leagueHref, leagueLabel, phaseLabel } from "@/lib/view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "All leagues" };

export default async function LeaguesPage() {
  const season = await seasonOrNull();
  if (!season) return <p className="mt-6">No data yet: the collector has not run.</p>;
  const leagues = (await listLeagues(getDb(), season)).sort(compareLeagues);

  return (
    <>
      <h1 className="mt-4 text-2xl font-semibold">All leagues, {season}</h1>
      {groupBy(leagues, (l) => l.phase).map(([phase, inPhase]) => (
        <section key={phase} className="mt-8">
          <h2 className="text-lg font-semibold">{phaseLabel(phase)}</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {groupBy(inPhase, (l) => l.age ?? "Other").map(([age, inAge]) => (
              <div key={age} className="card p-4">
                <h3 className="font-semibold">{age}</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {inAge.map((l) => (
                    <li key={l.id} className="flex justify-between gap-3">
                      <Link href={leagueHref(l)}>{leagueLabel(l.name)}</Link>
                      <span className="muted tabular-nums">
                        {l.teams} teams · {l.finals} played
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
