# Data sources

Where hockey-standings gets its data, what each source allows, and what is still waiting on permission. Probed on 2026-10-31 from a desktop, one request at a time, with the User-Agent `hockey-standings-probe/0.1 (+https://github.com/seismik76/hockey-standings)`.

## Stance

We read only what a source's `robots.txt` allows, and we don't work around access controls: no browser-mimicking headers, no loopholes like `/index.php/standings/...`. We don't guess at undocumented APIs. Anything else we ask for first. We store team names only, never coach, manager or player names.

## Sources

| Source | What it gives | robots.txt | Status | Use |
| --- | --- | --- | --- | --- |
| HC calendar feed `/index.php/index/calendar-schedule/stream/community-council/league/{slug}/seasonID/{s}/streamID/1/categoryID/{c}/leagueID/{l}/typeID/{t}/start//end/` | iCalendar: stable `UID` (`HCGAME…`), game number (`271S00001`) in `DESCRIPTION`, `SUMMARY` "Home vs. Away", arena and address, start/end in America/Edmonton, `LAST-MODIFIED`. No scores. | Allowed | Works. U13 Tier 2 South seeding: 48 games, Oct 17 to Nov 15. `Cache-Control: no-store`, no ETag. | Schedule: games, times, arenas |
| HC league index `/stream/view/stream/community-council` | All 59 Community Council league slugs | Allowed | Works | League discovery |
| HC league page `/league/view/stream/community-council/league/{slug}` | 5 recent and 5 upcoming games, team slugs, a score slot per team (`recent-games-win-bg`), the league chair's name and email | Allowed | Works. Every score is `-` in all 5 leagues sampled (U13 T2 South, U13 T1 North, U15 T1 BC, U18 T1 BC, Junior C). The Summary links are commented out. | Team discovery. Don't store the chair contact. |
| HC team page `/team/view/league/{slug}/team/{team}` | Team games, mini standings, staff names | Allowed | Works | Team list only |
| HC standings `/standings/*` and scores `/schedule/*` | Standings and completed scores | **Disallowed** | Not fetched | Only with permission |
| TeamLinkt site `leagues.teamlinkt.com/hockeycalgary` | Builder pages "U11/U13/U15/U18/U21 Scores", "… Standings", "… Schedule". Each holds a client-side widget configured with TeamLinkt division IDs (53 for U13). Its chrome is still template placeholder text. | `/` allowed, `/leagues/get*` disallowed | The page loads; the data comes from an undocumented JSON API the browser script calls (`/api/public/sites/hockeycalgary/{scores,standings,schedule,divisions,seasons,…}`, POST). A plain POST to that path on `leagues.teamlinkt.com` returned 404. Stopped there. | **Likely the only public source of 2026-27 scores. Ask before using.** |
| `app.teamlinkt.com` | TeamLinkt's app, which serves the site script | **Disallows `/`** apart from login, signup and registration paths | Only the static script was fetched | None |
| `games.teamlinkt.com` | Digital gamesheets | `robots.txt` returns 403 | Root loads; not explored | Unknown |
| Old seed DB `hockey-calgary-scraper/data/seed/hockey_calgary.db` | 9,003 standings rows, 2020-21 to 2025-26, 12 communities | n/a | In repo | Frozen history import |

## Calendar feed IDs

| Part | Known values | Where it comes from |
| --- | --- | --- |
| `seasonID` | 22 = 2026-27 | Feed probed for the redesign plan |
| `streamID` | 1 = Community Council | Same |
| `categoryID` | 13 U7, 14 U9, 15 U11, 16 U13, 17 U15, 18 U18, 19 U21 | `category_id` attributes in the site nav (allowed pages) |
| `leagueID` | 400 = U13 Tier 2 South; the other 58 unknown | Not on any allowed page. It appears to come from the schedule pages, which are disallowed. |
| `typeID` | 5 = seeding; regular season and playoffs unknown | Same |

So the calendar feed works, but the collector can't find its IDs for 58 of the 59 leagues without either the disallowed pages or a list from Hockey Calgary. Guessing IDs against the feed endpoint is enumeration, so we don't do it.

## How the old scraper read TeamLinkt

[hockey-calgary-scraper](https://github.com/seismik76/hockey-calgary-scraper) took 2025-26 U13, U18 and U21 standings and scores from TeamLinkt's older datatable endpoints:

- `scraper.py`: it read the `hierarchy_filter` dropdown on `/hockeycalgary/Standings` for league IDs (`{division}-{tier}`), then POSTed `season_id` and `group_ids[division]`/`group_ids[tier]` to `/leagues/getStandings/23957/{season_id}`. The response is JSON with `team_name`, `games_played`, `total_wins`, `total_losses`, `total_ties`, `total_points`, `score_for` and `score_against`.
- `games_scraper.py`: it POSTed `season_id` to `/leagues/getAllEvents/23957` for every event in the season. Scores come back inside the team-name HTML as a trailing `(N)`, and the game ID is in the event link `/Leagues/event/23957/{id}`.

We don't reuse this. TeamLinkt's `robots.txt` disallows `/leagues/get*` in all four casings, which covers both endpoints. The old scraper also sent a Chrome User-Agent, `X-Requested-With` and `Referer` headers, and turned off TLS verification. Its findings are still useful: they name exactly what to ask TeamLinkt for, and its field mapping will carry over if permission comes.

## Other findings

- `u11-tier-1-south` redirects to the league index, so some U11 leagues have no league page yet.
- Two weeks into seeding (Oct 17 to Nov 15), Hockey Calgary's site shows no scores for any league sampled. Scores seem to exist only in TeamLinkt.

## Waiting on

- [ ] **Hockey Calgary:** permission to read `/standings` and `/schedule/scores`, or the `leagueID` and `typeID` list for the calendar feeds, or a supported results feed.
- [ ] **Hockey Calgary or TeamLinkt:** whether the public TeamLinkt site's scores and standings data may be read by a non-commercial app, and how. Name the two endpoints above (`getStandings`, `getAllEvents` for association 23957) in the ask.
