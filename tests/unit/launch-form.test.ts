import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PROVIDER_CACHE_DIRECTORY, resolveDeveloperLiveLaunch } from '../../src/service/launch-policy.js';
import {
  PROVIDER_CACHE_ROOT_ARGUMENT,
  RUN_BUDGET_CEILING_ARGUMENT,
  RUN_BUDGET_CEILING_PATTERN,
  TRUSTED_SCOPE_ARGUMENT,
  parseTrustedLaunchForm,
} from '../../src/shared/protocol.js';

// The launch form is argv only (ADR 0065): the launcher, Electron main, and the service parse the same
// three arguments, and every invalid shape fails closed. No environment variable or setting is read.

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ABSOLUTE = process.platform === 'win32' ? 'C:\\ai7\\cache' : '/ai7/cache';

type BuiltLaunch = { parseBuiltLaunchArguments: (args: string[]) => { dataRoot: string; trustedOperationalScope: string; runBudgetCeiling: string | null; providerCacheRoot: string | null; forwarded: string[] } };

describe('parseTrustedLaunchForm', () => {
  it('names the three arguments and defaults to development-ci with no ceiling and no cache root', () => {
    expect([TRUSTED_SCOPE_ARGUMENT, RUN_BUDGET_CEILING_ARGUMENT, PROVIDER_CACHE_ROOT_ARGUMENT]).toEqual(['--trusted-operational-scope', '--run-budget-ceiling', '--provider-cache-root']);
    expect(parseTrustedLaunchForm({})).toEqual({ trustedOperationalScope: 'development-ci', runBudgetCeiling: null, providerCacheRoot: null });
    expect(parseTrustedLaunchForm({ trustedOperationalScope: 'development-ci' })).toEqual({ trustedOperationalScope: 'development-ci', runBudgetCeiling: null, providerCacheRoot: null });
  });

  it('accepts developer-live with an explicit ceiling and an absolute cache root', () => {
    expect(parseTrustedLaunchForm({ trustedOperationalScope: 'developer-live' })).toEqual({ trustedOperationalScope: 'developer-live', runBudgetCeiling: null, providerCacheRoot: null });
    expect(parseTrustedLaunchForm({ trustedOperationalScope: 'developer-live', runBudgetCeiling: '250000', providerCacheRoot: ABSOLUTE }))
      .toEqual({ trustedOperationalScope: 'developer-live', runBudgetCeiling: 250_000, providerCacheRoot: ABSOLUTE });
    expect(RUN_BUDGET_CEILING_PATTERN.test('500000')).toBe(true);
  });

  it('fails closed on an unknown or unselectable scope, a malformed ceiling, a relative root, or a ceiling without developer-live', () => {
    for (const scope of ['fixture-recording', 'ordinary-production', 'production', 'Developer-Live', ' developer-live', '']) {
      expect(parseTrustedLaunchForm({ trustedOperationalScope: scope })).toBeNull();
    }
    for (const ceiling of ['0', '-1', '01', '1.5', '1e6', '500_000', '500,000', 'unset', '', '1000000000000']) {
      expect(parseTrustedLaunchForm({ trustedOperationalScope: 'developer-live', runBudgetCeiling: ceiling })).toBeNull();
    }
    expect(parseTrustedLaunchForm({ trustedOperationalScope: 'developer-live', providerCacheRoot: 'relative/cache' })).toBeNull();
    expect(parseTrustedLaunchForm({ trustedOperationalScope: 'developer-live', providerCacheRoot: '' })).toBeNull();
    expect(parseTrustedLaunchForm({ runBudgetCeiling: '500000' })).toBeNull();
    expect(parseTrustedLaunchForm({ providerCacheRoot: ABSOLUTE })).toBeNull();
    expect(parseTrustedLaunchForm({ trustedOperationalScope: 'development-ci', runBudgetCeiling: '500000' })).toBeNull();
  });
});

