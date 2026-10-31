import { defineConfig } from "vitest/config";

/**
 * Settings every package's test run inherits. Copied from GLK, where an
 * uncapped worker pool ran the same laptop out of memory: few workers and
 * generous timeouts, so a failure means a broken test, not a busy machine.
 */
export const sharedTest = {
  maxWorkers: 2,
  testTimeout: 20_000,
  hookTimeout: 20_000,
} as const;

export default defineConfig({ test: { ...sharedTest } });
