import { defineConfig } from 'vitest/config';

// Runs only the large-manuscript baseline of Issue #1557. `vitest.config.ts` includes `tests/**/*.test.ts`, so the `.bench.ts`
// script is in no ladder layer; this configuration is its one entry point. A run takes minutes to hours at 46,000 paragraphs.
export default defineConfig({
  test: {
    include: ['tests/service/large-manuscript-baseline.bench.ts'],
    environment: 'node',
    setupFiles: ['tests/support/development-renderer.ts'],
    isolate: true,
    reporters: ['default'],
    watch: false,
    testTimeout: 6 * 60 * 60 * 1000,
    hookTimeout: 60 * 60 * 1000,
  },
});
