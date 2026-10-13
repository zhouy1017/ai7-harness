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
  it('discovers all eighteen current and historical pairs and validates every one at this base', () => {
    const pairs = discoverPolicyPairs(POLICIES_DIR);
    expect(pairs).toHaveLength(18);

    const results = validateAllPolicies(POLICIES_DIR);
    expect(results).toHaveLength(18);
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

describe('Provider Processing v10 and active-set v8 schemas', () => {
  type Rules = { decision: { providerAllowRules: Array<Record<string, unknown>> } };

  it('rejects a v10 document with a fourth allow rule or without the dialogue rule', () => {
    const { policyData, schemaData } = readPair('provider-processing-policy.v10.json', 'provider-processing-policy.v10.schema.json');
    const widened = JSON.parse(JSON.stringify(policyData)) as Rules;
    widened.decision.providerAllowRules.push(JSON.parse(JSON.stringify(widened.decision.providerAllowRules[2])));
    expect(() => validatePolicyDocument(widened, schemaData)).toThrowError(/has more than 3 allowed items/);

    const narrowed = JSON.parse(JSON.stringify(policyData)) as Rules;
    narrowed.decision.providerAllowRules.splice(1, 1);
    expect(() => validatePolicyDocument(narrowed, schemaData)).toThrowError();
  });

  it('rejects a v10 review rule that admits a web-bearing category, and a dialogue rule that turns web search on', () => {
    const { policyData, schemaData } = readPair('provider-processing-policy.v10.json', 'provider-processing-policy.v10.schema.json');
    const review = JSON.parse(JSON.stringify(policyData)) as Rules;
    (review.decision.providerAllowRules[2]!.allowedTaskKinds as string[]).push('editorial-review/factual-review');
    expect(() => validatePolicyDocument(review, schemaData)).toThrowError(/developerLiveReviewRule\/properties\/allowedTaskKinds does not equal the required const/);

    const dialogue = JSON.parse(JSON.stringify(policyData)) as Rules;
    (dialogue.decision.providerAllowRules[1]!.transmissions as Record<string, unknown>).webSearchToolAllowed = true;
    expect(() => validatePolicyDocument(dialogue, schemaData)).toThrowError(/developerLiveDialogueRule\/properties\/transmissions does not equal the required const/);
  });

  it('rejects a v10 document that binds the escalation role by default', () => {
    const { policyData, schemaData } = readPair('provider-processing-policy.v10.json', 'provider-processing-policy.v10.schema.json');
    const mutated = JSON.parse(JSON.stringify(policyData)) as { roleBindings: Record<string, Record<string, unknown>> };
    mutated.roleBindings['Difficult Escalation Role']!.bindingState = 'bound';
    expect(() => validatePolicyDocument(mutated, schemaData)).toThrowError(/roleBindings does not equal the required const/);
  });

  it('rejects an active-set v8 whose developer-live pin is not the exact v10 digest', () => {
    const { policyData, schemaData } = readPair('active-policy-set.v8.json', 'active-policy-set.v8.schema.json');
    const mutated = JSON.parse(JSON.stringify(policyData)) as {
      activePolicies: { 'provider-processing-policy': { scopePins: Record<string, Record<string, unknown>> } };
    };
    mutated.activePolicies['provider-processing-policy'].scopePins['developer-live']!.version = 'v9';
    expect(() => validatePolicyDocument(mutated, schemaData)).toThrowError(/does not equal the required const/);
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
