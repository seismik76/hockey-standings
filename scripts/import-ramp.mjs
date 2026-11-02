#!/usr/bin/env node
// One-time import of U11 for 2024-25 and 2025-26 from RAMP, where Hockey
// Calgary kept those standings, into history_standings (origin "ramp"). Read
// with Pat's permission (docs/SOURCES.md); the collector never reads RAMP.
//
//   pnpm history:ramp <dir> [--dry-run]
//
// It reads four saved responses (two seasons, seeding and regular season),
// named u11-{season id}-{game type}.json in <dir>; the script prints the URLs
// of any that are missing. Fetch them with curl, one at a time and a few
// seconds apart, as this app:
//
//   curl -A "hockey-standings (https://github.com/seismik76/hockey-standings)" -o <file> <url>
//
// RAMP sits behind Cloudflare, which answers curl but refuses Node's fetch
// (403); we do not dress the client up to get past that. The responses used
// on 2026-11-01 were fetched that way.
//
// It replaces only RAMP rows, so the old scraper's import
// (scripts/import-history.mjs) is untouched. Writes to DATABASE_URL
// (.env.local locally; hockey_owner for Neon, as migrations are). Needs the
// packages built (pnpm build).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const sources = await import(new URL("../packages/sources/dist/index.js", import.meta.url));
const db = await import(new URL("../packages/db/dist/index.js", import.meta.url));

const dryRun = process.argv.includes("--dry-run");
const dir = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!dir) {
  console.error("usage: pnpm history:ramp <dir of saved RAMP responses> [--dry-run]");
  process.exit(2);
}

const wanted = Object.entries(sources.RAMP_SEASONS).flatMap(([season, seasonId]) =>
  Object.entries(sources.RAMP_GAME_TYPES).map(([phase, gameType]) => ({
    season,
    phase,
    req: sources.rampStandingsRequest({ season: seasonId, gameType }),
    file: join(dir, `u11-${seasonId}-${gameType}.json`),
  })),
);
const missing = wanted.filter((w) => !existsSync(w.file));
if (missing.length > 0) {
  console.error("missing saved responses; fetch these:");
  for (const m of missing) console.error(`  ${m.file}  <-  ${m.req.url}`);
  process.exit(1);
}

const rows = [];
const skipped = { divisions: new Set(), unmatched: new Set(), doesNotAddUp: [] };
for (const { season, phase, req, file } of wanted) {
  {
    const lines = sources.parseRampStandings(JSON.parse(readFileSync(file, "utf8")));
    console.log(`${season} ${phase}: ${lines.length} teams from ${file}`);
    for (const r of lines) {
      const league = sources.parseHistoryLeague(r.division);
      if (!league) {
        skipped.divisions.add(r.division);
        continue;
      }
      if (r.gp !== r.w + r.l + r.t) {
        skipped.doesNotAddUp.push(`${season} ${r.division} ${r.team}`);
        continue;
      }
      const community = sources.parseTeamName(r.team).community?.slug ?? null;
      if (!community) skipped.unmatched.add(r.team);
      rows.push({
        seasonLabel: season,
        phase,
        leagueSlug: league.slug,
        leagueName: league.name,
        age: league.age,
        tier: league.tier,
        region: league.region,
        pool: league.pool,
        teamName: r.team,
        communitySlug: community,
        gp: r.gp,
        w: r.w,
        l: r.l,
        t: r.t,
        gf: r.gf,
        ga: r.ga,
        origin: "ramp",
        sourceUrl: req.url,
      });
    }
  }
}

// Against what is there now: the old scraper's copy of these seasons.
const { rows: current } = await db.getPool().query(
  `select season_label, phase, count(*)::int teams, count(distinct league_slug)::int leagues
     from history_standings where origin = 'ramp' group by 1, 2`,
);
const before = new Map(current.map((x) => [`${x.season_label} ${x.phase}`, x]));
const after = new Map();
for (const r of rows) {
  const key = `${r.seasonLabel} ${r.phase}`;
  const a = after.get(key) ?? { teams: 0, leagues: new Set() };
  a.teams += 1;
  a.leagues.add(r.leagueSlug);
  after.set(key, a);
}
console.log("\n                     now in the database   from RAMP");
for (const [key, a] of [...after].sort()) {
  const b = before.get(key);
  console.log(
    `  ${key.padEnd(16)}  ${String(b?.leagues ?? 0).padStart(3)} leagues ${String(b?.teams ?? 0).padStart(4)} teams   ${String(a.leagues.size).padStart(3)} leagues ${String(a.teams).padStart(4)} teams`,
  );
}
console.log(`\nskipped divisions (not tiered or AA):`, [...skipped.divisions].sort());
console.log(`teams matching no community:`, [...skipped.unmatched]);
console.log(`lines whose games do not add up:`, skipped.doesNotAddUp);

if (dryRun) {
  console.log("dry run: nothing written");
} else {
  const written = await db.replaceHistory(db.getDb(), rows);
  console.log(
    `wrote ${written} RAMP rows to ${new URL(process.env.DATABASE_URL ?? "postgres://?").host}`,
  );
}
await db.closeDb();
