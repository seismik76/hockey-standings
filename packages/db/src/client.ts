// The only place a database connection is made; packages/db is the only place
// SQL lives. Adapted from GLK's client.
//
// DATABASE_URL is Neon's pooled endpoint in production (host has "-pooler").
// Migrations need the direct endpoint, DATABASE_URL_DIRECT, because the pooler
// drops session state between statements. Locally both are the same server.
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

// `date` columns are calendar dates: hand them back as "YYYY-MM-DD" so no
// timezone is ever applied.
pg.types.setTypeParser(pg.types.builtins.DATE, (value: string) => value);

export function isLocal(url: string): boolean {
  return /localhost|127\.0\.0\.1|\[::1\]/.test(url);
}

function poolConfig(url: string): pg.PoolConfig {
  return {
    connectionString: url,
    max: Number(process.env.PGPOOL_MAX ?? 5),
    // Neon suspends after five idle minutes; holding a connection past that buys nothing.
    idleTimeoutMillis: 300_000,
    keepAlive: true,
    // Cross-cloud, plus a possible Neon cold start after suspend.
    connectionTimeoutMillis: 15_000,
    // An explicit object, so certificate checks hold whatever sslmode the URL
    // says and whatever pg v9 does to sslmode=require. No TLS only on loopback.
    ssl: isLocal(url) ? false : { rejectUnauthorized: true },
  };
}

function requireUrl(name: "DATABASE_URL" | "DATABASE_URL_DIRECT"): string {
  const url = process.env[name];
  if (!url) throw new Error(`${name} is not set`);
  return url;
}

let pool: pg.Pool | undefined;
let database: Database | undefined;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool(poolConfig(requireUrl("DATABASE_URL")));
    pool.on("error", (err) => {
      // An idle client erroring must not take the process down.
      process.stderr.write(
        JSON.stringify({ level: "error", msg: "pg pool error", err: err.message }) + "\n",
      );
    });
  }
  return pool;
}

export function getDb(): Database {
  database ??= drizzle(getPool(), { schema, casing: "snake_case" });
  return database;
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
  database = undefined;
}

/** A one-off single-connection pool on the direct endpoint, for migrations. The caller ends it. */
export function createDirectPool(): pg.Pool {
  const url = process.env.DATABASE_URL_DIRECT
    ? requireUrl("DATABASE_URL_DIRECT")
    : requireUrl("DATABASE_URL");
  if (url.includes("-pooler.")) {
    throw new Error("Migrations need Neon's direct host, not the '-pooler' one.");
  }
  return new pg.Pool({ ...poolConfig(url), max: 1 });
}

export type Database = NodePgDatabase<typeof schema>;
/** A Database or a transaction handle, so helpers can run inside a caller's transaction. */
export type Queryable = Pick<
  Database,
  "select" | "selectDistinct" | "insert" | "update" | "delete" | "execute"
>;
export { schema };
