// The pages' only way to the database. Every page renders per request
// (force-dynamic), so `next build` never needs one.
import { currentSeason, getDb } from "@hockey/db";

export { getDb };

export async function seasonOrNull(): Promise<string | null> {
  return currentSeason(getDb());
}
