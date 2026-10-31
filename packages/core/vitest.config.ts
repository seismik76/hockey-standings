import { defineConfig, mergeConfig } from "vitest/config";
import shared from "../../vitest.shared.mjs";

// Pure functions: no module state, so workers can be reused.
export default mergeConfig(shared, defineConfig({ test: { isolate: false } }));
