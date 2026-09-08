import { describe, expect, it } from 'vitest';
import type { ProviderProcessingPin, RunBudgetCeilingState } from '../../src/shared/protocol.js';
import {
  RUN_LIVENESS_UNMEASURED_STALE_MS,
  attemptStateLabel,
  elapsedLabel,
  localInstantLabel,
  providerProcessingLabel,
  runBudgetCeilingLabel,
  runStepIsStale,
} from '../../src/renderer/plan-preview-labels.js';

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

describe('runStepIsStale', () => {
  // V2-UX-LIVE-003 states two thresholds and this is the whole of the stale rule: the measured bar
  // once the Run has settled a step, the fixed one only until then. Both are exclusive comparisons,
  // so a step exactly at the bar is still ordinary — the surface accuses nothing it has not measured.
  it('uses the fixed threshold only before this Run has settled a step', () => {
    expect(RUN_LIVENESS_UNMEASURED_STALE_MS).toBe(180_000);
    expect(runStepIsStale(179_999, null)).toBe(false);
    expect(runStepIsStale(180_000, null)).toBe(false);
    expect(runStepIsStale(180_001, null)).toBe(true);
  });

  it('measures against twice the longest settled step of this Run once one exists', () => {
    expect(runStepIsStale(200_000, 150_000)).toBe(false);
    expect(runStepIsStale(300_000, 150_000)).toBe(false);
    expect(runStepIsStale(300_001, 150_000)).toBe(true);
    // A Run of fast steps is judged by its own pace, not by the three-minute stand-in.
    expect(runStepIsStale(21_000, 10_000)).toBe(true);
    // And a Run of slow steps is not accused merely for passing three minutes.
    expect(runStepIsStale(240_000, 150_000)).toBe(false);
  });

  it('never reads a step at zero elapsed as stale', () => {
    expect(runStepIsStale(0, null)).toBe(false);
    expect(runStepIsStale(0, 150_000)).toBe(false);
  });
});

describe('elapsedLabel', () => {
  it('reads as mm:ss, floors partial seconds, and carries hours into the minutes place', () => {
    expect(elapsedLabel(0)).toBe('00:00');
    expect(elapsedLabel(999)).toBe('00:00');
    expect(elapsedLabel(1_000)).toBe('00:01');
    expect(elapsedLabel(90_500)).toBe('01:30');
    expect(elapsedLabel(3_723_000)).toBe('62:03');
  });

  it('never reads negative, so a clock that stepped backwards shows no minus sign', () => {
    expect(elapsedLabel(-5_000)).toBe('00:00');
  });
});

describe('attemptStateLabel', () => {
  it('names each Provider attempt state in the vocabulary of the Decision Layer', () => {
    expect(attemptStateLabel('dispatched')).toBe('已派发');
    expect(attemptStateLabel('awaiting-response')).toBe('等待模型响应');
    expect(attemptStateLabel('retrying')).toBe('安全重试中');
  });
});

describe('localInstantLabel', () => {
  it('renders an absolute local date and time to the second, never the ISO instant itself', () => {
    const at = new Date('2026-09-07T13:45:07.250Z');
    const label = localInstantLabel(at.toISOString());
    expect(label).toMatch(/^\d{4}\/\d{2}\/\d{2}\s\d{2}:\d{2}:\d{2}$/u);
    expect(label).not.toBe(at.toISOString());
    // The components are this host's local reading of that instant, not UTC re-printed.
    expect(label).toContain(String(at.getFullYear()));
    expect(label).toContain(`${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}:07`);
  });

  it('reads midnight as hour 00 rather than 24', () => {
    const midnight = new Date(2026, 8, 7, 0, 0, 0);
    expect(localInstantLabel(midnight.toISOString())).toMatch(/ 00:00:00$/u);
  });

  it('returns an unparsable value unchanged rather than inventing a time', () => {
    expect(localInstantLabel('not-an-instant')).toBe('not-an-instant');
  });
});
