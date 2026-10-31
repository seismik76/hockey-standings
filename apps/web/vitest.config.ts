import { defineConfig, mergeConfig } from "vitest/config";
import shared from "../../vitest.shared.mjs";

// lib/ is pure view logic: no module state, so workers can be reused.
export default mergeConfig(
  shared,
  defineConfig({ test: { include: ["lib/**/*.test.ts"], isolate: false } }),
);
