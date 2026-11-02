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

- `apps/web`: the read-only Next.js site. `/` compares the communities (points share against same-tier teams, overall and by age; tier placement once the regular season starts) and links to each; `/c/glenlake` shows every Glenlake team with its rank, record, last results and next game, and its league table; `/leagues` lists every league; `/l/seeding/u13-tier-2-south` is one league's table and results. Standings are computed from games (`packages/core`). `/c/…` and `/l/…` are cached for five minutes (ISR, in memory; see `apps/web/lib/data.ts`); `/` and `/leagues` render per request. Building needs no database.

Still to come: caching, the HC calendar feed adapter (start times and arenas), and the 2020-26 history import.

## Production

Live at https://ca-hockey-standings-web.blacksky-345561b6.canadacentral.azurecontainerapps.io.

| Piece     | Where                                                                                                                                                                                                     |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web app   | `ca-hockey-standings-web`, scale 0 to 2, as Neon login `hockey_web` (read only)                                                                                                                           |
| Collector | `caj-hockey-standings-collector`, 08:00, 12:00, 17:00, 23:00 Calgary, as `hockey_collector`                                                                                                               |
| Secrets   | `kv-hockey-sta-7w3roq`: `database-url-web`, `database-url-collector` (Neon pooled endpoint)                                                                                                               |
| Infra     | `rg-hockey-standings` in the public-zone subscription, from [platform](https://github.com/seismik76/platform) `public-zone/apps/hockey-standings.bicep`, applied by hand with `public-zone/deploy-app.sh` |
| Images    | `ghcr.io/seismik76/hockey-standings-{web,collector}`, public, deployed by digest                                                                                                                          |

A green push to main publishes both images and swaps them on (`.github/workflows/ci.yml`), signing in as `id-hockey-standings-deploy` through the `prod` environment. That identity can change only the web app and the collector job.

Migrations are run by hand, as `hockey_owner` on the direct endpoint, before a deploy that needs them:

```bash
DATABASE_URL="$(neon connection-string --project-id divine-salad-11934800   --role-name hockey_owner --database-name hockey --ssl verify-full)" pnpm db:migrate
```

Run the collector now instead of waiting for the hour:

````bash
az containerapp job start --subscription f4a8b0b9-875c-439f-8c01-7ab024797b74   -g rg-hockey-standings -n caj-hockey-standings-collector
``` Where the data comes from, and why, is in [docs/SOURCES.md](docs/SOURCES.md).

## Develop

Node 22+ and pnpm 9.

```bash
pnpm install
pnpm db:install  # once: local Postgres 17 on :5433 in ~/.hockey, no Docker
pnpm db:up       # after a reboot
pnpm collector   # fill the local database from TeamLinkt (about 4 minutes)
pnpm dev         # the site on http://localhost:3001
pnpm test        # also: pnpm lint, pnpm typecheck, pnpm format:check, pnpm build
````

The database is Neon in production; see [infra/neon/](infra/neon/).
