import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PROVIDER_CACHE_DIRECTORY, resolveDeveloperLiveLaunch } from '../../src/service/launch-policy.js';
import { resolveDeveloperLiveCeiling } from '../../src/service/analysis/baseline-analysis-store.js';
import {
  PROVIDER_CACHE_ROOT_ARGUMENT,
  RUN_BUDGET_CEILING_ARGUMENT,
  RUN_BUDGET_CEILING_PATTERN,
  TRUSTED_SCOPE_ARGUMENT,
  VALIDATION_CASE_ARGUMENT,
  VALIDATION_DELTA_ARGUMENT,
  parseTrustedLaunchForm,
  parseValidationCase,
  parseValidationDelta,
  type DeveloperLiveCeiling,
  type DevelopmentValidationIntent,
} from '../../src/shared/protocol.js';

// The launch form is argv only (ADR 0065): the launcher, Electron main, and the service parse the same
// arguments, and every invalid shape fails closed — since Issue #808 a developer-live launch that names no
// development validation among them. No environment variable or setting is read.

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ABSOLUTE = process.platform === 'win32' ? 'C:\\ai7\\cache' : '/ai7/cache';

type BuiltLaunch = { parseBuiltLaunchArguments: (args: string[]) => { dataRoot: string; trustedOperationalScope: string; runBudgetCeiling: string | null; providerCacheRoot: string | null; forwarded: string[] } };

const VALIDATION_CASE = 'baseline-analysis/sample1-whole-book';
const INTENT: DevelopmentValidationIntent = { family: 'baseline-analysis', case: 'sample1-whole-book', delta: null };

