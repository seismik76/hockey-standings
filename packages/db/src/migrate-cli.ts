#!/usr/bin/env tsx
import { runMigrations } from "./migrate.js";

try {
  await runMigrations();
  process.stdout.write(JSON.stringify({ level: "info", msg: "migrations applied" }) + "\n");
} catch (err) {
  process.stderr.write(
    JSON.stringify({ level: "error", msg: "migration failed", err: String(err) }) + "\n",
  );
  process.exitCode = 1;
}
