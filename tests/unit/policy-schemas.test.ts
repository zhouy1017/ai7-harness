import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const POLICIES_DIR = resolve(ROOT, 'docs', 'policies');

type ValidatePoliciesModule = {
  discoverPolicyPairs: (policiesDir: string) => Array<{ policyFile: string; schemaFile: string }>;
  validateAllPolicies: (policiesDir: string) => Array<{ policyFile: string; ok: boolean; reason?: string }>;
  validatePolicyDocument: (policyData: unknown, schemaData: unknown) => void;
};

// @ts-expect-error tools/*.mjs carry no declarations; the tool is exercised as the plain module it is.
const { discoverPolicyPairs, validateAllPolicies, validatePolicyDocument } = (await import('../../tools/validate-policies.mjs')) as unknown as ValidatePoliciesModule;

function readPair(policyFile: string, schemaFile: string) {
  const policyData = JSON.parse(readFileSync(resolve(POLICIES_DIR, policyFile), 'utf8'));
  const schemaData = JSON.parse(readFileSync(resolve(POLICIES_DIR, schemaFile), 'utf8'));
  return { policyData, schemaData };
}

describe('validateAllPolicies', () => {
  it('discovers all sixteen current pairs and validates every one at this base', () => {
    const pairs = discoverPolicyPairs(POLICIES_DIR);
    expect(pairs).toHaveLength(16);

    const results = validateAllPolicies(POLICIES_DIR);
    expect(results).toHaveLength(16);
    for (const result of results) {
      expect(result.ok, `${result.policyFile}: ${result.reason ?? ''}`).toBe(true);
    }
  });
});

