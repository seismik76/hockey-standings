// The one-time import of past seasons (scripts/import-history.mjs). Each run
// replaces the seasons it brings, so it can be repeated after a fix.
import { inArray } from "drizzle-orm";
import type { Database } from "../client.js";
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
