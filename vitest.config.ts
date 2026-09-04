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
  },
});
