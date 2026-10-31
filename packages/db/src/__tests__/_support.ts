/**
 * Which database the destructive tests use, and how it is prepared.
 *
 * Every test file truncates every table, so the rule is: never a database that
 * is not local. HOCKEY_TEST_DATABASE_URL wins if set; otherwise a local
 * DATABASE_URL (CI's service container) is used; otherwise the local default
 * from scripts/pg-local.mjs. A Neon URL in the environment is ignored.
 */
import { readFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import pg from "pg";
import { closeDb, getDb, isLocal } from "../client.js";
import { runMigrations } from "../migrate.js";

const LOCAL_DEFAULT = "postgres://hockey_owner:hockey@localhost:5433/hockey_test";
const ROLES_SQL = new URL("../../../../infra/neon/roles.sql", import.meta.url);

export function testDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.HOCKEY_TEST_DATABASE_URL) return env.HOCKEY_TEST_DATABASE_URL;
  return env.DATABASE_URL && isLocal(env.DATABASE_URL) ? env.DATABASE_URL : LOCAL_DEFAULT;
}

/** The same database, as the web app's read-only login. */
export function webDatabaseUrl(): string {
  const url = new URL(testDatabaseUrl());
  url.username = "hockey_web";
  url.password = "hockey";
  return url.toString();
}

/**
 * Point the client at the test database, give it the production roles, and
 * migrate it. Run once per file, in beforeAll.
 */
export async function setUpTestDatabase(): Promise<void> {
  const url = testDatabaseUrl();
  if (!isLocal(url)) throw new Error(`Refusing to run destructive tests against ${url}`);
  process.env.DATABASE_URL = url;
  delete process.env.DATABASE_URL_DIRECT;

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(await readFile(ROLES_SQL, "utf8"));
    const web = await client.query("select 1 from pg_roles where rolname = 'hockey_web'");
    if (web.rowCount === 0) {
      await client.query("create role hockey_web login password 'hockey' in role hockey_read");
    }
  } finally {
    await client.end();
  }
  await runMigrations();
}

export async function truncateAll(): Promise<void> {
  await getDb().execute(
    sql`truncate fetches, games, league_teams, teams, leagues, phases, seasons, communities restart identity cascade`,
  );
}

export { closeDb };
