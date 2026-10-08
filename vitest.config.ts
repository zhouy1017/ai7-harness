import { defineConfig } from 'vitest/config';

// Local Verification Ladder (ADR 0062). `pnpm test` runs tests/unit; later layers add tests/service.
// These suites run only on the developer host and never become a hosted gate.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    isolate: true,
    reporters: ['default'],
    watch: false,
    // A case's give-up point, not its speed budget: on a background test guest under load, store-backed cases have taken
    // longer than vitest's 5 s default (hooks 10 s) with no product cause, failing the Ladder (2026-10-07, #650). A hang
    // still fails, half a minute later.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
