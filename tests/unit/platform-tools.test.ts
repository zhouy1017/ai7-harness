import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PLATFORM_TOOL_NAMES,
  PLATFORM_TOOL_ROUND_TRIP_BREAKER,
  PLATFORM_TOOL_SCHEMAS,
  PlatformToolBreaker,
  PlatformToolsRuleError,
  canonicalPublicUrl,
  canonicalToolArguments,
  isConfiguredPlatformTools,
  readPlatformToolsRule,
  toolArgumentsDigest,
  toolSetEqualsRule,
  type PlatformToolsRule,
} from '../../src/service/provider/platform-tools.js';

// The platform tools' policy reading (Issue #473, S87-f3a), over the real Policy Document bytes: the selected
// developer-live document (Provider Processing v5) names no platform tools, so every consumer of the rule refuses; the
// reviewed-but-unselected v7 names them exactly as ADR 0080 §7.5 writes them.

const REPO_ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));

async function rulesOf(version: string): Promise<unknown[]> {
  const document = JSON.parse(await readFile(resolve(REPO_ROOT, `docs/policies/provider-processing-policy.${version}.json`), 'utf8')) as {
    decision: { providerAllowRules?: unknown[] };
  };
  return document.decision.providerAllowRules ?? [];
}

describe('readPlatformToolsRule', () => {
  it('reads no platform tools from any rule of the selected documents, v5 included', async () => {
    for (const version of ['v1', 'v5', 'v6']) {
      for (const rule of await rulesOf(version)) expect(readPlatformToolsRule(rule)).toBeNull();
    }
    const [v5] = await rulesOf('v5');
    expect((v5 as { transmissions: { webSearchToolAllowed: boolean } }).transmissions.webSearchToolAllowed).toBe(false);
  });

  it('reads the v7 block exactly, and only while the rule\'s switch is on', async () => {
    const [v7] = await rulesOf('v7');
    expect(readPlatformToolsRule(v7)).toEqual({
      websearch: { service: 'parallel', host: 'search.parallel.ai', tool: 'web_search', anonymous: true },
      webfetch: { maxBytes: 5_242_880, timeoutSeconds: 30, boundedByCitations: true },
    });
    const switchedOff = { ...(v7 as Record<string, unknown>), transmissions: { webSearchToolAllowed: false } };
    expect(readPlatformToolsRule(switchedOff)).toBeNull();
    const withoutBlock = { ...(v7 as Record<string, unknown>), platformTools: undefined };
    delete (withoutBlock as Record<string, unknown>).platformTools;
    expect(readPlatformToolsRule(withoutBlock)).toBeNull();
  });

  it('refuses a malformed block rather than reading it as none', async () => {
    const [v7] = await rulesOf('v7');
    const block = (v7 as { platformTools: { websearch: Record<string, unknown>; webfetch: Record<string, unknown> } }).platformTools;
    const variants: unknown[] = [
      { websearch: block.websearch },
      { ...block, extra: {} },
      { ...block, websearch: { ...block.websearch, anonymous: false } },
      { ...block, websearch: { ...block.websearch, host: 'https://search.parallel.ai' } },
      { ...block, websearch: { ...block.websearch, host: 'localhost' } },
      { ...block, websearch: { ...block.websearch, credential: 'x' } },
      { ...block, webfetch: { ...block.webfetch, maxBytes: 0 } },
      { ...block, webfetch: { ...block.webfetch, timeoutSeconds: 1.5 } },
      { ...block, webfetch: { ...block.webfetch, boundedByCitations: false } },
    ];
    for (const platformTools of variants) {
      expect(() => readPlatformToolsRule({ ...(v7 as Record<string, unknown>), platformTools })).toThrowError(/platformTools|websearch|webfetch/u);
    }
  });
});

