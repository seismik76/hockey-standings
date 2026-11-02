#!/usr/bin/env node
// One-time import of past seasons (2021-22 to 2025-26) from the old
// hockey-calgary-scraper's SQLite seed, data/seed/hockey_calgary.db in
// seismik76/hockey-calgary-scraper, into history_standings. The collector
// never reads it; this script is the only way in.
//
//   pnpm history:import <path/to/hockey_calgary.db> [--dry-run]
//
// It writes to DATABASE_URL (.env.local for the local database). For Neon,
// run it as hockey_owner, as migrations are (README). Each run replaces the
// seasons it brings, so it can be repeated. Needs Node 22.13+ for node:sqlite,
// and the packages built (pnpm build).
import { DatabaseSync } from "node:sqlite";

const sources = await import(new URL("../packages/sources/dist/index.js", import.meta.url));
const db = await import(new URL("../packages/db/dist/index.js", import.meta.url));

const file = process.argv.find((a) => a.endsWith(".db"));
const dryRun = process.argv.includes("--dry-run");
if (!file) {
  console.error("usage: pnpm history:import <path/to/hockey_calgary.db> [--dry-run]");
  process.exit(2);
}

// Where the old scraper read each league. U11 (its RAMP stream) is read from
// RAMP itself by scripts/import-ramp.mjs, which found divisions the old scraper
// missed. The other streams are tournaments, zone AA (elite-council) and girls'
// leagues, none of which the comparison uses.
const ORIGINS = { "community-council": "hockeycalgary", TeamLinkt: "teamlinkt" };

const old = new DatabaseSync(file, { readOnly: true });
const raw = old
  .prepare(
    `select s.name season, l.stream, l.type, l.name league, tm.name team, c.name community,
            st.gp, st.w, st.l, st.t, st.gf, st.ga, st.source_url url
       from standings st
       join seasons s on s.id = st.season_id
       join leagues l on l.id = st.league_id
       join teams tm on tm.id = st.team_id
       left join communities c on c.id = st.community_id
      where l.stream in (${Object.keys(ORIGINS)
        .map((s) => `'${s}'`)
        .join(", ")})
        and l.type in ('Seeding', 'Regular')`,
  )
  .all();
old.close();

const skipped = {
  notTiered: new Set(),
  unknownCommunity: new Set(),
  doesNotAddUp: [],
  duplicate: [],
};
const parsed = [];
for (const r of raw) {
  const league = sources.parseHistoryLeague(r.league);
  if (!league) {
    skipped.notTiered.add(r.league);
    continue;
  }
  const community = sources.historyCommunity(r.community);
  if (r.community && !community) skipped.unknownCommunity.add(r.community);
  parsed.push({ ...r, league, community, slug: league.slug });
}

const rows = [];
const seen = new Map();
const line = (r) => [r.gp, r.w, r.l, r.t, r.gf, r.ga].join(",");
for (const r of sources.resolvePhases(parsed)) {
  // "2023-2024" → "2023-24", as this app writes seasons.
  const season = r.season.replace(/^(\d{4})-\d{2}(\d{2})$/, "$1-$2");
  if (r.gp !== r.w + r.l + r.t) {
    skipped.doesNotAddUp.push(`${season} ${r.league.name} ${r.team}`);
    continue;
  }
  const key = [season, r.phase, r.slug, r.team].join("|");
  // TeamLinkt listed some 2025-26 U13 leagues under two ids; the old database
  // kept both. A repeat is dropped only if it says the same; otherwise stop.
  if (seen.has(key)) {
    if (seen.get(key) !== line(r)) {
      console.error(`conflicting duplicate: ${key}: ${seen.get(key)} vs ${line(r)}`);
      process.exit(1);
    }
    skipped.duplicate.push(key);
    continue;
  }
  seen.set(key, line(r));
  rows.push({
    seasonLabel: season,
    phase: r.phase,
    leagueSlug: r.slug,
    leagueName: r.league.name,
    age: r.league.age,
    tier: r.league.tier,
    region: r.league.region,
    pool: r.league.pool,
    teamName: r.team,
    communitySlug: r.community,
    gp: r.gp,
    w: r.w,
    l: r.l,
    t: r.t,
    gf: r.gf,
    ga: r.ga,
    origin: ORIGINS[r.stream],
    sourceUrl: r.url,
  });
}

const summary = new Map();
for (const r of rows) {
  const key = `${r.seasonLabel} ${r.phase.padEnd(8)} ${r.age}`;
  const s = summary.get(key) ?? { leagues: new Set(), teams: 0, gp: 0 };
  s.leagues.add(r.leagueSlug);
  s.teams += 1;
  s.gp += r.gp;
  summary.set(key, s);
}
console.log(`read ${raw.length} rows; importing ${rows.length}`);
for (const [key, s] of [...summary].sort()) {
  console.log(
    `  ${key}  ${String(s.leagues.size).padStart(2)} leagues  ${String(s.teams).padStart(3)} teams  ${String(s.gp / 2).padStart(4)} games`,
  );
}
console.log(
  `skipped: ${raw.length - parsed.length} rows not in tiered leagues (${skipped.notTiered.size} league names)`,
);
console.log(
  `         ${parsed.length - rows.length - skipped.doesNotAddUp.length - skipped.duplicate.length} copies of one table reported in both phases`,
);
console.log(
  `         ${skipped.doesNotAddUp.length} whose games do not add up`,
  skipped.doesNotAddUp.slice(0, 5),
);
console.log(
  `         ${skipped.duplicate.length} identical repeats of a team under a second league id`,
);
console.log(`communities the old database named that match none today:`, [
  ...skipped.unknownCommunity,
]);
console.log(`teams with no community: ${rows.filter((r) => !r.communitySlug).length}`);

if (dryRun) {
  console.log("dry run: nothing written");
} else {
  const written = await db.replaceHistory(db.getDb(), rows);
  console.log(
    `wrote ${written} rows to ${new URL(process.env.DATABASE_URL ?? "postgres://?").host}`,
  );
  await db.closeDb();
}
