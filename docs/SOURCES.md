# Data sources

Where hockey-standings gets its data, what each source allows, and what is still waiting on permission. Probed on 2026-10-31 from a desktop, one request at a time, with the User-Agent `hockey-standings-probe/0.1 (+https://github.com/seismik76/hockey-standings)`.

## Stance

We read what a source's `robots.txt` allows, plus one exception: **TeamLinkt's public site API** (`app.teamlinkt.com/api/public/sites/hockeycalgary/…`), which serves the scores and standings pages of the public TeamLinkt site. TeamLinkt's `robots.txt` disallows `app.teamlinkt.com/`. Pat decided on 2026-10-31 to read it anyway, because it's a small non-commercial app that shows public game results. No other conditions apply to it.

Everywhere else we follow `robots.txt` and don't work around access controls, including loopholes like `/index.php/standings/...`. We store team names only, never coach, manager or player names.

## Sources

| Source                                                                                                                                                                  | What it gives                                                                                                                                                                                                | robots.txt                                                        | Status                                                                                                                                                                                                                                                                                                                 | Use                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| HC calendar feed `/index.php/index/calendar-schedule/stream/community-council/league/{slug}/seasonID/{s}/streamID/1/categoryID/{c}/leagueID/{l}/typeID/{t}/start//end/` | iCalendar: stable `UID` (`HCGAME…`), game number (`271S00001`) in `DESCRIPTION`, `SUMMARY` "Home vs. Away", arena and address, start/end in America/Edmonton, `LAST-MODIFIED`. No scores.                    | Allowed                                                           | Works. U13 Tier 2 South seeding: 48 games, Oct 17 to Nov 15. `Cache-Control: no-store`, no ETag.                                                                                                                                                                                                                       | Schedule: games, times, arenas                   |
| HC league index `/stream/view/stream/community-council`                                                                                                                 | All 59 Community Council league slugs                                                                                                                                                                        | Allowed                                                           | Works                                                                                                                                                                                                                                                                                                                  | League discovery                                 |
| HC league page `/league/view/stream/community-council/league/{slug}`                                                                                                    | 5 recent and 5 upcoming games, team slugs, a score slot per team (`recent-games-win-bg`), the league chair's name and email                                                                                  | Allowed                                                           | Works. Every score is `-` in all 5 leagues sampled (U13 T2 South, U13 T1 North, U15 T1 BC, U18 T1 BC, Junior C). The Summary links are commented out.                                                                                                                                                                  | Team discovery. Don't store the chair contact.   |
| HC team page `/team/view/league/{slug}/team/{team}`                                                                                                                     | Team games, mini standings, staff names                                                                                                                                                                      | Allowed                                                           | Works                                                                                                                                                                                                                                                                                                                  | Team list only                                   |
| HC standings `/standings/*` and scores `/schedule/*`                                                                                                                    | Standings and completed scores                                                                                                                                                                               | **Disallowed**                                                    | Not fetched                                                                                                                                                                                                                                                                                                            | Only with permission                             |
| TeamLinkt site `leagues.teamlinkt.com/hockeycalgary`                                                                                                                    | Builder pages "U11/U13/U15/U18/U21 Scores", "… Standings", "… Schedule". Each holds a client-side widget configured with TeamLinkt division IDs (53 for U13). Its chrome is still template placeholder text. | `/` allowed, `/leagues/get*` disallowed                           | The page loads; the data comes from the public API on `app.teamlinkt.com` (next row). The old `/hockeycalgary/Standings` page now returns 404.                                                                                                                                                                         | Pages themselves: none                           |
| TeamLinkt public API `app.teamlinkt.com/api/public/sites/hockeycalgary/{seasons,divisions,scores,standings,schedule,teams}`                                             | JSON. `seasons` and `divisions` by GET, the rest by JSON POST with `season_id` and `division_id`                                                                                                             | **Disallows `/`** apart from login, signup and registration paths | **Used, by Pat's decision (see Stance).** `seasons` works: 2026-27 Seeding `61563`, 2026-27 Regular Season `60742`. `divisions?season_id=61563` returns 90 leagues (U7 6, U9 14, U11 18, U13 18, U15 14, U18 17, U21 3); U13 Tier 2 South is `332824`. `scores` answered 201 with no games for the old division ID 53. | **Scores, standings, league and team discovery** |
| `games.teamlinkt.com`                                                                                                                                                   | Digital gamesheets                                                                                                                                                                                           | `robots.txt` returns 403                                          | Root loads; not explored                                                                                                                                                                                                                                                                                               | Unknown                                          |
| Old seed DB `hockey-calgary-scraper/data/seed/hockey_calgary.db`                                                                                                        | 9,003 standings rows, 2020-21 to 2025-26, 12 communities                                                                                                                                                     | n/a                                                               | In repo                                                                                                                                                                                                                                                                                                                | Frozen history import                            |