describe('parseTrustedLaunchForm', () => {
  it('names the three arguments and defaults to development-ci with no ceiling and no cache root', () => {
    expect([TRUSTED_SCOPE_ARGUMENT, RUN_BUDGET_CEILING_ARGUMENT, PROVIDER_CACHE_ROOT_ARGUMENT]).toEqual(['--trusted-operational-scope', '--run-budget-ceiling', '--provider-cache-root']);
    expect(parseTrustedLaunchForm({})).toEqual({ trustedOperationalScope: 'development-ci', runBudgetCeiling: null, providerCacheRoot: null, validation: null });
    expect(parseTrustedLaunchForm({ trustedOperationalScope: 'development-ci' })).toEqual({ trustedOperationalScope: 'development-ci', runBudgetCeiling: null, providerCacheRoot: null, validation: null });
  });

  it('accepts developer-live naming its development validation, with an explicit ceiling and an absolute cache root', () => {
    expect([VALIDATION_CASE_ARGUMENT, VALIDATION_DELTA_ARGUMENT]).toEqual(['--validation-case', '--validation-delta']);
    expect(parseTrustedLaunchForm({ trustedOperationalScope: 'developer-live', validationCase: 'baseline-analysis/sample1-whole-book' })).toEqual({
      trustedOperationalScope: 'developer-live', runBudgetCeiling: null, providerCacheRoot: null,
      validation: { family: 'baseline-analysis', case: 'sample1-whole-book', delta: null },
    });
    expect(parseTrustedLaunchForm({ trustedOperationalScope: 'developer-live', runBudgetCeiling: '250000', providerCacheRoot: ABSOLUTE, validationCase: VALIDATION_CASE, validationDelta: 'input:edited-chapter-dialogue' }))
      .toEqual({ trustedOperationalScope: 'developer-live', runBudgetCeiling: 250_000, providerCacheRoot: ABSOLUTE,
        validation: { family: 'baseline-analysis', case: 'sample1-whole-book', delta: { kind: 'input', rationale: 'edited-chapter-dialogue' } } });
    expect(parseTrustedLaunchForm({ trustedOperationalScope: 'developer-live', validationCase: VALIDATION_CASE, validationDelta: 'retry-unknown:gateway-dropped-answer' })!.validation!.delta)
      .toEqual({ kind: 'retry-unknown', rationale: 'gateway-dropped-answer' });
    expect(RUN_BUDGET_CEILING_PATTERN.test('500000')).toBe(true);
    expect(parseValidationCase('run-report/unknown-retry')).toEqual({ family: 'run-report', case: 'unknown-retry' });
  });

  it('refuses a developer-live launch that names no validation, a purpose named by numbering, or a delta without substance (Issue #808)', () => {
    expect(parseTrustedLaunchForm({ trustedOperationalScope: 'developer-live' })).toBeNull();
    for (const named of ['baseline-analysis', 'baseline-analysis/', '/sample1', 'a/b/c', 'Baseline/sample1', 'baseline_analysis/sample1',
      'baseline-analysis/issue-808', 'baseline-analysis/run-3', 's40/sample1', 'baseline-analysis/sample1-attempt-2', 'baseline-analysis/808',
      'baseline-analysis/pr-817', 'baseline-analysis/sample1--whole', `baseline-analysis/${'x'.repeat(49)}`]) {
      expect(parseValidationCase(named), named).toBeNull();
      expect(parseTrustedLaunchForm({ trustedOperationalScope: 'developer-live', validationCase: named }), named).toBeNull();
    }
    for (const delta of ['input', 'input:', 'input:x', 'input:rename', 'cosmetic:new-wording-only', 'input:retry-2', 'retry-unknown:issue-808-again', 'INPUT:edited-text']) {
      expect(parseValidationDelta(delta), delta).toBeNull();
      expect(parseTrustedLaunchForm({ trustedOperationalScope: 'developer-live', validationCase: VALIDATION_CASE, validationDelta: delta }), delta).toBeNull();
    }
    expect(parseTrustedLaunchForm({ validationCase: VALIDATION_CASE })).toBeNull();
    expect(parseTrustedLaunchForm({ trustedOperationalScope: 'development-ci', validationDelta: 'input:edited-chapter-dialogue' })).toBeNull();
  });

  it('fails closed on an unknown or unselectable scope, a malformed ceiling, a relative root, or a ceiling without developer-live', () => {
    for (const scope of ['fixture-recording', 'production', 'Developer-Live', 'Ordinary-Production', ' developer-live', ' ordinary-production', '']) {
      expect(parseTrustedLaunchForm({ trustedOperationalScope: scope })).toBeNull();
    }
    for (const ceiling of ['0', '-1', '01', '1.5', '1e6', '500_000', '500,000', 'unset', '', '1000000000000']) {
      expect(parseTrustedLaunchForm({ trustedOperationalScope: 'developer-live', runBudgetCeiling: ceiling, validationCase: VALIDATION_CASE })).toBeNull();
    }
    expect(parseTrustedLaunchForm({ trustedOperationalScope: 'developer-live', providerCacheRoot: 'relative/cache', validationCase: VALIDATION_CASE })).toBeNull();
    expect(parseTrustedLaunchForm({ trustedOperationalScope: 'developer-live', providerCacheRoot: '', validationCase: VALIDATION_CASE })).toBeNull();
    expect(parseTrustedLaunchForm({ runBudgetCeiling: '500000' })).toBeNull();
    expect(parseTrustedLaunchForm({ providerCacheRoot: ABSOLUTE })).toBeNull();
    expect(parseTrustedLaunchForm({ trustedOperationalScope: 'development-ci', runBudgetCeiling: '500000' })).toBeNull();
  });

  it('selects ordinary-production only by its explicit argument, with none of the developer-live launch facts (Issue #853)', () => {
    // Absent arguments still select development-ci; ordinary-production is never a default.
    expect(parseTrustedLaunchForm({})?.trustedOperationalScope).toBe('development-ci');
    expect(parseTrustedLaunchForm({ trustedOperationalScope: 'ordinary-production' })).toEqual({
      trustedOperationalScope: 'ordinary-production', runBudgetCeiling: null, providerCacheRoot: null, validation: null,
    });
    for (const extra of [{ runBudgetCeiling: '500000' }, { providerCacheRoot: ABSOLUTE }, { validationCase: VALIDATION_CASE }, { validationDelta: 'input:edited-chapter-dialogue' }]) {
      expect(parseTrustedLaunchForm({ trustedOperationalScope: 'ordinary-production', ...extra })).toBeNull();
    }
  });
});

