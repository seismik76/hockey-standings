#!/usr/bin/env node
// Local Postgres 17 without Docker, adapted from GLK's scripts/pg-local.mjs.
//
// The official PostgreSQL 17 Windows binaries run as a user-level process,
// downloaded from Maven Central (the zonky.io embedded-postgres distribution).
// Its own directory (~/.hockey) and port (5433), so it runs beside GLK's.
//
// The databases mirror Neon's: owned by hockey_owner, with the group roles from
// infra/neon/roles.sql, plus a local hockey_web login in hockey_read so tests
// can prove the web role cannot write.
//
//   node scripts/pg-local.mjs install    download + extract binaries, initdb
//   node scripts/pg-local.mjs start|stop|status
//   node scripts/pg-local.mjs bootstrap  roles, the hockey and hockey_test databases
//   node scripts/pg-local.mjs reset      drop and recreate the hockey database
import { execFileSync, spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

// Matches Neon (Postgres 17) so dev and prod do not skew.
const PG_VERSION = "17.11.0";
const ROOT = join(homedir(), ".hockey");
const PGROOT = join(ROOT, "pgsql");
const PGDATA = join(ROOT, "data");
const LOGFILE = join(ROOT, "pg.log");
const PORT = Number(process.env.PGPORT ?? 5433);

// Local-only credentials. Nothing here is a secret; the cluster listens on
// localhost and holds throwaway development data.
const SUPERUSER = "postgres";
const SUPERPASS = "hockeydev";
const OWNER = "hockey_owner";
const OWNER_PASS = "hockey";
const WEB = "hockey_web";
const WEB_PASS = "hockey";
const APP_DB = "hockey";
// The test suite truncates every table, so it gets its own database.
const TEST_DB = "hockey_test";
const ROLES_SQL = new URL("../infra/neon/roles.sql", import.meta.url);

const bin = (name) => join(PGROOT, "bin", `${name}.exe`);
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: "inherit", ...opts, env: { ...process.env, ...opts.env } });

async function install() {
  if (existsSync(bin("postgres"))) {
    console.log(`binaries already present at ${PGROOT}`);
  } else {
    const url =
      `https://repo1.maven.org/maven2/io/zonky/test/postgres/embedded-postgres-binaries-windows-amd64/` +
      `${PG_VERSION}/embedded-postgres-binaries-windows-amd64-${PG_VERSION}.jar`;
    const work = join(tmpdir(), `hockey-pg-${Date.now()}`);
    mkdirSync(work, { recursive: true });
    console.log(`downloading PostgreSQL ${PG_VERSION} binaries…`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`);
    const jar = join(work, "pg.jar");
    await pipeline(Readable.fromWeb(res.body), createWriteStream(jar));
    mkdirSync(PGROOT, { recursive: true });
    // The jar is a zip holding one .txz. GNU tar (Git Bash) cannot read zips,
    // so PowerShell unpacks the outer zip and tar only the inner .tar.xz.
    // --force-local stops tar reading "C:" as a remote host.
    const zip = join(work, "pg.zip");
    renameSync(jar, zip);
    run("powershell", [
      "-NoProfile",
      "-Command",
      `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${work}' -Force`,
    ]);
    const inner = join(work, "postgres-windows-x86_64.txz");
    if (!existsSync(inner)) throw new Error(`expected ${inner} inside the jar`);
    run("tar", ["-xf", inner, "-C", PGROOT, "--force-local"]);
    rmSync(work, { recursive: true, force: true });
    console.log(`extracted to ${PGROOT}`);
  }

  if (existsSync(join(PGDATA, "PG_VERSION"))) {
    console.log(`cluster already initialised at ${PGDATA}`);
    return;
  }
  mkdirSync(PGDATA, { recursive: true });
  const pwfile = join(tmpdir(), `hockey-initdb-${Date.now()}`);
  await writeFile(pwfile, SUPERPASS, "utf8");
  try {
    run(bin("initdb"), [
      "-D",
      PGDATA,
      "-U",
      SUPERUSER,
      `--pwfile=${pwfile}`,
      "--auth-host=scram-sha-256",
      "-E",
      "UTF8",
      "--locale=C",
    ]);
  } finally {
    rmSync(pwfile, { force: true });
  }
  const conf = join(PGDATA, "postgresql.conf");
  const extra = [
    "",
    "# hockey-standings local dev — see scripts/pg-local.mjs",
    "listen_addresses = 'localhost'",
    `port = ${PORT}`,
    "shared_buffers = 128MB",
    "max_connections = 30",
    "timezone = 'America/Edmonton'",
    "log_timezone = 'America/Edmonton'",
    "",
  ].join("\n");
  await writeFile(conf, (await readFile(conf, "utf8")) + extra, "utf8");
  console.log(`initialised cluster at ${PGDATA}`);
}

