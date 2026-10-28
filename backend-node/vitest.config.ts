import { defineConfig } from "vitest/config";

// Gemini is forced offline for the whole suite via `test.env` (the
// officially-supported way to inject env into every test worker,
// regardless of pool/fork timing - unlike mutating process.env from a
// globalSetup script, which is not reliably inherited). Tests must never
// depend on, or spend quota against, a real GEMINI_API_KEY sitting in
// .env. Set RUN_LIVE_GEMINI_TESTS=1 to opt into live calls for a manual
// check; never done in CI.
const forceOfflineEnv = process.env.RUN_LIVE_GEMINI_TESTS ? {} : { GEMINI_API_KEY: "" };

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/globalSetup.ts"],
    env: forceOfflineEnv,
  },
});
