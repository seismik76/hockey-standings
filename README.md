# hockey-standings

Scores, standings and tier analysis for Hockey Calgary community hockey, 2026-27 onward. It replaces [hockey-calgary-scraper](https://github.com/seismik76/hockey-calgary-scraper).

**Zone: public** ([platform](https://github.com/seismik76/platform)). It's read-only and has no login or personal data: team names only, never coach, manager or player names. If it ever needs a login, it moves to the private zone.

Hosting: one scale-to-zero Container App and one collector job in the shared `cae-public` environment, with its own identity, Key Vault and Neon project. Images come from GitHub Container Registry and are deployed by digest.

## Layout

- `packages/sources`: one adapter per upstream, as pure functions (response in, normalized records out) with tests against captured fixtures. So far:
  - TeamLinkt's public site API: seasons, divisions, scores, standings, teams.
  - Hockey Calgary's Community Council league index, which marks which TeamLinkt divisions are Community Council leagues.
  - The community catalogue: the 12 associations and a team-name parser ("U15 Glenlake Hawks NBC 1" → Glenlake, U15, NBC, team 1).

Still to come: the HC calendar feed adapter, the 2020-26 history import, `packages/db`, `apps/collector` and `apps/web`. Where the data comes from, and why, is in [docs/SOURCES.md](docs/SOURCES.md).

## Develop

Node 22+ and pnpm 9.

```bash
pnpm install
pnpm test        # also: pnpm lint, pnpm typecheck, pnpm format:check
```
