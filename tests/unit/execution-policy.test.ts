import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { executionBackgroundShare, rateLimitRetryAllowed, EXECUTION_RUN_CAPACITY } from '../../src/service/analysis/execution.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';

describe('execution settings from the selected launch', () => {
  it('reads the v26 background share and retry count, with predecessor fallbacks and unchanged Run capacity', async () => {
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const production = await resolveSourceCheckoutLaunchPolicy(root, 'ordinary-production');
    expect(production.integrityState).toBe('verified');
    expect(EXECUTION_RUN_CAPACITY).toBe(2);
    expect(executionBackgroundShare(production, 5)).toBe(1);
    expect(rateLimitRetryAllowed(production)).toBe(true);
    const configured = structuredClone(production);
    configured.providerProcessing = { ...configured.providerProcessing,
      execution: { ...production.providerProcessing.execution!, backgroundShare: { configurable: true, default: 2 } },
      transport: { requestDeadlineSeconds: 180, rateLimitRetry: { honourRetryAfter: true, maxRetries: 0 } },
    };
    expect(executionBackgroundShare(configured, 5)).toBe(2);
    expect(rateLimitRetryAllowed(configured)).toBe(false);
    for (const scope of ['development-ci', 'developer-live'] as const) {
      const predecessor = await resolveSourceCheckoutLaunchPolicy(root, scope);
      expect(executionBackgroundShare(predecessor, 5)).toBe(4);
      expect(rateLimitRetryAllowed(predecessor)).toBe(true);
    }
  });
});
