# hockey-standings

Scores, standings and tier analysis for Hockey Calgary community hockey, 2026-27 onward. It replaces [hockey-calgary-scraper](https://github.com/seismik76/hockey-calgary-scraper).

**Zone: public** ([platform](https://github.com/seismik76/platform)). It's read-only and has no login or personal data: team names only, never coach, manager or player names. If it ever needs a login, it moves to the private zone.

Hosting: one scale-to-zero Container App and one collector job in the shared `cae-public` environment, with its own identity, Key Vault and Neon project. Images come from GitHub Container Registry and are deployed by digest.

Not built yet.