// The generalized block of Provider Processing v16 (developer-live) and v17 (ordinary-production), slice 6d of Issue #473: the
// user selects one of the shipped, keyed backends; the v7 single-anonymous shape above stays readable.
describe('readPlatformToolsRule over the generalized v16 and v17 block', () => {
  const RANKED = ['search-tinyfish', 'search-deepseek', 'search-brave', 'search-parallel', 'search-bochaai'];
  const research = (rules: unknown[]) => rules.filter((rule) => (rule as { transmissions: { webSearchToolAllowed: boolean } }).transmissions.webSearchToolAllowed);

  it('reads the three research rules of each document, with the backends in ranking order, and nothing from the other five', async () => {
    for (const [version, production] of [['v16', false], ['v17', true]] as const) {
      const rules = await rulesOf(version);
      expect(research(rules)).toHaveLength(3);
      for (const rule of rules) {
        const reading = readPlatformToolsRule(rule);
        if (!research([rule]).length) {
          expect(reading, version).toBeNull();
          continue;
        }
        expect(reading !== null && isConfiguredPlatformTools(reading)).toBe(true);
        if (reading === null || !isConfiguredPlatformTools(reading)) continue;
        expect(reading.websearch.selection).toBe('user-configured');
        expect(reading.websearch.selectionRequiresCredential).toBe(production);
        expect(reading.websearch.backends.map((backend) => backend.id)).toEqual(RANKED);
        for (const backend of reading.websearch.backends) {
          expect(backend.anonymous).toBe(false);
          expect(backend.credentialSlot).toBe(backend.id);
          expect(new URL(backend.endpoint).hostname).toBe(backend.host);
          expect(backend.developmentCredentialReference === null).toBe(production);
        }
        expect(reading.webfetch).toEqual({ maxBytes: 5_242_880, timeoutSeconds: 30, boundedByCitations: true });
        expect(reading.breaker).toEqual({ roundTrips: PLATFORM_TOOL_ROUND_TRIP_BREAKER, end: '联网核查未完成' });
        expect(reading.oneQueryPerRunUnit).toBe(true);
        expect(reading.toolResultCategory).toBe('public-or-synthetic');
      }
    }
  });

  it('keeps the v7 shape readable as the single anonymous service, not the generalized one', async () => {
    const reading = readPlatformToolsRule((await rulesOf('v7'))[0]);
    expect(reading !== null && isConfiguredPlatformTools(reading)).toBe(false);
  });

  it('refuses a malformed generalized block rather than reading it as none', async () => {
    for (const version of ['v16', 'v17']) {
      const rule = research(await rulesOf(version))[0] as Record<string, unknown> & { platformTools: Record<string, unknown> & { websearch: Record<string, unknown> } };
      const block = rule.platformTools;
      const search = block.websearch;
      const [first, ...rest] = search['backends'] as Array<Record<string, unknown>>;
      const variants: unknown[] = [
        { ...block, breaker: undefined },
        { ...block, extra: true },
        { ...block, oneQueryPerRunUnit: false },
        { ...block, toolResultCategory: 'unpublished-excerpts' },
        { ...block, breaker: { roundTrips: 0, end: '联网核查未完成' } },
        { ...block, breaker: { roundTrips: 128, end: '' } },
        { ...block, webfetch: { maxBytes: 5_242_880, timeoutSeconds: 30, boundedByCitations: false } },
        { ...block, websearch: { ...search, selection: 'fixed' } },
        { ...block, websearch: { ...search, backends: [] } },
        { ...block, websearch: { ...search, backends: [first, first, ...rest] } },
        { ...block, websearch: { ...search, backends: [{ ...first, anonymous: true }, ...rest] } },
        { ...block, websearch: { ...search, backends: [{ ...first, host: 'localhost' }, ...rest] } },
        { ...block, websearch: { ...search, backends: [{ ...first, endpoint: 'http://api.search.tinyfish.ai/' }, ...rest] } },
        { ...block, websearch: { ...search, backends: [{ ...first, endpoint: 'https://elsewhere.example.com/' }, ...rest] } },
        { ...block, websearch: { ...search, backends: [{ ...first, id: 'tinyfish' }, ...rest] } },
        { ...block, websearch: { ...search, backends: [{ ...first, credential: 'x' }, ...rest] } },
        version === 'v16'
          ? { ...block, websearch: { ...search, backends: [{ ...first, developmentCredentialReference: 'not-a-reference' }, ...rest] } }
          : { ...block, websearch: { ...search, userConfiguredBackendAuthorizesTransmission: true } },
        version === 'v16'
          ? { ...block, websearch: { ...search, selectionRequiresCredential: true } }
          : { ...block, websearch: { ...search, selectionRequiresCredential: false } },
      ];
      for (const platformTools of variants) {
        expect(() => readPlatformToolsRule({ ...rule, platformTools: JSON.parse(JSON.stringify(platformTools)) as unknown }), JSON.stringify(platformTools).slice(0, 120))
          .toThrow(PlatformToolsRuleError);
      }
    }
  });
});

