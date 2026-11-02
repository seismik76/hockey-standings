/**
 * Which database the destructive tests use, and how it is prepared.
 *
 * Every test file truncates every table, so the rule is: never a database that
 * is not local. HOCKEY_TEST_DATABASE_URL wins if set; otherwise a local
 * DATABASE_URL (CI's service container) is used; otherwise the local default
 * from scripts/pg-local.mjs. A Neon URL in the environment is ignored.
 *
 * Each package passes its own database name. Turbo runs package test suites
 * at the same time, and two suites truncating one database corrupt each
 * other's runs (CI saw a foreign-key failure and a deadlock), so each package
 * gets a database of its own on the same server, created on first use.
 */
import { readFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import pg from "pg";
import { closeDb, getDb, isLocal } from "./client.js";
import { runMigrations } from "./migrate.js";

const LOCAL_DEFAULT = "postgres://hockey_owner:hockey@localhost:5433/hockey_test";
// Same depth from src/ and dist/: packages/db/<dir>/ up to the repo root.
const ROLES_SQL = new URL("../../../infra/neon/roles.sql", import.meta.url);

export function testDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.HOCKEY_TEST_DATABASE_URL) return env.HOCKEY_TEST_DATABASE_URL;
  return env.DATABASE_URL && isLocal(env.DATABASE_URL) ? env.DATABASE_URL : LOCAL_DEFAULT;
}

let current: string | undefined;

/** The database set up by setUpTestDatabase, as the web app's read-only login. */
export function webDatabaseUrl(): string {
  if (!current) throw new Error("setUpTestDatabase has not run");
  const url = new URL(current);
  url.username = "hockey_web";
  url.password = "hockey";
  return url.toString();
}

/**
 * Create the package's test database if needed, point the client at it, give
 * it the production roles, and migrate it. Run once per file, in beforeAll.
 */
export async function setUpTestDatabase(database: string): Promise<void> {
  const base = testDatabaseUrl();
  if (!isLocal(base)) throw new Error(`Refusing to run destructive tests against ${base}`);
  if (!/^hockey_test(_[a-z]+)?$/.test(database)) {
    throw new Error(
      `Test databases are named hockey_test or hockey_test_<package>, not ${database}`,
    );
  }
  const url = new URL(base);
  url.pathname = `/${database}`;
  current = url.toString();
  process.env.DATABASE_URL = current;
  delete process.env.DATABASE_URL_DIRECT;

  const server = new pg.Client({ connectionString: base });
  await server.connect();
  try {
    const exists = await server.query("select 1 from pg_database where datname = $1", [database]);
    if (exists.rowCount === 0) await server.query(`create database ${database}`);
  } catch (err) {
    // Two files of one package can race to create it; the loser finds it made.
    if ((err as { code?: string }).code !== "42P04") throw err;
  } finally {
    await server.end();
  }

  const client = new pg.Client({ connectionString: current });
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
    sql`truncate player_stats, history_standings, fetches, games, league_teams, teams, leagues, phases, seasons, communities restart identity cascade`,
  );
}

export { closeDb };
