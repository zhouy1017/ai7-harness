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
  it('discovers all twelve current pairs and validates every one at this base', () => {
    const pairs = discoverPolicyPairs(POLICIES_DIR);
    expect(pairs).toHaveLength(12);

    const results = validateAllPolicies(POLICIES_DIR);
    expect(results).toHaveLength(12);
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