describe('resolveDeveloperLiveLaunch', () => {
  const checkout = resolve(REPO_ROOT);

  it('binds the policy per-frozen-unit default ceiling and the sibling cache directory of the checkout', () => {
    const launch = resolveDeveloperLiveLaunch({ trustedOperationalScope: 'developer-live', runBudgetCeiling: null, providerCacheRoot: null, validation: INTENT }, checkout);
    expect(launch.validation).toEqual(INTENT);
    // ADR 0070: 30,000 tokens per frozen Coverage Manifest unit, resolved once the manifest freezes.
    expect(launch.runBudgetCeiling).toEqual({ kind: 'tokens-per-frozen-unit', tokensPerFrozenUnit: 30_000 });
    expect(launch.providerCacheRoot).toBe(resolve(checkout, '..', DEFAULT_PROVIDER_CACHE_DIRECTORY));
    expect(DEFAULT_PROVIDER_CACHE_DIRECTORY).toBe('ai7-harness-provider-cache');
  });

  it('keeps an explicit ceiling and root, and never lets the root fall inside the checkout', () => {
    const outside = resolve(checkout, '..', 'elsewhere-cache');
    expect(resolveDeveloperLiveLaunch({ trustedOperationalScope: 'developer-live', runBudgetCeiling: 1_000, providerCacheRoot: outside, validation: INTENT }, checkout))
      .toEqual({ runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 1_000 }, providerCacheRoot: outside, validation: INTENT });
    for (const inside of [checkout, join(checkout, 'cache'), join(checkout, 'dist', 'cache')]) {
      expect(() => resolveDeveloperLiveLaunch({ trustedOperationalScope: 'developer-live', runBudgetCeiling: null, providerCacheRoot: inside, validation: INTENT }, checkout))
        .toThrowError(/PROVIDER_CACHE_ROOT_INSIDE_CHECKOUT/u);
    }
    expect(() => resolveDeveloperLiveLaunch({ trustedOperationalScope: 'development-ci', runBudgetCeiling: null, providerCacheRoot: null, validation: null }, checkout)).toThrowError(/LAUNCH_FORM_INVALID/u);
    expect(() => resolveDeveloperLiveLaunch({ trustedOperationalScope: 'developer-live', runBudgetCeiling: null, providerCacheRoot: 'relative', validation: INTENT }, checkout)).toThrowError(/LAUNCH_FORM_INVALID/u);
    // A developer-live launch that names no development validation never reaches a Run (Issue #808).
    expect(() => resolveDeveloperLiveLaunch({ trustedOperationalScope: 'developer-live', runBudgetCeiling: null, providerCacheRoot: null, validation: null }, checkout)).toThrowError(/LAUNCH_VALIDATION_INTENT_REQUIRED/u);
  });
});

/*
 * The other half of the same ceiling: the launch binds the formula, and this resolves it against the
 * Run's own frozen Coverage Manifest unit count (ADR 0070, ADR 0079 §2.3). The store calls it once the
 * manifest is frozen and before the plan is, so the plan carries a total and nothing re-derives one at
 * dispatch.
 */
describe('resolveDeveloperLiveCeiling', () => {
  it('passes an explicit total through unchanged, whatever the unit count is', () => {
    const explicit: DeveloperLiveCeiling = { kind: 'tokens', maxTotalTokens: 250_000 };
    expect(resolveDeveloperLiveCeiling(explicit, 8)).toEqual({ kind: 'tokens', maxTotalTokens: 250_000 });
    expect(resolveDeveloperLiveCeiling(explicit, 1)).toEqual({ kind: 'tokens', maxTotalTokens: 250_000 });
  });

  it('multiplies the per-frozen-unit default by the frozen unit count of this Run', () => {
    const perUnit: DeveloperLiveCeiling = { kind: 'tokens-per-frozen-unit', tokensPerFrozenUnit: 30_000 };
    // A manuscript of eight units and one of three get different totals from the same bound default:
    // the ceiling sizes with the work, which is the whole point of the per-unit form.
    expect(resolveDeveloperLiveCeiling(perUnit, 8)).toEqual({ kind: 'tokens', maxTotalTokens: 240_000 });
    expect(resolveDeveloperLiveCeiling(perUnit, 3)).toEqual({ kind: 'tokens', maxTotalTokens: 90_000 });
    // The policy default itself is the one `resolveDeveloperLiveLaunch` binds, not a second constant.
    const bound = resolveDeveloperLiveLaunch({ trustedOperationalScope: 'developer-live', runBudgetCeiling: null, providerCacheRoot: null, validation: INTENT }, resolve(REPO_ROOT)).runBudgetCeiling;
    expect(resolveDeveloperLiveCeiling(bound, 8)).toEqual({ kind: 'tokens', maxTotalTokens: 240_000 });
  });
});