describe('resolveDeveloperLiveLaunch', () => {
  const checkout = resolve(REPO_ROOT);

  it('binds the policy per-frozen-unit default ceiling and the sibling cache directory of the checkout', () => {
    const launch = resolveDeveloperLiveLaunch({ trustedOperationalScope: 'developer-live', runBudgetCeiling: null, providerCacheRoot: null }, checkout);
    // ADR 0070: 30,000 tokens per frozen Coverage Manifest unit, resolved once the manifest freezes.
    expect(launch.runBudgetCeiling).toEqual({ kind: 'tokens-per-frozen-unit', tokensPerFrozenUnit: 30_000 });
    expect(launch.providerCacheRoot).toBe(resolve(checkout, '..', DEFAULT_PROVIDER_CACHE_DIRECTORY));
    expect(DEFAULT_PROVIDER_CACHE_DIRECTORY).toBe('ai7-harness-provider-cache');
  });

  it('keeps an explicit ceiling and root, and never lets the root fall inside the checkout', () => {
    const outside = resolve(checkout, '..', 'elsewhere-cache');
    expect(resolveDeveloperLiveLaunch({ trustedOperationalScope: 'developer-live', runBudgetCeiling: 1_000, providerCacheRoot: outside }, checkout))
      .toEqual({ runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 1_000 }, providerCacheRoot: outside });
    for (const inside of [checkout, join(checkout, 'cache'), join(checkout, 'dist', 'cache')]) {
      expect(() => resolveDeveloperLiveLaunch({ trustedOperationalScope: 'developer-live', runBudgetCeiling: null, providerCacheRoot: inside }, checkout))
        .toThrowError(/PROVIDER_CACHE_ROOT_INSIDE_CHECKOUT/u);
    }
    expect(() => resolveDeveloperLiveLaunch({ trustedOperationalScope: 'development-ci', runBudgetCeiling: null, providerCacheRoot: null }, checkout)).toThrowError(/LAUNCH_FORM_INVALID/u);
    expect(() => resolveDeveloperLiveLaunch({ trustedOperationalScope: 'developer-live', runBudgetCeiling: null, providerCacheRoot: 'relative' }, checkout)).toThrowError(/LAUNCH_FORM_INVALID/u);
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
    expect(parseBuiltLaunchArguments(['--data-root', dataRoot, '--trusted-operational-scope', 'developer-live'])).toEqual({
      dataRoot, trustedOperationalScope: 'developer-live', runBudgetCeiling: null, providerCacheRoot: null, forwarded: ['--trusted-operational-scope', 'developer-live'],
    });
    expect(parseBuiltLaunchArguments(['--trusted-operational-scope', 'developer-live', '--run-budget-ceiling', '120000', '--provider-cache-root', ABSOLUTE, '--data-root', dataRoot]).forwarded)
      .toEqual(['--trusted-operational-scope', 'developer-live', '--run-budget-ceiling', '120000', '--provider-cache-root', ABSOLUTE]);
    for (const args of [
      [],
      ['--data-root', 'relative'],
      ['--data-root', dataRoot, '--data-root', dataRoot],
      ['--data-root', dataRoot, '--trusted-operational-scope', 'fixture-recording'],
      ['--data-root', dataRoot, '--trusted-operational-scope', 'ordinary-production'],
      ['--data-root', dataRoot, '--run-budget-ceiling', '1000'],
      ['--data-root', dataRoot, '--trusted-operational-scope', 'developer-live', '--run-budget-ceiling', '0'],
      ['--data-root', dataRoot, '--trusted-operational-scope', 'developer-live', '--provider-cache-root', 'relative'],
      ['--data-root', dataRoot, '--j04-model-adapter', 'x'],
      ['--data-root', dataRoot, '--trusted-operational-scope'],
    ]) {
      expect(() => parseBuiltLaunchArguments(args), args.join(' ')).toThrowError(/AI7_BUILT_LAUNCH_INVALID/u);
    }
  });
});