describe('validatePolicyDocument mutation failures', () => {
  it('fails with a message naming the offending path when a required property is removed', () => {
    const { policyData, schemaData } = readPair('active-policy-set.v1.json', 'active-policy-set.v1.schema.json');
    const mutated: Record<string, unknown> = { ...(policyData as Record<string, unknown>) };
    delete mutated.manifestType;

    expect(() => validatePolicyDocument(mutated, schemaData)).toThrowError(/Required property "manifestType" is missing at #\./);
  });

  it('fails with a message naming the offending path when an enum-constrained value is replaced', () => {
    const { policyData, schemaData } = readPair('active-policy-set.v1.json', 'active-policy-set.v1.schema.json');
    const mutated = { ...(policyData as Record<string, unknown>), digestAlgorithm: 'md5' };

    expect(() => validatePolicyDocument(mutated, schemaData)).toThrowError(
      /Value at #\/properties\/digestAlgorithm is not one of the enumerated values\./,
    );
  });

  it('rejects an External Export v2 document that drops one of the ADR 0079 §3.2 hard exclusions', () => {
    const { policyData, schemaData } = readPair('external-export-policy.v2.json', 'external-export-policy.v2.schema.json');
    const mutated = JSON.parse(JSON.stringify(policyData)) as { attachedContent: { hardExclusions: Record<string, unknown> } };
    delete mutated.attachedContent.hardExclusions.evidenceLinksNeverExport;

    expect(() => validatePolicyDocument(mutated, schemaData)).toThrowError(
      /Required property "evidenceLinksNeverExport" is missing/,
    );
  });

  it('rejects an External Export v2 document whose eligible target kinds are not the five of ADR 0079 §3.1', () => {
    const { policyData, schemaData } = readPair('external-export-policy.v2.json', 'external-export-policy.v2.schema.json');
    const mutated = JSON.parse(JSON.stringify(policyData)) as {
      decision: { allowRules: Array<{ target: { eligibleKinds: string[] } }> };
    };
    mutated.decision.allowRules[0]!.target.eligibleKinds[0] = 'delivery-package-version';

    expect(() => validatePolicyDocument(mutated, schemaData)).toThrowError(/is not one of the enumerated values/);
  });

  it('rejects a Provider Processing v7 document whose rule drops the ADR 0080 §7.5 platform tools', () => {
    const { policyData, schemaData } = readPair('provider-processing-policy.v7.json', 'provider-processing-policy.v7.schema.json');
    const mutated = JSON.parse(JSON.stringify(policyData)) as {
      decision: { providerAllowRules: Array<Record<string, unknown>> };
    };
    delete mutated.decision.providerAllowRules[0]!.platformTools;

    expect(() => validatePolicyDocument(mutated, schemaData)).toThrowError(
      /Required property "platformTools" is missing at #\/definitions\/developerLiveRule\./,
    );
  });

  it('rejects a Provider Processing v7 document that turns the web-search switch back off', () => {
    const { policyData, schemaData } = readPair('provider-processing-policy.v7.json', 'provider-processing-policy.v7.schema.json');
    const mutated = JSON.parse(JSON.stringify(policyData)) as {
      decision: { providerAllowRules: Array<{ transmissions: { webSearchToolAllowed: boolean } }> };
    };
    mutated.decision.providerAllowRules[0]!.transmissions.webSearchToolAllowed = false;

    expect(() => validatePolicyDocument(mutated, schemaData)).toThrowError(
      /Value at #\/definitions\/developerLiveRule\/properties\/transmissions does not equal the required const\./,
    );
  });
});

describe('Provider Processing v8 and active-policy-set v6 (Issue #473, S87-f3b)', () => {
  it('rejects a v8 document without its second, dialogue rule, and one with a third rule', () => {
    const { policyData, schemaData } = readPair('provider-processing-policy.v8.json', 'provider-processing-policy.v8.schema.json');
    const oneRule = JSON.parse(JSON.stringify(policyData)) as { decision: { providerAllowRules: unknown[] } };
    oneRule.decision.providerAllowRules.pop();
    expect(() => validatePolicyDocument(oneRule, schemaData)).toThrowError(/providerAllowRules/);
    const threeRules = JSON.parse(JSON.stringify(policyData)) as { decision: { providerAllowRules: unknown[] } };
    threeRules.decision.providerAllowRules.push(threeRules.decision.providerAllowRules[1]);
    expect(() => validatePolicyDocument(threeRules, schemaData)).toThrowError(/providerAllowRules/);
  });

  it('rejects a v8 document whose dialogue rule switches web search on (ADR 0088 §1.5)', () => {
    const { policyData, schemaData } = readPair('provider-processing-policy.v8.json', 'provider-processing-policy.v8.schema.json');
    const mutated = JSON.parse(JSON.stringify(policyData)) as {
      decision: { providerAllowRules: Array<{ transmissions: { webSearchToolAllowed: boolean } }> };
    };
    mutated.decision.providerAllowRules[1]!.transmissions.webSearchToolAllowed = true;
    expect(() => validatePolicyDocument(mutated, schemaData)).toThrowError(
      /Value at #\/definitions\/developerLiveDialogueRule\/properties\/transmissions does not equal the required const\./,
    );
  });

  it('rejects a v8 document whose analysis rule drops the ADR 0080 §7.5 platform tools or turns its switch off', () => {
    const { policyData, schemaData } = readPair('provider-processing-policy.v8.json', 'provider-processing-policy.v8.schema.json');
    const dropped = JSON.parse(JSON.stringify(policyData)) as { decision: { providerAllowRules: Array<Record<string, unknown>> } };
    delete dropped.decision.providerAllowRules[0]!.platformTools;
    expect(() => validatePolicyDocument(dropped, schemaData)).toThrowError(/Required property "platformTools" is missing at #\/definitions\/developerLiveRule\./);
    const off = JSON.parse(JSON.stringify(policyData)) as { decision: { providerAllowRules: Array<{ transmissions: { webSearchToolAllowed: boolean } }> } };
    off.decision.providerAllowRules[0]!.transmissions.webSearchToolAllowed = false;
    expect(() => validatePolicyDocument(off, schemaData)).toThrowError(/#\/definitions\/developerLiveRule\/properties\/transmissions does not equal the required const\./);
  });

  it('rejects an active-policy-set v6 whose developer-live pin still names v5', () => {
    const { policyData, schemaData } = readPair('active-policy-set.v6.json', 'active-policy-set.v6.schema.json');
    const mutated = JSON.parse(JSON.stringify(policyData)) as {
      activePolicies: { 'provider-processing-policy': { scopePins: { 'developer-live': { version: string; canonicalPath: string } } } };
    };
    const pin = mutated.activePolicies['provider-processing-policy'].scopePins['developer-live'];
    pin.version = 'v5';
    pin.canonicalPath = 'docs/policies/provider-processing-policy.v5.json';
    expect(() => validatePolicyDocument(mutated, schemaData)).toThrowError(/providerV8Pin/);
  });
});

describe('validatePolicyDocument unsupported keywords', () => {
  it('fails rather than passing when a schema carries a keyword outside the supported set', () => {
    const schemaData = {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: {
        name: { type: 'string' },
      },
      oneOf: [{ required: ['name'] }],
    };

    expect(() => validatePolicyDocument({ name: 'example' }, schemaData)).toThrowError(
      /Unsupported schema keyword "oneOf" at #\./,
    );
  });
});
