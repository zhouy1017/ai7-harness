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
  it('discovers all thirty-two current and historical pairs and validates every one at this base', () => {
    const pairs = discoverPolicyPairs(POLICIES_DIR);
    expect(pairs).toHaveLength(32);

    const results = validateAllPolicies(POLICIES_DIR);
    expect(results).toHaveLength(32);
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

describe('Provider Processing v14 to v17 and active-set v11 schemas (Issues #863, #473)', () => {
  type Rules = { decision: { providerAllowRules: Array<Record<string, unknown>> } };
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  const BACKGROUND = 7;
  const scopes = [
    ['v14', 'developerLive', 'developerLiveBackgroundRule', 'developerLiveReviewRule'],
    ['v15', 'production', 'productionBackgroundRule', 'productionReviewRule'],
    ['v16', 'developerLive', 'developerLiveBackgroundRule', 'developerLiveReviewRule'],
    ['v17', 'production', 'productionBackgroundRule', 'productionReviewRule'],
  ] as const;
  const pair = (version: string) => readPair(`provider-processing-policy.${version}.json`, `provider-processing-policy.${version}.schema.json`);

  it.each(scopes)('validates %s\'s eight-rule tuple and rejects a ninth rule or one without the background rule', (version) => {
    const { policyData, schemaData } = pair(version);
    expect(() => validatePolicyDocument(policyData, schemaData)).not.toThrow();
    const widened = clone(policyData) as Rules;
    widened.decision.providerAllowRules.push(clone(widened.decision.providerAllowRules[BACKGROUND]!));
    expect(() => validatePolicyDocument(widened, schemaData)).toThrowError(/has more than 8 allowed items/);
    const narrowed = clone(policyData) as Rules;
    narrowed.decision.providerAllowRules.splice(BACKGROUND, 1);
    expect(() => validatePolicyDocument(narrowed, schemaData)).toThrowError(/fewer than 8 required items/);
  });

  it.each(scopes)('rejects a %s background rule whose ceiling is not mandatory, split equally or capped at capacity minus one', (version, _prefix, definition) => {
    const { policyData, schemaData } = pair(version);
    for (const overrides of [
      { unsetRunBudgetCeilingAllowed: true }, { enrollmentCeilingRequired: false },
      { ceilingSplitAcrossBooks: 'proportional' }, { backgroundSlotShare: 'capacity' },
    ]) {
      const mutated = clone(policyData) as Rules;
      Object.assign(mutated.decision.providerAllowRules[BACKGROUND]!.authorizationPreconditions as Record<string, unknown>, overrides);
      expect(() => validatePolicyDocument(mutated, schemaData), JSON.stringify(overrides))
        .toThrowError(new RegExp(`${definition}/properties/authorizationPreconditions does not equal the required const`));
    }
    const origin = clone(policyData) as Rules;
    (origin.decision.providerAllowRules[BACKGROUND]!.authorityOrigin as Record<string, unknown>).newUserInitiatedTaskRequired = true;
    expect(() => validatePolicyDocument(origin, schemaData)).toThrowError(new RegExp(`${definition}/properties/authorityOrigin does not equal the required const`));
    const kinds = clone(policyData) as Rules;
    (kinds.decision.providerAllowRules[BACKGROUND]!.allowedTaskKinds as string[]).push('writing');
    expect(() => validatePolicyDocument(kinds, schemaData)).toThrowError(new RegExp(`${definition}/properties/allowedTaskKinds does not equal the required const`));
  });

  it.each(scopes)('rejects a %s foreground rule that turns on a background or scheduled mode', (version) => {
    const { policyData, schemaData } = pair(version);
    for (const index of [0, 1, 2, 3, 4, 5, 6]) {
      const mutated = clone(policyData) as Rules;
      (mutated.decision.providerAllowRules[index]!.executionMode as Record<string, unknown>).backgroundAllowed = true;
      expect(() => validatePolicyDocument(mutated, schemaData), String(index)).toThrowError(/executionMode does not equal the required const/);
    }
  });

  it.each(scopes)('rejects %s clarification terms that drop, widen or move the one-question-per-unit contract', (version) => {
    const { policyData, schemaData } = pair(version);
    for (const index of [0, 2, 3, 4, BACKGROUND]) {
      for (const [key, value] of [['maxQuestionsPerUnit', 2], ['timeoutHours', 48], ['unitWaitsOthersContinue', false], ['modelQuestionAllowed', false],
        ['timeoutContinuesAs', 'ends-the-run']] as const) {
        const mutated = clone(policyData) as Rules;
        (mutated.decision.providerAllowRules[index]!.clarification as Record<string, unknown>)[key] = value;
        expect(() => validatePolicyDocument(mutated, schemaData), `${index}.${key}`).toThrowError(/clarification does not equal the required const/);
      }
      const dropped = clone(policyData) as Rules;
      delete dropped.decision.providerAllowRules[index]!.clarification;
      expect(() => validatePolicyDocument(dropped, schemaData), `${index} dropped`).toThrowError(/Required property "clarification" is missing/);
      const noTurn = clone(policyData) as Rules;
      delete (noTurn.decision.providerAllowRules[index]!.transmissions as Record<string, unknown>).plusClarificationAnswerTurns;
      expect(() => validatePolicyDocument(noTurn, schemaData), `${index} turn`).toThrowError(/transmissions does not equal the required const/);
    }
    // The dialogue, 润色 and conflict regeneration declare no model question.
    for (const index of [1, 5, 6]) {
      const asks = clone(policyData) as Rules;
      (asks.decision.providerAllowRules[index]!.clarification as Record<string, unknown>).modelQuestionAllowed = true;
      expect(() => validatePolicyDocument(asks, schemaData), String(index)).toThrowError(/clarification does not equal the required const/);
    }
  });

  it.each(scopes)('admits the default-execution-rule origin for review in %s, and for no other rule that did not have it', (version, _prefix, _background, review) => {
    const { policyData, schemaData } = pair(version);
    expect((clone(policyData) as Rules).decision.providerAllowRules[2]!.authorityOrigin).toMatchObject({ matchingActiveDefaultExecutionRuleAllowed: true });
    const withdrawn = clone(policyData) as Rules;
    (withdrawn.decision.providerAllowRules[2]!.authorityOrigin as Record<string, unknown>).matchingActiveDefaultExecutionRuleAllowed = false;
    expect(() => validatePolicyDocument(withdrawn, schemaData)).toThrowError(new RegExp(`${review}/properties/authorityOrigin does not equal the required const`));
    for (const index of [0, 1, 5, 6, BACKGROUND]) {
      const widened = clone(policyData) as Rules;
      (widened.decision.providerAllowRules[index]!.authorityOrigin as Record<string, unknown>).matchingActiveDefaultExecutionRuleAllowed = true;
      expect(() => validatePolicyDocument(widened, schemaData), String(index)).toThrowError(/authorityOrigin does not equal the required const/);
    }
  });

  it('keeps v14 and v15 on the unchanged role, credential and authority-separation consts of their predecessors', () => {
    for (const [now, before] of [['v14', 'v12'], ['v15', 'v13']] as const) {
      const current = pair(now).policyData as Record<string, unknown>;
      const predecessor = pair(before).policyData as Record<string, unknown>;
      for (const section of ['roleBindings', 'credentialBoundary', 'authoritySeparations', 'outboundDataCategories', 'trustedSelection']) {
        expect(current[section], `${now} ${section}`).toEqual(predecessor[section]);
      }
      expect(current.predecessorVersion).toBe(before);
    }
  });

  it('rejects an active-set v11 whose ordinary-production or developer-live pin is not the exact v15 or v14 document', () => {
    const { policyData, schemaData } = readPair('active-policy-set.v11.json', 'active-policy-set.v11.schema.json');
    expect(() => validatePolicyDocument(policyData, schemaData)).not.toThrow();
    type Pins = { activePolicies: { 'provider-processing-policy': { scopePins: Record<string, Record<string, unknown>> } } };
    for (const [scope, field, value] of [
      ['ordinary-production', 'version', 'v13'],
      ['ordinary-production', 'sha256', '465f6bb3b43d522c2464f0589e6302600799192ee46ba17df23269f08f94ea3e'],
      ['developer-live', 'version', 'v12'],
      ['developer-live', 'sha256', '9bc27046af27c2967482c51ec4850668df13154a8c8e3ad94bdcb6fae3b47b2c'],
    ] as const) {
      const mutated = clone(policyData) as Pins;
      mutated.activePolicies['provider-processing-policy'].scopePins[scope]![field] = value;
      expect(() => validatePolicyDocument(mutated, schemaData), `${scope} ${field}`).toThrowError(/does not equal the required const/);
    }
    // v10 keeps pinning the old pair, so a v10 whose pins moved to the successors is not v10.
    const v10 = readPair('active-policy-set.v10.json', 'active-policy-set.v10.schema.json');
    const moved = clone(v10.policyData) as Pins;
    moved.activePolicies['provider-processing-policy'].scopePins['developer-live']!.version = 'v14';
    expect(() => validatePolicyDocument(moved, v10.schemaData)).toThrowError();
    expect((policyData as { predecessorVersion: string }).predecessorVersion).toBe('v10');
  });
});

describe('Provider Processing v16, v17 and active-set v12 schemas: platform tools (Issue #473, slice 6d)', () => {
  type Rules = { decision: { providerAllowRules: Array<Record<string, unknown>> } };
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  const RESEARCH = [2, 3, 4];
  const pair = (version: string) => readPair(`provider-processing-policy.${version}.json`, `provider-processing-policy.${version}.schema.json`);

  it.each([['v16', 'v14'], ['v17', 'v15']] as const)('validates %s and keeps its predecessor\'s role, credential, separation and selection consts', (now, before) => {
    const { policyData, schemaData } = pair(now);
    expect(() => validatePolicyDocument(policyData, schemaData)).not.toThrow();
    const current = policyData as Record<string, unknown>;
    const predecessor = pair(before).policyData as Record<string, unknown>;
    for (const section of ['roleBindings', 'credentialBoundary', 'authoritySeparations', 'trustedSelection']) {
      expect(current[section], `${now} ${section}`).toEqual(predecessor[section]);
    }
    // The vocabulary gains exactly the two web categories.
    expect(Object.keys(current.outboundDataCategories as object)).toEqual([...Object.keys(predecessor.outboundDataCategories as object), 'web-search-query', 'public-source-fetch']);
    expect(current.predecessorVersion).toBe(before);
  });

  it.each(['v16', 'v17'])('pins %s\'s platform tools block, its web switch and its research kinds as consts', (version) => {
    const { policyData, schemaData } = pair(version);
    for (const index of RESEARCH) {
      const variants: Array<[string, (rule: Record<string, unknown>) => void, RegExp]> = [
        ['drop block', (rule) => { delete rule.platformTools; }, /Required property "platformTools" is missing/],
        ['switch off', (rule) => { (rule.transmissions as Record<string, unknown>).webSearchToolAllowed = false; }, /transmissions does not equal the required const/],
        ['fetch bound', (rule) => { ((rule.platformTools as Record<string, Record<string, unknown>>).webfetch!).maxBytes = 10_485_760; }, /platformTools does not equal the required const/],
        ['breaker', (rule) => { ((rule.platformTools as Record<string, Record<string, unknown>>).breaker!).roundTrips = 256; }, /platformTools does not equal the required const/],
        ['backend host', (rule) => {
          ((rule.platformTools as { websearch: { backends: Array<Record<string, unknown>> } }).websearch.backends[0]!).host = 'search.example.com';
        }, /platformTools does not equal the required const/],
      ];
      for (const [label, mutate, error] of variants) {
        const mutated = clone(policyData) as Rules;
        mutate(mutated.decision.providerAllowRules[index]!);
        expect(() => validatePolicyDocument(mutated, schemaData), `${index} ${label}`).toThrowError(error);
      }
    }
    // A rule that does not research cannot carry the block.
    for (const index of [0, 1, 5, 6, 7]) {
      const mutated = clone(policyData) as Rules;
      mutated.decision.providerAllowRules[index]!.platformTools = clone(mutated.decision.providerAllowRules[2]!.platformTools);
      expect(() => validatePolicyDocument(mutated, schemaData), String(index)).toThrowError(/additional properties|platformTools/i);
    }
    // 出版政策与风险 joins no rule this wave.
    const kinds = clone(policyData) as Rules;
    (kinds.decision.providerAllowRules[2]!.allowedTaskKinds as string[]).push('editorial-review/publication-risk');
    expect(() => validatePolicyDocument(kinds, schemaData)).toThrowError(/allowedTaskKinds does not equal the required const/);
  });

  it('rejects an active-set v12 whose ordinary-production or developer-live pin is not the exact v17 or v16 document', () => {
    const { policyData, schemaData } = readPair('active-policy-set.v12.json', 'active-policy-set.v12.schema.json');
    expect(() => validatePolicyDocument(policyData, schemaData)).not.toThrow();
    type Pins = { activePolicies: { 'provider-processing-policy': { scopePins: Record<string, Record<string, unknown>> } } };
    for (const [scope, field, value] of [
      ['ordinary-production', 'version', 'v15'],
      ['ordinary-production', 'sha256', '1f398f923d57a442fe6c410b5831c25f45c6983973ccfcf619472db8a8666b46'],
      ['developer-live', 'version', 'v14'],
      ['developer-live', 'sha256', '98ec1f93f26e896d1a6a37b3829eacffb7deb9b52f8966252aa3f7115717bb6d'],
    ] as const) {
      const mutated = clone(policyData) as Pins;
      mutated.activePolicies['provider-processing-policy'].scopePins[scope]![field] = value;
      expect(() => validatePolicyDocument(mutated, schemaData), `${scope} ${field}`).toThrowError(/does not equal the required const/);
    }
    // v11 keeps pinning the old pair, so a v11 whose pins moved to the successors is not v11.
    const v11 = readPair('active-policy-set.v11.json', 'active-policy-set.v11.schema.json');
    const moved = clone(v11.policyData) as Pins;
    moved.activePolicies['provider-processing-policy'].scopePins['developer-live']!.version = 'v16';
    expect(() => validatePolicyDocument(moved, v11.schemaData)).toThrowError();
    expect((policyData as { predecessorVersion: string }).predecessorVersion).toBe('v11');
  });
});

describe('Provider Processing v18, v19 and active-set v13 schemas: local tools (Issue #891, slice 7d)', () => {
  type Rules = { decision: { providerAllowRules: Array<Record<string, unknown>> } };
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  const BACKGROUND = 7;
  const REVIEW = 2;
  const TRANSLATION = 8;
  const pair = (version: string) => readPair(`provider-processing-policy.${version}.json`, `provider-processing-policy.${version}.schema.json`);

  it.each([['v18', 'v16'], ['v19', 'v17']] as const)('validates %s and keeps its predecessor\'s role, credential, separation, selection and category consts', (now, before) => {
    const { policyData, schemaData } = pair(now);
    expect(() => validatePolicyDocument(policyData, schemaData)).not.toThrow();
    const current = policyData as Record<string, unknown>;
    const predecessor = pair(before).policyData as Record<string, unknown>;
    for (const section of ['roleBindings', 'credentialBoundary', 'authoritySeparations', 'trustedSelection', 'outboundDataCategories']) {
      expect(current[section], `${now} ${section}`).toEqual(predecessor[section]);
    }
    expect(current.predecessorVersion).toBe(before);
    expect(current.predecessorCanonicalPath).toBe(`docs/policies/provider-processing-policy.${before}.json`);
  });

  it.each(['v18', 'v19'])('pins %s\'s local tools block on every rule as a const, retrieval not allowed for background analysis and material translation', (version) => {
    const { policyData, schemaData } = pair(version);
    const rules = (policyData as Rules).decision.providerAllowRules;
    expect(rules).toHaveLength(9);
    rules.forEach((rule, index) => {
      expect(rule.localTools, `${index}`).toEqual({
        targetedRetrieval: {
          allowed: index !== BACKGROUND && index !== TRANSLATION, source: 'authorized-pinned-sources-only', callsPerUnit: 5, candidatesPerCall: 8,
          exactFetchRequiredBeforeCitation: true, scope: 'no-egress',
        },
        breaker: { roundTrips: 128, end: '检索未完成' },
      });
    });
    for (let index = 0; index < rules.length; index += 1) {
      const variants: Array<[string, (rule: Record<string, unknown>) => void, RegExp]> = [
        ['drop block', (rule) => { delete rule.localTools; }, /Required property "localTools" is missing/],
        ['flip allowed', (rule) => { ((rule.localTools as Record<string, Record<string, unknown>>).targetedRetrieval!).allowed = index === BACKGROUND || index === TRANSLATION; }, /localTools does not equal the required const/],
        ['call cap', (rule) => { ((rule.localTools as Record<string, Record<string, unknown>>).targetedRetrieval!).callsPerUnit = 6; }, /localTools does not equal the required const/],
        ['candidate cap', (rule) => { ((rule.localTools as Record<string, Record<string, unknown>>).targetedRetrieval!).candidatesPerCall = 9; }, /localTools does not equal the required const/],
        ['exact fetch', (rule) => { ((rule.localTools as Record<string, Record<string, unknown>>).targetedRetrieval!).exactFetchRequiredBeforeCitation = false; }, /localTools does not equal the required const/],
        ['scope', (rule) => { ((rule.localTools as Record<string, Record<string, unknown>>).targetedRetrieval!).scope = 'egress'; }, /localTools does not equal the required const/],
        ['source', (rule) => { ((rule.localTools as Record<string, Record<string, unknown>>).targetedRetrieval!).source = 'any-source'; }, /localTools does not equal the required const/],
        ['breaker', (rule) => { ((rule.localTools as Record<string, Record<string, unknown>>).breaker!).roundTrips = 129; }, /localTools does not equal the required const/],
        ['breaker end', (rule) => { ((rule.localTools as Record<string, Record<string, unknown>>).breaker!).end = '联网核查未完成'; }, /localTools does not equal the required const/],
      ];
      for (const [label, mutate, error] of variants) {
        const mutated = clone(policyData) as Rules;
        mutate(mutated.decision.providerAllowRules[index]!);
        expect(() => validatePolicyDocument(mutated, schemaData), `${version} ${index} ${label}`).toThrowError(error);
      }
    }
  });

  it('rejects an active-set v13 whose ordinary-production or developer-live pin is not the exact v19 or v18 document', () => {
    const { policyData, schemaData } = readPair('active-policy-set.v13.json', 'active-policy-set.v13.schema.json');
    expect(() => validatePolicyDocument(policyData, schemaData)).not.toThrow();
    type Pins = { activePolicies: { 'provider-processing-policy': { scopePins: Record<string, Record<string, unknown>> } } };
    for (const [scope, field, value] of [
      ['ordinary-production', 'version', 'v17'],
      ['ordinary-production', 'sha256', 'e5dba26a71704016b9af9864c56aa508aa2bcebe75225a8e4e7af1c1fa67236b'],
      ['developer-live', 'version', 'v16'],
      ['developer-live', 'sha256', 'c6c3b51c346d4ab4011f03835f8650c503dd87dfa02617bde4b3a0707cd8701d'],
    ] as const) {
      const mutated = clone(policyData) as Pins;
      mutated.activePolicies['provider-processing-policy'].scopePins[scope]![field] = value;
      expect(() => validatePolicyDocument(mutated, schemaData), `${scope} ${field}`).toThrowError(/does not equal the required const/);
    }
    // v12 keeps pinning the old pair, so a v12 whose pins moved to the successors is not v12.
    const v12 = readPair('active-policy-set.v12.json', 'active-policy-set.v12.schema.json');
    const moved = clone(v12.policyData) as Pins;
    moved.activePolicies['provider-processing-policy'].scopePins['developer-live']!.version = 'v18';
    expect(() => validatePolicyDocument(moved, v12.schemaData)).toThrowError();
    expect((policyData as { predecessorVersion: string }).predecessorVersion).toBe('v12');
  });
});

describe('Provider Processing v18 and v19 schemas: 来源译文 (Issue #891, revisions 2 and 3)', () => {
  type Rules = { decision: { providerAllowRules: Array<Record<string, unknown>> } };
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  const REVIEW = 2;
  const TRANSLATION = 8;
  const pair = (version: string) => readPair(`provider-processing-policy.${version}.json`, `provider-processing-policy.${version}.schema.json`);

  it.each([['v18', 'developer-live-public-samplebook-material-translation', ['public-or-synthetic']], ['v19', 'ordinary-production-material-translation',
    ['frozen-material-reference-excerpt', 'unpublished-metadata', 'unpublished-excerpts', 'unpublished-full-content']]] as const)('pins %s\'s ninth rule: the Fast Interaction Role over one frozen excerpt, no web, no retrieval', (version, ruleId, categories) => {
    const { policyData, schemaData } = pair(version);
    const rule = (policyData as Rules).decision.providerAllowRules[TRANSLATION]!;
    expect(rule.ruleId).toBe(ruleId);
    expect(rule.allowedTaskKinds).toEqual(['material-translation']);
    expect(rule.allowedOutboundDataCategories).toEqual(categories);
    expect((rule.providerBinding as Record<string, unknown>).modelRole).toBe('Fast Interaction Role');
    expect((rule.transmissions as Record<string, unknown>).webSearchToolAllowed).toBe(false);
    expect(rule.platformTools).toBeUndefined();
    const variants: Array<[string, (value: Record<string, unknown>) => void, RegExp]> = [
      ['kind', (value) => { value.allowedTaskKinds = ['material-translation', 'editorial-dialogue']; }, /allowedTaskKinds does not equal the required const/],
      ['category', (value) => { value.allowedOutboundDataCategories = ['editor-selected-manuscript-excerpt']; }, /allowedOutboundDataCategories does not equal the required const/],
      ['role', (value) => { (value.providerBinding as Record<string, unknown>).modelRole = 'Main Editorial Role'; }, /providerBinding does not equal the required const/],
      ['web on', (value) => { (value.transmissions as Record<string, unknown>).webSearchToolAllowed = true; }, /transmissions does not equal the required const/],
      ['platform tools', (value) => { value.platformTools = {}; }, /additional properties|platformTools/i],
      ['source', (value) => { (value.source as Record<string, unknown>).seriesKnowledgeAllowed = true; }, /source does not equal the required const/],
      ['origin', (value) => { (value.authorityOrigin as Record<string, unknown>).backgroundAnalysisEnrollmentAllowed = true; }, /authorityOrigin does not equal the required const/],
      ['ceiling', (value) => { (value.authorizationPreconditions as Record<string, unknown>).runBudgetCeilingApplies = true; }, /authorizationPreconditions does not equal the required const/],
    ];
    for (const [label, mutate, error] of variants) {
      const mutated = clone(policyData) as Rules;
      mutate(mutated.decision.providerAllowRules[TRANSLATION]!);
      expect(() => validatePolicyDocument(mutated, schemaData), `${version} ${label}`).toThrowError(error);
    }
    // A tenth rule, or the ninth withdrawn, is not the document.
    const extra = clone(policyData) as Rules;
    extra.decision.providerAllowRules.push(clone(extra.decision.providerAllowRules[TRANSLATION]!));
    expect(() => validatePolicyDocument(extra, schemaData)).toThrowError();
    const missing = clone(policyData) as Rules;
    missing.decision.providerAllowRules.pop();
    expect(() => validatePolicyDocument(missing, schemaData)).toThrowError();
  });

  it.each(['v18', 'v19'])('pins %s\'s sourceTranslationAllowed on the research review rule alone', (version) => {
    const { policyData, schemaData } = pair(version);
    const rules = (policyData as Rules).decision.providerAllowRules;
    rules.forEach((rule, index) => { expect(rule.sourceTranslationAllowed, `${index}`).toBe(index === REVIEW ? true : undefined); });
    const dropped = clone(policyData) as Rules;
    delete dropped.decision.providerAllowRules[REVIEW]!.sourceTranslationAllowed;
    expect(() => validatePolicyDocument(dropped, schemaData)).toThrowError(/Required property "sourceTranslationAllowed" is missing/);
    const off = clone(policyData) as Rules;
    off.decision.providerAllowRules[REVIEW]!.sourceTranslationAllowed = false;
    expect(() => validatePolicyDocument(off, schemaData)).toThrowError(/sourceTranslationAllowed does not equal the required const/);
    for (const index of [0, 1, 3, 4, 5, 6, 7, TRANSLATION]) {
      const added = clone(policyData) as Rules;
      added.decision.providerAllowRules[index]!.sourceTranslationAllowed = true;
      expect(() => validatePolicyDocument(added, schemaData), String(index)).toThrowError(/additional properties|sourceTranslationAllowed/i);
    }
  });
});
