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
  it('discovers all twenty-three current and historical pairs and validates every one at this base', () => {
    const pairs = discoverPolicyPairs(POLICIES_DIR);
    expect(pairs).toHaveLength(23);

    const results = validateAllPolicies(POLICIES_DIR);
    expect(results).toHaveLength(23);
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

describe('Provider Processing v11 and active-set v9 schemas', () => {
  type Rules = { decision: { providerAllowRules: Array<Record<string, unknown>> } };
  const pair = () => readPair('provider-processing-policy.v11.json', 'provider-processing-policy.v11.schema.json');
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

  it('validates the seven-rule tuple and rejects an eighth rule or a missing one', () => {
    const { policyData, schemaData } = pair();
    expect(() => validatePolicyDocument(policyData, schemaData)).not.toThrow();
    const widened = clone(policyData) as Rules;
    widened.decision.providerAllowRules.push(clone(widened.decision.providerAllowRules[5]!));
    expect(() => validatePolicyDocument(widened, schemaData)).toThrowError(/has more than 7 allowed items/);
    const narrowed = clone(policyData) as Rules;
    narrowed.decision.providerAllowRules.splice(3, 1);
    expect(() => validatePolicyDocument(narrowed, schemaData)).toThrowError();
  });

  it('rejects a writing or evaluation rule that adds a task kind, admits materials or turns web search on', () => {
    const { policyData, schemaData } = pair();
    const writing = clone(policyData) as Rules;
    (writing.decision.providerAllowRules[3]!.allowedTaskKinds as string[]).push('factual-review');
    expect(() => validatePolicyDocument(writing, schemaData)).toThrowError(/developerLiveWritingRule\/properties\/allowedTaskKinds does not equal the required const/);

    const evaluation = clone(policyData) as Rules;
    (evaluation.decision.providerAllowRules[4]!.source as Record<string, unknown>).materialReferencesAllowed = true;
    expect(() => validatePolicyDocument(evaluation, schemaData)).toThrowError(/developerLiveEvaluationRule\/properties\/source does not equal the required const/);

    const web = clone(policyData) as Rules;
    (web.decision.providerAllowRules[3]!.transmissions as Record<string, unknown>).webSearchToolAllowed = true;
    expect(() => validatePolicyDocument(web, schemaData)).toThrowError(/developerLiveWritingRule\/properties\/transmissions does not equal the required const/);
  });

  it('rejects a suggestions rule that applies a change, binds the Main Editorial Role or names a further kind', () => {
    const { policyData, schemaData } = pair();
    const apply = clone(policyData) as Rules;
    (apply.decision.providerAllowRules[5]!.output as Record<string, unknown>).appliesManuscriptChange = true;
    expect(() => validatePolicyDocument(apply, schemaData)).toThrowError(/developerLivePolishRule\/properties\/output does not equal the required const/);

    const role = clone(policyData) as Rules;
    (role.decision.providerAllowRules[5]!.providerBinding as Record<string, unknown>).modelRole = 'Main Editorial Role';
    expect(() => validatePolicyDocument(role, schemaData)).toThrowError(/developerLivePolishRule\/properties\/providerBinding does not equal the required const/);

    const kinds = clone(policyData) as Rules;
    (kinds.decision.providerAllowRules[5]!.allowedTaskKinds as string[]).push('editorial-dialogue');
    expect(() => validatePolicyDocument(kinds, schemaData)).toThrowError(/developerLivePolishRule\/properties\/allowedTaskKinds does not equal the required const/);
  });

  it('rejects a v11 document that drops one of the four new outbound categories or binds the frontier role', () => {
    const { policyData, schemaData } = pair();
    const categories = clone(policyData) as { outboundDataCategories: Record<string, unknown> };
    delete categories.outboundDataCategories['house-exemplar-excerpt'];
    expect(() => validatePolicyDocument(categories, schemaData)).toThrowError(/outboundDataCategories does not equal the required const/);

    const frontier = clone(policyData) as { roleBindings: Record<string, Record<string, unknown>> };
    frontier.roleBindings['Frontier Model Role']!.bindingState = 'bound';
    expect(() => validatePolicyDocument(frontier, schemaData)).toThrowError(/roleBindings does not equal the required const/);
  });

  it('rejects an active-set v9 whose developer-live pin is not the exact v11 digest, and a v8 whose pin is v11', () => {
    const { policyData, schemaData } = readPair('active-policy-set.v9.json', 'active-policy-set.v9.schema.json');
    expect(() => validatePolicyDocument(policyData, schemaData)).not.toThrow();
    for (const [field, value] of [['version', 'v10'], ['sha256', '1f2e1381b40ce2a91eba2c92af3cd883d6df5f574980d6f182e49d02856d86e9']] as const) {
      const mutated = clone(policyData) as { activePolicies: { 'provider-processing-policy': { scopePins: Record<string, Record<string, unknown>> } } };
      mutated.activePolicies['provider-processing-policy'].scopePins['developer-live']![field] = value;
      expect(() => validatePolicyDocument(mutated, schemaData)).toThrowError(/does not equal the required const/);
    }
    const v8 = readPair('active-policy-set.v8.json', 'active-policy-set.v8.schema.json');
    const pinned = clone(v8.policyData) as { activePolicies: { 'provider-processing-policy': { scopePins: Record<string, Record<string, unknown>> } } };
    pinned.activePolicies['provider-processing-policy'].scopePins['developer-live']!.version = 'v11';
    expect(() => validatePolicyDocument(pinned, v8.schemaData)).toThrowError(/does not equal the required const/);
  });
});

describe('Provider Processing v12, v13 and active-set v10 schemas (Issue #853)', () => {
  type Rules = { decision: { providerAllowRules: Array<Record<string, unknown>> } };
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  const v12 = () => readPair('provider-processing-policy.v12.json', 'provider-processing-policy.v12.schema.json');
  const v13 = () => readPair('provider-processing-policy.v13.json', 'provider-processing-policy.v13.schema.json');

  it('validates v12\'s seven-rule tuple and rejects an eighth rule, a missing one, or a review rule that gives up cross-deliverable consistency', () => {
    const { policyData, schemaData } = v12();
    expect(() => validatePolicyDocument(policyData, schemaData)).not.toThrow();
    const widened = clone(policyData) as Rules;
    widened.decision.providerAllowRules.push(clone(widened.decision.providerAllowRules[5]!));
    expect(() => validatePolicyDocument(widened, schemaData)).toThrowError(/has more than 7 allowed items/);
    const narrowed = clone(policyData) as Rules;
    narrowed.decision.providerAllowRules.splice(3, 1);
    expect(() => validatePolicyDocument(narrowed, schemaData)).toThrowError();
    const review = clone(policyData) as Rules;
    (review.decision.providerAllowRules[2]!.allowedTaskKinds as string[]).pop();
    expect(() => validatePolicyDocument(review, schemaData)).toThrowError(/developerLiveReviewRule\/properties\/allowedTaskKinds does not equal the required const/);
  });

  it('rejects a v12 rule that withdraws a material term, widens past Series Knowledge or drops one of the two new categories', () => {
    const { policyData, schemaData } = v12();
    for (const [index, definition] of [[2, 'developerLiveReviewRule'], [3, 'developerLiveWritingRule'], [4, 'developerLiveEvaluationRule']] as const) {
      const withdrawn = clone(policyData) as Rules;
      (withdrawn.decision.providerAllowRules[index]!.source as Record<string, unknown>).materialReferencesAllowed = false;
      expect(() => validatePolicyDocument(withdrawn, schemaData)).toThrowError(new RegExp(`${definition}/properties/source does not equal the required const`));
      const series = clone(policyData) as Rules;
      (series.decision.providerAllowRules[index]!.source as Record<string, unknown>).seriesKnowledgeAllowed = true;
      expect(() => validatePolicyDocument(series, schemaData)).toThrowError(new RegExp(`${definition}/properties/source does not equal the required const`));
    }
    const categories = clone(policyData) as { outboundDataCategories: Record<string, unknown> };
    delete categories.outboundDataCategories['editorial-deliverable-excerpt'];
    expect(() => validatePolicyDocument(categories, schemaData)).toThrowError(/outboundDataCategories does not equal the required const/);
  });

  it('validates v13\'s seven rules and rejects a background rule, a user-binding that fixes a route, or a cache switched on', () => {
    const { policyData, schemaData } = v13();
    expect(() => validatePolicyDocument(policyData, schemaData)).not.toThrow();
    const background = clone(policyData) as Rules;
    background.decision.providerAllowRules.push(clone(background.decision.providerAllowRules[0]!));
    expect(() => validatePolicyDocument(background, schemaData)).toThrowError(/has more than 7 allowed items/);
    const fixed = clone(policyData) as Rules;
    (fixed.decision.providerAllowRules[0]!.providerBinding as Record<string, unknown>).route = 'opencode-go';
    expect(() => validatePolicyDocument(fixed, schemaData)).toThrowError(/productionBaselineAnalysisRule\/properties\/providerBinding does not equal the required const/);
    const cache = clone(policyData) as Rules;
    (cache.decision.providerAllowRules[2]!.capture as Record<string, unknown>).providerResultCacheAllowed = true;
    expect(() => validatePolicyDocument(cache, schemaData)).toThrowError(/productionReviewRule\/properties\/capture does not equal the required const/);
    const origin = clone(policyData) as Rules;
    (origin.decision.providerAllowRules[3]!.authorityOrigin as Record<string, unknown>).matchingActiveDefaultExecutionRuleAllowed = true;
    expect(() => validatePolicyDocument(origin, schemaData)).toThrowError(/productionWritingRule\/properties\/authorityOrigin does not equal the required const/);
  });

  it('rejects a v13 document that binds a role by default, drops a selectable binding or lets a binding authorize transmission', () => {
    const { policyData, schemaData } = v13();
    const bound = clone(policyData) as { roleBindings: Record<string, Record<string, unknown>> };
    bound.roleBindings['Frontier Model Role']!.bindingState = 'bound';
    expect(() => validatePolicyDocument(bound, schemaData)).toThrowError(/roleBindings does not equal the required const/);
    const fewer = clone(policyData) as { roleBindings: Record<string, { allowedBindings: unknown[] }> };
    fewer.roleBindings['Main Editorial Role']!.allowedBindings.pop();
    expect(() => validatePolicyDocument(fewer, schemaData)).toThrowError(/roleBindings does not equal the required const/);
    const authorizes = clone(policyData) as { roleBindings: Record<string, Record<string, unknown>> };
    authorizes.roleBindings['Fast Interaction Role']!.userConfiguredBindingAuthorizesTransmission = true;
    expect(() => validatePolicyDocument(authorizes, schemaData)).toThrowError(/roleBindings does not equal the required const/);
  });

  it('rejects an active-set v10 whose ordinary-production or developer-live pin is not the exact v13 or v12 document', () => {
    const { policyData, schemaData } = readPair('active-policy-set.v10.json', 'active-policy-set.v10.schema.json');
    expect(() => validatePolicyDocument(policyData, schemaData)).not.toThrow();
    type Pins = { activePolicies: { 'provider-processing-policy': { scopePins: Record<string, Record<string, unknown>> } } };
    for (const [scope, field, value] of [
      ['ordinary-production', 'version', 'v6'],
      ['ordinary-production', 'sha256', '1f2e1381b40ce2a91eba2c92af3cd883d6df5f574980d6f182e49d02856d86e9'],
      ['developer-live', 'version', 'v11'],
      ['developer-live', 'sha256', '38cc8044f10517bd3c152237256cd0cd7fe6cf8a4ef7ad340099a087ac8a8634'],
    ] as const) {
      const mutated = clone(policyData) as Pins;
      mutated.activePolicies['provider-processing-policy'].scopePins[scope]![field] = value;
      expect(() => validatePolicyDocument(mutated, schemaData), `${scope} ${field}`).toThrowError(/does not equal the required const/);
    }
    // v9 keeps pinning the old pair, so a v9 whose pins moved to the successors is not v9.
    const v9 = readPair('active-policy-set.v9.json', 'active-policy-set.v9.schema.json');
    const moved = clone(v9.policyData) as Pins;
    moved.activePolicies['provider-processing-policy'].scopePins['ordinary-production']!.version = 'v13';
    expect(() => validatePolicyDocument(moved, v9.schemaData)).toThrowError();
  });
});