## Calendar feed IDs

| Part         | Known values                                         | Where it comes from                                                                        |
| ------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `seasonID`   | 22 = 2026-27                                         | Feed probed for the redesign plan                                                          |
| `streamID`   | 1 = Community Council                                | Same                                                                                       |
| `categoryID` | 13 U7, 14 U9, 15 U11, 16 U13, 17 U15, 18 U18, 19 U21 | `category_id` attributes in the site nav (allowed pages)                                   |
| `leagueID`   | 400 = U13 Tier 2 South; the other 58 unknown         | Not on any allowed page. It appears to come from the schedule pages, which are disallowed. |
| `typeID`     | 5 = seeding; regular season and playoffs unknown     | Same                                                                                       |

So the calendar feed works, but the collector can't find its IDs for 58 of the 59 leagues without either the disallowed pages or a list from Hockey Calgary. Guessing IDs against the feed endpoint is enumeration, so we don't do it. With the TeamLinkt API in use, the calendar feed is a cross-check for times and arenas, not the main schedule source.

## How the old scraper read TeamLinkt

[hockey-calgary-scraper](https://github.com/seismik76/hockey-calgary-scraper) took 2025-26 U13, U18 and U21 standings and scores from TeamLinkt's older datatable endpoints:

- `scraper.py`: it read the `hierarchy_filter` dropdown on `/hockeycalgary/Standings` for league IDs (`{division}-{tier}`), then POSTed `season_id` and `group_ids[division]`/`group_ids[tier]` to `/leagues/getStandings/23957/{season_id}`. The response is JSON with `team_name`, `games_played`, `total_wins`, `total_losses`, `total_ties`, `total_points`, `score_for` and `score_against`.
- `games_scraper.py`: it POSTed `season_id` to `/leagues/getAllEvents/23957` for every event in the season. Scores come back inside the team-name HTML as a trailing `(N)`, and the game ID is in the event link `/Leagues/event/23957/{id}`.

We don't reuse this. TeamLinkt's `robots.txt` disallows `/leagues/get*` in all four casings, which covers both endpoints. The old scraper also sent a Chrome User-Agent, `X-Requested-With` and `Referer` headers, and turned off TLS verification. The method is also dead now: `/hockeycalgary/Standings` returns 404 since TeamLinkt rebuilt the site, and `getAllEvents` timed out (504) when called without a season. The new public API replaces it.

## Other findings

- `u11-tier-1-south` redirects to the league index, so some U11 leagues have no league page yet.
- Two weeks into seeding (Oct 17 to Nov 15), Hockey Calgary's site shows no scores for any league sampled. Scores seem to exist only in TeamLinkt.

## Leagues and communities

- **League slugs are shared.** All 59 Community Council slugs on the HC league index match a TeamLinkt division slug, except `junior-c`, which is `u21-junior-c` on TeamLinkt. TeamLinkt's other 32 divisions are female, AA/AAA, rec and Junior B leagues outside Community Council.
- **12 associations.** TeamLinkt's `teams` list for 2026-27 seeding has 492 teams, U9 to U18, from 12 associations: Bow River, Bow Valley, Girls Hockey Calgary, Glenlake, Knights, McKnight, Northwest, Raiders, Southwest, Springbank, Trails West and Wolverines. These are the old scraper's 11 plus Girls Hockey Calgary, so its history probably already covers every association. U7 and Junior C teams are not in the seeding list.

## First full collector run (2026-10-31)

`pnpm collector` against the local database: 240 requests, no errors, about four minutes at one request a second.

| Phase                          | Leagues | Teams | Games | Final |
| ------------------------------ | ------- | ----- | ----- | ----- |
| 2026-27 Seeding (61563)        | 59      | 486   | 864   | 849   |
| 2026-27 Regular Season (60742) | 59      | 69    | 89    | 85    |

- TeamLinkt already has the regular-season divisions. Junior C and the U9, U11 and U13 Flames leagues are playing in them; the tiered leagues start after placement.
- U7 leagues have no games, as expected: U7 keeps no scores.
- Teams with no community, by design: the 47 Flames-league teams, named for their league ("U11 SCHHL Black") rather than an association, and four out-of-town Junior C clubs (Airdrie Dragons, Chestermere, Cochrane Generals, Southside Thunder). Every other team matched one of the 12 associations.

## Past seasons (imported 2026-11-01)

2021-22 to 2025-26 come from the old hockey-calgary-scraper database, as season totals per team (no games), imported once into `history_standings` by `scripts/import-history.mjs` from its seed file, `data/seed/hockey_calgary.db` (last updated 2026-05-16). The collector never reads it.

| Ages              | Seasons            | Where the old scraper read them |
| ----------------- | ------------------ | ------------------------------- |
| U13, U15, U18     | 2021-22 to 2024-25 | Hockey Calgary standings pages  |
| U15, U18          | 2025-26            | Hockey Calgary standings pages  |
| U11 (with U11 AA) | 2024-25, 2025-26   | RAMP                            |
| U13               | 2025-26            | TeamLinkt                       |

No U9 at all, and no U11 before 2024-25. 2020-21 (COVID) has nothing usable. Raiders appear from 2023-24 and Wolverines from 2022-23.

What the import fixes or leaves out:

- **Playoff rows** were exact copies of Regular ones (every pair, every season), so they are not imported. Real playoffs were the City Championships, a tournament; tournaments are left out, as are zone AA (`elite-council`: U15 to U18 AA) and girls' leagues.
- **One table in both phases.** A league existed in one phase, but the scraper asked for both and Hockey Calgary answered the other with the same table (458 rows). Where every team's line is identical, one copy is kept, in seeding if the average games played is 10 or fewer, else the regular season.
- **Two TeamLinkt ids.** TeamLinkt listed the 2025-26 U13 seeding leagues twice; the 93 repeats were identical and are dropped. A repeat that differed would stop the import.

Result: 3,047 rows, every one with a community and a record that adds up (gp = w + l + t).

**Balance.** In a closed pool, wins equal losses and goals for equal goals against. From 2023-24 every Hockey Calgary pool balances exactly. In 2021-22 and 2022-23 nearly every pool is off by about 8%: those tables include games against teams outside the pool. A few 2025-26 seeding pools (RAMP, TeamLinkt) are off by 2 to 6%, likely teams that changed pools during seeding. Points share still compares communities, but read 2021-23 as rougher.

## Waiting on

- [ ] **Hockey Calgary:** permission to read `/standings` and `/schedule/scores`, or the `leagueID` and `typeID` list for the calendar feeds, or a supported results feed.
- [x] **TeamLinkt API check (2026-10-31):** for division `332824` in season `61563`:
  - `scores` returns 10 games by default. With `limit` 50 (the site widget's own value) and `from`/`to` dates it returned all 25 seeding games so far, Oct 17 to 31, each with `id`, `date` (no start time), home and away team names and IDs, `homeScore`, `awayScore` and `resultType`. A `limit` of 200 is refused with a 302 redirect, so a window that fills 50 has to be split.
  - `standings` returned all 12 teams with GP, W, L, T, points, goals for and against, and streak. Standings computed from the 25 games match it exactly, at 2 points a win and 1 a tie.
- [x] Responses recorded as fixtures in [packages/sources/fixtures/teamlinkt/](../packages/sources/fixtures/teamlinkt/), with the adapter in `packages/sources/src/teamlinkt.ts`.
- [ ] **Optional courtesy note to Hockey Calgary or TeamLinkt:** say the app reads the public site API, at what rate, and how to ask us to stop.
