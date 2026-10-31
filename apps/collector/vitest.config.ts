import { defineConfig, mergeConfig } from "vitest/config";
import shared from "../../vitest.shared.mjs";

export default mergeConfig(
  shared,
  defineConfig({
    test: {
      // Every file migrates and truncates one shared test database, so files
      // run one at a time; in parallel they race on both.
      fileParallelism: false,
      // Each file closes the pool in afterAll; a reused worker would hand the
      // next file a closed pool.
      isolate: true,
    },
  }),
);