describe('the platform tool set', () => {
  it('equals the rule only for exactly the two schemas, in any order', async () => {
    const rule = readPlatformToolsRule((await rulesOf('v7'))[0]) as PlatformToolsRule | null;
    expect(PLATFORM_TOOL_SCHEMAS.map((tool) => tool.name)).toEqual([...PLATFORM_TOOL_NAMES]);
    const exact = PLATFORM_TOOL_SCHEMAS.map((tool) => JSON.parse(JSON.stringify(tool)) as Record<string, unknown>);
    expect(toolSetEqualsRule(exact, rule)).toBe(true);
    expect(toolSetEqualsRule([...exact].reverse(), rule)).toBe(true);
    // A rule naming none matches no tool set at all.
    expect(toolSetEqualsRule(exact, null)).toBe(false);
    expect(toolSetEqualsRule([exact[0]!], rule)).toBe(false);
    expect(toolSetEqualsRule([...exact, { name: 'shell', description: '', parameters: {} }], rule)).toBe(false);
    expect(toolSetEqualsRule([{ ...exact[0], description: '另一段说明' }, exact[1]], rule)).toBe(false);
    expect(toolSetEqualsRule([{ ...exact[0], parameters: { type: 'object' } }, exact[1]], rule)).toBe(false);
    expect(toolSetEqualsRule([{ ...exact[0], strict: true }, exact[1]], rule)).toBe(false);
    expect(toolSetEqualsRule([exact[0], exact[0]], rule)).toBe(false);
  });
});

describe('canonical tool arguments', () => {
  it('normalizes a query and refuses anything that is not one', () => {
    expect(canonicalToolArguments('websearch', { query: '  鲁迅 1918 年 狂人日记  ' })).toEqual({ tool: 'websearch', query: '鲁迅 1918 年 狂人日记' });
    expect(canonicalToolArguments('websearch', { query: 'é' })).toEqual({ tool: 'websearch', query: 'é' });
    expect(canonicalToolArguments('websearch', { query: '   ' })).toBeNull();
    expect(canonicalToolArguments('websearch', { query: 'x'.repeat(1_001) })).toBeNull();
    expect(canonicalToolArguments('websearch', { query: 'a', extra: 1 })).toBeNull();
    expect(canonicalToolArguments('websearch', { q: 'a' })).toBeNull();
    expect(canonicalToolArguments('websearch', 'a')).toBeNull();
    expect(canonicalToolArguments('shell', { query: 'a' })).toBeNull();
  });

  it('admits only absolute public https URLs, serialized one way', () => {
    expect(canonicalToolArguments('webfetch', { url: 'https://Example.org/a?b=1#frag' })).toEqual({ tool: 'webfetch', url: 'https://example.org/a?b=1' });
    expect(canonicalPublicUrl('https://example.org:443/')).toBe('https://example.org/');
    for (const refused of [
      'http://example.org/', 'https://user:pass@example.org/', 'https://127.0.0.1/', 'https://localhost/', 'https://a.localhost/',
      'https://example.org:8443/', 'https://[::1]/', 'file:///etc/hosts', 'not a url', 'https://single/',
      'https://foo.local/', 'https://metadata.google.internal/x', 'https://router.home.arpa/', 'https://localhost./',
    ]) {
      expect(canonicalPublicUrl(refused)).toBeNull();
    }
    expect(canonicalToolArguments('webfetch', { url: 'https://example.org/', extra: true })).toBeNull();
  });

  it('digests equal arguments equally and different ones differently', () => {
    const one = canonicalToolArguments('websearch', { query: ' a ' })!;
    const two = canonicalToolArguments('websearch', { query: 'a' })!;
    expect(toolArgumentsDigest(one)).toBe(toolArgumentsDigest(two));
    expect(toolArgumentsDigest(one)).not.toBe(toolArgumentsDigest(canonicalToolArguments('websearch', { query: 'b' })!));
    expect(toolArgumentsDigest(one)).toMatch(/^[0-9a-f]{64}$/u);
  });
});

describe('PlatformToolBreaker', () => {
  it('refuses an identical call within a unit, trips past the breaker, and starts each unit intact', () => {
    const breaker = new PlatformToolBreaker(3);
    expect(breaker.observe('a')).toBe('admit');
    expect(breaker.observe('a')).toBe('duplicate');
    expect(breaker.observe('b')).toBe('admit');
    expect(breaker.state).toBe('intact');
    expect(breaker.observe('c')).toBe('tripped');
    expect(breaker.state).toBe('tripped');
    expect(breaker.observe('d')).toBe('tripped');
    breaker.startUnit();
    expect(breaker.state).toBe('intact');
    expect(breaker.observe('a')).toBe('admit');
    expect(() => new PlatformToolBreaker(0)).toThrowError(/PLATFORM_TOOL_BREAKER_INVALID/u);
    expect(PLATFORM_TOOL_ROUND_TRIP_BREAKER).toBe(128);
  });
});
