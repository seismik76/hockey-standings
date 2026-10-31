#!/usr/bin/env node
// Runs a SQL file against the Neon database as hockey_owner, then prints the
// group roles and their default privileges so the result can be checked.
//
//   DATABASE_URL="$(neon connection-string ... --ssl verify-full)" node infra/neon/apply.mjs infra/neon/roles.sql
//
// The connection string comes from the environment and is never printed.
import { readFile } from "node:fs/promises";
import pg from "pg";

const [file] = process.argv.slice(2);
if (!file || !process.env.DATABASE_URL) {
  console.error("usage: DATABASE_URL=... node infra/neon/apply.mjs <file.sql>");
  process.exit(2);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query(await readFile(file, "utf8"));
  const roles = await client.query(
    `SELECT rolname, rolcanlogin, rolsuper, rolcreaterole, rolcreatedb,
            pg_has_role(rolname, 'neon_superuser', 'member') AS neon_superuser
       FROM pg_roles WHERE rolname LIKE 'hockey_%' ORDER BY rolname`,
  );
  console.table(roles.rows);
  const defaults = await client.query(
    `SELECT pg_get_userbyid(defaclrole) AS for_role, defaclobjtype AS type, defaclacl::text AS acl
       FROM pg_default_acl ORDER BY 2`,
  );
  console.table(defaults.rows);
} finally {
  await client.end();
}
