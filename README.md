# hockey-standings

Scores, standings and tier analysis for Hockey Calgary community hockey, 2026-27 onward. It replaces [hockey-calgary-scraper](https://github.com/seismik76/hockey-calgary-scraper).

**Zone: public** ([platform](https://github.com/seismik76/platform)). It's read-only and has no login or personal data: team names only, never coach, manager or player names. If it ever needs a login, it moves to the private zone.

Hosting: one scale-to-zero Container App and one collector job in the shared `cae-public` environment, with its own identity, Key Vault and Neon project. Images come from GitHub Container Registry and are deployed by digest.

## Layout

- `packages/sources`: one adapter per upstream, as pure functions (response in, normalized records out) with tests against captured fixtures. So far:
  - TeamLinkt's public site API: seasons, divisions, scores, standings, teams.
  - Hockey Calgary's Community Council league index, which marks which TeamLinkt divisions are Community Council leagues.
  - The community catalogue: the 12 associations and a team-name parser ("U15 Glenlake Hawks NBC 1" → Glenlake, U15, NBC, team 1).

- `packages/core`: logic that isn't tied to a source. So far, standings computed from games (2 points a win, 1 a tie), which reproduce TeamLinkt's table in order for the captured league.

- `packages/db`: the Drizzle schema, migrations and the collector's upserts; the only place SQL lives. Tests run against a real local Postgres, and prove the web app's role cannot write.

- `apps/collector`: one run collects every Community Council league of the current season from TeamLinkt into the database, politely (one request a second, app User-Agent) and logging every request. `pnpm collector` runs it against `.env.local`'s database.

- `apps/web`: the read-only Next.js site. `/` picks a community; `/c/glenlake` shows every Glenlake team with its rank, record, last results and next game, and its league table; `/leagues` lists every league; `/l/seeding/u13-tier-2-south` is one league's table and results. Standings are computed from games (`packages/core`). Pages render per request, so building needs no database.

Still to come: deployment (the collector as an hourly Container Apps Job, the web app, Key Vault and the login roles), caching, the HC calendar feed adapter (start times and arenas), and the 2020-26 history import. Where the data comes from, and why, is in [docs/SOURCES.md](docs/SOURCES.md).

## Develop

Node 22+ and pnpm 9.

```bash
pnpm install
pnpm db:install  # once: local Postgres 17 on :5433 in ~/.hockey, no Docker
pnpm db:up       # after a reboot
pnpm collector   # fill the local database from TeamLinkt (about 4 minutes)
pnpm dev         # the site on http://localhost:3001
pnpm test        # also: pnpm lint, pnpm typecheck, pnpm format:check, pnpm build
```

The database is Neon in production; see [infra/neon/](infra/neon/).
