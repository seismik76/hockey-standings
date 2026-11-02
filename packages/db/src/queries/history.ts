// The one-time import of past seasons (scripts/import-history.mjs). Each run
// replaces the seasons it brings, so it can be repeated after a fix.
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Database, Queryable } from "../client.js";
import { historyStandings, seasons } from "../schema/index.js";

export type HistoryStandingRow = Omit<typeof historyStandings.$inferInsert, "id">;

/** Replaces every history row of the seasons in `rows`, in one transaction. Returns the count written. */
export async function replaceHistory(db: Database, rows: HistoryStandingRow[]): Promise<number> {
  const labels = [...new Set(rows.map((r) => r.seasonLabel))];
  if (labels.length === 0) return 0;
  return db.transaction(async (tx) => {
    await tx
      .insert(seasons)
      .values(labels.map((label) => ({ label })))
      .onConflictDoNothing();
    await tx.delete(historyStandings).where(inArray(historyStandings.seasonLabel, labels));
    // Postgres caps a statement at 65535 parameters; 18 columns a row.
    for (let i = 0; i < rows.length; i += 1000) {
      await tx.insert(historyStandings).values(rows.slice(i, i + 1000));
    }
    return rows.length;
  });
}

/**
 * Past seasons as totals per season, community and age, for one phase or
 * (phase undefined) seeding and regular season together.
 */
export async function historyTotals(
  db: Queryable,
  phase?: "seeding" | "regular",
): Promise<
  {
    season: string;
    community: string;
    age: string;
    gp: number;
    w: number;
    l: number;
    t: number;
    gf: number;
    ga: number;
  }[]
> {
  const h = historyStandings;
  const rows = await db
    .select({
      season: h.seasonLabel,
      community: h.communitySlug,
      age: h.age,
      gp: sql<number>`sum(${h.gp})::int`,
      w: sql<number>`sum(${h.w})::int`,
      l: sql<number>`sum(${h.l})::int`,
      t: sql<number>`sum(${h.t})::int`,
      gf: sql<number>`sum(${h.gf})::int`,
      ga: sql<number>`sum(${h.ga})::int`,
    })
    .from(h)
    .where(and(isNotNull(h.communitySlug), phase ? eq(h.phase, phase) : undefined))
    .groupBy(h.seasonLabel, h.communitySlug, h.age);
  return rows.filter((r): r is typeof r & { community: string } => r.community !== null);
}
