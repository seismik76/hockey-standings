// Migrations run as hockey_owner over the direct endpoint. See client.ts.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDirectPool } from "./client.js";
import * as schema from "./schema/index.js";

export function migrationsFolder(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
}

/** Apply pending migrations on a dedicated direct connection, then close it. */
export async function runMigrations(): Promise<void> {
  const pool = createDirectPool();
  try {
    await migrate(drizzle(pool, { schema, casing: "snake_case" }), {
      migrationsFolder: migrationsFolder(),
    });
  } finally {
    await pool.end();
  }
}