function start() {
  if (status(true)) return console.log(`already running on :${PORT}`);
  // stdio must not be inherited: pg_ctl forks the server, which keeps the
  // inherited stdout open and hangs the calling shell. Output goes to LOGFILE.
  run(bin("pg_ctl"), ["-D", PGDATA, "-l", LOGFILE, "-w", "start"], { stdio: "ignore" });
  console.log(`started on :${PORT} (log: ${LOGFILE})`);
}

function stop() {
  if (!status(true)) return console.log("not running");
  run(bin("pg_ctl"), ["-D", PGDATA, "-m", "fast", "-w", "stop"]);
}

function status(quiet = false) {
  const r = spawnSync(bin("pg_ctl"), ["-D", PGDATA, "status"], { encoding: "utf8" });
  const up = r.status === 0;
  if (!quiet) console.log(up ? `running on :${PORT}` : "stopped");
  return up;
}

async function connect(database, user, password) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ host: "localhost", port: PORT, database, user, password });
  await client.connect();
  return client;
}

async function ensureRole(admin, name, sql) {
  const role = await admin.query("select 1 from pg_roles where rolname = $1", [name]);
  if (role.rowCount === 0) {
    await admin.query(sql);
    console.log(`created role ${name}`);
  }
}

async function bootstrap() {
  const admin = await connect("postgres", SUPERUSER, SUPERPASS);
  try {
    // CREATEROLE like Neon's default owner, but not superuser.
    await ensureRole(
      admin,
      OWNER,
      `create role ${OWNER} login createrole password '${OWNER_PASS}'`,
    );
    for (const name of [APP_DB, TEST_DB]) {
      const db = await admin.query("select 1 from pg_database where datname = $1", [name]);
      if (db.rowCount === 0) {
        await admin.query(`create database ${name} owner ${OWNER}`);
        console.log(`created database ${name}`);
      }
    }
  } finally {
    await admin.end();
  }

  const rolesSql = await readFile(ROLES_SQL, "utf8");
  for (const name of [APP_DB, TEST_DB]) {
    const owner = await connect(name, OWNER, OWNER_PASS);
    try {
      await owner.query(rolesSql);
    } finally {
      await owner.end();
    }
  }
  const admin2 = await connect("postgres", SUPERUSER, SUPERPASS);
  try {
    await ensureRole(
      admin2,
      WEB,
      `create role ${WEB} login password '${WEB_PASS}' in role hockey_read`,
    );
  } finally {
    await admin2.end();
  }
  console.log("roles: hockey_read, hockey_write, hockey_web (both databases)");
  console.log(`\nDATABASE_URL=postgres://${OWNER}:${OWNER_PASS}@localhost:${PORT}/${APP_DB}`);
}

async function reset() {
  const admin = await connect("postgres", SUPERUSER, SUPERPASS);
  try {
    await admin.query(
      "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
      [APP_DB],
    );
    await admin.query(`drop database if exists ${APP_DB}`);
    console.log(`dropped ${APP_DB}`);
  } finally {
    await admin.end();
  }
  await bootstrap();
}

const commands = { install, start, stop, status: () => status(false), bootstrap, reset };
const cmd = process.argv[2];
if (!cmd || !(cmd in commands)) {
  console.error(`usage: node scripts/pg-local.mjs <${Object.keys(commands).join("|")}>`);
  process.exit(1);
}
await commands[cmd]();
