# TeamLinkt fixtures

Real responses from TeamLinkt's public site API for Hockey Calgary, captured on 2026-10-31 and pretty-printed. The adapter tests run against them, so a change in TeamLinkt's response shape fails CI instead of quietly writing zeros.

| File | Request |
| --- | --- |
| `seasons.json` | `GET /api/public/sites/hockeycalgary/seasons` |
| `divisions-61563.json` | `GET /api/public/sites/hockeycalgary/divisions?season_id=61563` |
| `scores-61563-332824.json` | `POST /api/public/sites/hockeycalgary/scores` with `{"season_id":61563,"division_id":332824,"limit":50,"from":"2026-10-17","to":"2026-11-15"}` |
| `standings-61563-332824.json` | `POST /api/public/sites/hockeycalgary/standings` with `{"season_id":61563,"division_id":332824}` |
| `teams-61563.json` | `POST /api/public/sites/hockeycalgary/teams` with `{"season_id":61563}` |

Season 61563 is 2026-27 Seeding; division 332824 is U13 Tier 2 South. The base URL is `https://app.teamlinkt.com`.

To refresh one, repeat its request with the hockey-standings User-Agent and replace the file. Check the diff before committing: the tests pin counts and a few values from this capture.

`statistics-61563-332824-pts.json`: page 1 of the player statistics for U13 Tier 2 South in seeding (offensive group, points with goals as the secondary statistic, sorted by points), captured 2026-11-01. **Anonymised before it was written**: every player's name is replaced with "Player N" and every photo reference with "0". The app never stores names, photos or any player key.