describe('start-built launch arguments', () => {
  it('accepts exactly the data root plus the optional developer-live form and forwards only what was given', async () => {
    // @ts-expect-error tools/*.mjs carry no declarations; the launcher's parser is exercised as the plain module it is.
    const launcher: unknown = await import('../../tools/start-built.mjs');
    const { parseBuiltLaunchArguments } = launcher as BuiltLaunch;
    const dataRoot = process.platform === 'win32' ? 'C:\\ai7\\data' : '/ai7/data';
    expect(parseBuiltLaunchArguments(['--data-root', dataRoot])).toEqual({
      dataRoot, trustedOperationalScope: 'development-ci', runBudgetCeiling: null, providerCacheRoot: null, forwarded: [],
    });
    expect(parseBuiltLaunchArguments(['--data-root', dataRoot, '--trusted-operational-scope', 'developer-live', '--validation-case', VALIDATION_CASE])).toEqual({
      dataRoot, trustedOperationalScope: 'developer-live', runBudgetCeiling: null, providerCacheRoot: null,
      forwarded: ['--trusted-operational-scope', 'developer-live', '--validation-case', VALIDATION_CASE],
    });
    expect(parseBuiltLaunchArguments(['--trusted-operational-scope', 'developer-live', '--run-budget-ceiling', '120000', '--provider-cache-root', ABSOLUTE,
      '--validation-delta', 'input:edited-chapter-dialogue', '--validation-case', VALIDATION_CASE, '--data-root', dataRoot]).forwarded)
      .toEqual(['--trusted-operational-scope', 'developer-live', '--run-budget-ceiling', '120000', '--provider-cache-root', ABSOLUTE,
        '--validation-case', VALIDATION_CASE, '--validation-delta', 'input:edited-chapter-dialogue']);
    for (const args of [
      [],
      ['--data-root', 'relative'],
      ['--data-root', dataRoot, '--data-root', dataRoot],
      ['--data-root', dataRoot, '--trusted-operational-scope', 'fixture-recording'],
      ['--data-root', dataRoot, '--trusted-operational-scope', 'ordinary-production', '--run-budget-ceiling', '1000'],
      ['--data-root', dataRoot, '--run-budget-ceiling', '1000'],
      ['--data-root', dataRoot, '--trusted-operational-scope', 'developer-live'],
      ['--data-root', dataRoot, '--trusted-operational-scope', 'developer-live', '--validation-case', 'Baseline'],
      ['--data-root', dataRoot, '--trusted-operational-scope', 'developer-live', '--validation-case', VALIDATION_CASE, '--validation-delta', 'cosmetic:x'],
      ['--data-root', dataRoot, '--validation-case', VALIDATION_CASE],
      ['--data-root', dataRoot, '--trusted-operational-scope', 'developer-live', '--validation-case', VALIDATION_CASE, '--run-budget-ceiling', '0'],
      ['--data-root', dataRoot, '--trusted-operational-scope', 'developer-live', '--validation-case', VALIDATION_CASE, '--provider-cache-root', 'relative'],
      ['--data-root', dataRoot, '--j04-model-adapter', 'x'],
      ['--data-root', dataRoot, '--trusted-operational-scope'],
    ]) {
      expect(() => parseBuiltLaunchArguments(args), args.join(' ')).toThrowError(/AI7_BUILT_LAUNCH_INVALID/u);
    }
  });
});
