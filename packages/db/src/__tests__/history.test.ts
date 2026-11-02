import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../client.js";
import { upsertCommunities } from "../queries/ingest.js";
import { type HistoryStandingRow, historyTotals, replaceHistory } from "../queries/history.js";
import { historyStandings } from "../schema/index.js";
import { closeDb, setUpTestDatabase, truncateAll } from "../testing.js";

beforeAll(() => setUpTestDatabase("hockey_test_db"));
beforeEach(async () => {
  await truncateAll();
  await upsertCommunities(getDb(), [{ slug: "southwest", name: "Southwest" }]);
});
afterAll(closeDb);

const row = (seasonLabel: string, teamName: string, w = 5): HistoryStandingRow => ({
  seasonLabel,
  phase: "seeding",
  leagueSlug: "u13-tier-1-south",
  leagueName: "U13 TIER 1 SOUTH",
  age: "U13",
  tier: 1,
  region: "south",
  pool: null,
  teamName,
  communitySlug: "southwest",
  gp: 8,
  w,
  l: 8 - w,
  t: 0,
  gf: 20,
  ga: 18,
  origin: "hockeycalgary",
  sourceUrl: null,
});

describe("replaceHistory", () => {
  it("writes rows, creating their seasons, and replaces a season on a re-run", async () => {
    const db = getDb();
    expect(
      await replaceHistory(db, [row("2023-24", "Southwest 1"), row("2024-25", "Southwest 1")]),
    ).toBe(2);
    expect(
      await replaceHistory(db, [row("2024-25", "Southwest 1", 7), row("2024-25", "Southwest 2")]),
    ).toBe(2);

    const rows = await db.select().from(historyStandings);
    expect(rows.map((r) => [r.seasonLabel, r.teamName, r.w]).sort()).toEqual([
      ["2023-24", "Southwest 1", 5],
      ["2024-25", "Southwest 1", 7],
      ["2024-25", "Southwest 2", 5],
    ]);
  });

  it("refuses a line whose games do not add up", async () => {
    await expect(replaceHistory(getDb(), [{ ...row("2024-25", "X"), gp: 9 }])).rejects.toThrow();
    const [{ n }] = (await getDb()
      .select({ n: count() })
      .from(historyStandings)
      .where(eq(historyStandings.seasonLabel, "2024-25"))) as [{ n: number }];
    expect(n).toBe(0);
  });

  it("totals past seasons by season, community and age, for a phase or both", async () => {
    const db = getDb();
    await replaceHistory(db, [
      row("2024-25", "Southwest 1", 5),
      row("2024-25", "Southwest 2", 3),
      { ...row("2024-25", "Southwest 1", 6), phase: "regular", leagueSlug: "u13-tier-2-south" },
      { ...row("2024-25", "Okotoks 1", 8), communitySlug: null },
    ]);
    expect(await historyTotals(db, "seeding")).toEqual([
      {
        season: "2024-25",
        community: "southwest",
        age: "U13",
        gp: 16,
        w: 8,
        l: 8,
        t: 0,
        gf: 40,
        ga: 36,
      },
    ]);
    expect((await historyTotals(db))[0]).toMatchObject({ gp: 24, w: 14 });
  });
});
