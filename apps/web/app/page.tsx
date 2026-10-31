import { listCommunities } from "@hockey/db";
import Link from "next/link";
import { getDb, seasonOrNull } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const season = await seasonOrNull();
  if (!season) return <p className="mt-6">No data yet: the collector has not run.</p>;
  const communities = (await listCommunities(getDb(), season)).filter((c) => c.teams > 0);

  return (
    <>
      <h1 className="mt-4 text-2xl font-semibold">{season}</h1>
      <p className="muted mt-1">Pick a community to see all of its teams, in every age and tier.</p>
      <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {communities.map((c) => (
          <li key={c.slug}>
            <Link
              href={`/c/${c.slug}`}
              className="card block px-4 py-3 text-[var(--fg)] no-underline hover:border-[var(--accent)]"
            >
              <span className="block font-medium">{c.name}</span>
              <span className="muted text-sm">
                {c.teams} {c.teams === 1 ? "team" : "teams"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm">
        <Link href="/leagues">Browse every league →</Link>
      </p>
    </>
  );
}
