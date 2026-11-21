import { defineConfig } from 'vitest/config';
import DurationSequencer from './tests/support/duration-sequencer.js';

// Local Verification Ladder (ADR 0062). `pnpm test` runs tests/unit; later layers add tests/service.
// These suites run only on the developer host and never become a hosted gate.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/support/development-renderer.ts'],
    isolate: true,
    reporters: ['default'],
    watch: false,
    // Service files run slowest first and `--shard` balances them by recorded duration (#1621); any other run keeps vitest's order.
    sequence: { sequencer: DurationSequencer },
    // A case's give-up point, not its speed budget: on a background test guest under load, store-backed cases have taken
    // longer than vitest's 5 s default (hooks 10 s) with no product cause, failing the Ladder (2026-10-07, #650). A hang
    // still fails, half a minute later.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
