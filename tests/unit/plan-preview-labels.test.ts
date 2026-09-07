import { describe, expect, it, vi } from 'vitest';
import type { ProviderProcessingPin, RunBudgetCeilingState } from '../../src/shared/protocol.js';

// `src/renderer/index.ts` is the Electron renderer entry point, not a library: importing it observes
// `document.documentElement` and calls `window.ai7.getBookWorkbenchRoute()` immediately. Stub just
// enough of those globals before import so evaluation is inert, then import purely to reach the two
// exported Plan Preview label helpers — no DOM harness exists in this repository (neither jsdom nor
// happy-dom is resolved in the installed closure) to render the card itself.
vi.stubGlobal(
  'MutationObserver',
  class {
    observe(): void {}
    disconnect(): void {}
  },
);
vi.stubGlobal('document', { documentElement: { dataset: {}, style: {} }, querySelector: () => ({}) });
vi.stubGlobal('window', { ai7: { getBookWorkbenchRoute: () => new Promise<never>(() => {}) } });

const { providerProcessingLabel, runBudgetCeilingLabel } = await import('../../src/renderer/index.js');

describe('runBudgetCeilingLabel', () => {
  it('states unset for the development-ci reading and the token ceiling for a set developer-live ceiling', () => {
    expect(runBudgetCeilingLabel('unset' satisfies RunBudgetCeilingState)).toBe('未设置任务预算上限');
    expect(runBudgetCeilingLabel({ kind: 'tokens', maxTotalTokens: 250_000 } satisfies RunBudgetCeilingState))
      .toBe('任务运行预算上限：250000 tokens');
  });
});

describe('providerProcessingLabel', () => {
  it('renders the byte-identical development-ci reading J-03 pins today', () => {
    const pin: ProviderProcessingPin = { operationalScope: 'development-ci', version: 'v1', decision: 'deny', authorizedLiveTransmissionCount: 0 };
    expect(providerProcessingLabel(pin)).toBe('development-ci · v1 · 拒绝 · 0 次实时传输');
  });

  it('renders a developer-live pin with the bounded-by-run token verbatim', () => {
    const pin: ProviderProcessingPin = { operationalScope: 'developer-live', version: 'v4', decision: 'eligible-only', authorizedLiveTransmissionCount: 'bounded-by-run' };
    expect(providerProcessingLabel(pin)).toBe('developer-live · v4 · eligible-only · bounded-by-run 次实时传输');
  });
});
