#!/usr/bin/env tsx
// pnpm collector              collect today's data into DATABASE_URL
// COLLECT_TODAY=2026-11-01    pretend it is another day (Calgary date)
// pnpm collector --force-stats  fetch player stats even if fetched in the last day
//                               (Azure: az containerapp job start ... --args --force-stats)
import { closeDb, getDb } from "@hockey/db";
import { calgaryToday, collect } from "./collect.js";
import { createClient, fetchTransport } from "./http.js";

const db = getDb();
try {
  const summary = await collect(db, createClient(db, fetchTransport), {
    today: process.env.COLLECT_TODAY ?? calgaryToday(),
    forceStats: process.argv.includes("--force-stats"),
  });
  const ok = summary.errors.length === 0;
  process.stdout.write(
    JSON.stringify({ level: ok ? "info" : "warn", msg: "collect finished", ...summary }) + "\n",
  );
  if (!ok) process.exitCode = 1;
} catch (err) {
  process.stderr.write(
    JSON.stringify({ level: "error", msg: "collect failed", err: String(err) }) + "\n",
  );
  process.exitCode = 1;
} finally {
  await closeDb();
}
