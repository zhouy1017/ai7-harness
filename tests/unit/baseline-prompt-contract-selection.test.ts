import { describe, expect, it } from 'vitest';
import {
  BASELINE_PROMPT_CONTRACT,
  BASELINE_PROMPT_CONTRACT_DIGEST,
  BASELINE_PROMPT_CONTRACT_V1,
  BASELINE_PROMPT_CONTRACT_V1_DIGEST,
  unitRequestDigest,
} from '../../src/service/analysis/contract.js';
import {
  ASSURANCE_SAMPLING_PROMPT_CONTRACT,
  ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST,
  ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2,
  ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2_DIGEST,
} from '../../src/service/analysis/assurance-sampling-contract.js';
import { BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST } from '../../src/service/analysis/cross-unit-contract.js';
import {
  BASELINE_SCHEMA_DIGEST,
  RETAINED_V1_JOURNEY,
  RETAINED_V1_RECORDED_FIXTURE_IDENTITY,
  baselineAnalysisKindDefinition,
  baselinePromptContractForLaunch,
  factualReviewKindDefinition,
  type BaselinePromptContractSelection,
} from '../../src/service/analysis/kind-definition.js';
import { assuranceContractMoved, frozenAssurancePromptContractDigest } from '../../src/service/analysis/baseline-analysis-store.js';
import { fixtureEntryKey, type ModelFixtureCapture, type ModelFixtureEntry } from '../../src/service/provider/model-fixture.js';

// Issue #826: which baseline prompt contract a launch asks under. Every fixture here is synthetic and in memory — captures
// carry only the provenance facts the selection reads — and nothing replays a recorded fixture (ADR 0044 §Replay).

const UNIT_DIGEST = 'd'.repeat(64);
const SYNTHETIC_SHA = 'a'.repeat(64);

function capture(overrides: Partial<ModelFixtureCapture> = {}): ModelFixtureCapture {
  return {
    subject: 'unit',
    itemId: 'S40/synthetic/1',
    selectedItemId: 'S40/synthetic/1',
    evidenceScope: 'namespaced',
    route: 'opencode-go',
    endpoint: null,
    requestShape: null,
    model: 'deepseek-v4.1-flash',
    promptContractDigest: BASELINE_PROMPT_CONTRACT_V1_DIGEST,
    taskPromptContractDigest: BASELINE_PROMPT_CONTRACT_V1_DIGEST,
    capturedAt: '2026-10-12T00:00:00.000Z',
    providerRequestDigest: 'b'.repeat(64),
    providerResponseDigest: 'c'.repeat(64),
    responseDigestOrigin: 'recorded',
    cacheKey: null,
    generation: null,
    fixtureResponseDigest: 'e'.repeat(64),
    validation: null,
    identityMap: [],
    ...overrides,
  };
}

function entry(unitOrdinal: number, recorded: ModelFixtureCapture | undefined): ModelFixtureEntry {
  return {
    unitOrdinal,
    requestDigest: unitRequestDigest(recorded?.taskPromptContractDigest ?? BASELINE_PROMPT_CONTRACT_DIGEST, Math.max(unitOrdinal, 1), UNIT_DIGEST),
    attempt: null,
    contentDigest: null,
    response: { kind: 'unit-result', text: '{}', usage: { inputTokens: 1, outputTokens: 1 } },
    ...(recorded === undefined ? {} : { capture: recorded }),
  };
}

function fixture(identity: string, entries: ReadonlyArray<ModelFixtureEntry>, bases: ReadonlyArray<string> = []) {
  return {
    identity,
    lineage: [identity, ...bases].map((link) => ({ identity: link, sha256: SYNTHETIC_SHA })),
    entries: new Map(entries.map((item) => [fixtureEntryKey(item.unitOrdinal, item.requestDigest, item.attempt), item] as const)),
  };
}

/** The shape of the admitted recorded fixture: eight unit captures and the four stage turns, all inside a /1 baseline Task. */
function historicalEntries(): ModelFixtureEntry[] {
  return [
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((ordinal) => entry(ordinal, capture())),
    entry(0, capture({ subject: 'reduction', promptContractDigest: BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST })),
  ];
}

const J04 = { operationalScope: 'development-ci', journey: RETAINED_V1_JOURNEY } as const;

describe('baselineAnalysisKindDefinition (Issue #826)', () => {
  it('asks under prompt contract /2 by default, and under the retained /1 only when named', () => {
    const current = baselineAnalysisKindDefinition();
    expect(current.promptContractDigest).toBe(BASELINE_PROMPT_CONTRACT_DIGEST);
    expect(current.systemPrompt).toBe(BASELINE_PROMPT_CONTRACT.systemPrompt);
    expect(current.schemaDigest).toBe(BASELINE_SCHEMA_DIGEST);
    expect(current.requestDigest(2, UNIT_DIGEST)).toBe(unitRequestDigest(BASELINE_PROMPT_CONTRACT_DIGEST, 2, UNIT_DIGEST));
    expect(baselineAnalysisKindDefinition('current').promptContractDigest).toBe(BASELINE_PROMPT_CONTRACT_DIGEST);

    const retained = baselineAnalysisKindDefinition('retained-v1');
    expect(retained.promptContractDigest).toBe(BASELINE_PROMPT_CONTRACT_V1_DIGEST);
    expect(retained.systemPrompt).toBe(BASELINE_PROMPT_CONTRACT_V1.systemPrompt);
    expect(retained.requestDigest(2, UNIT_DIGEST)).toBe(unitRequestDigest(BASELINE_PROMPT_CONTRACT_V1_DIGEST, 2, UNIT_DIGEST));
    // The schema digest pins the prompt digest, so the two differ; nothing else of the kind does.
    expect(retained.schemaDigest).not.toBe(current.schemaDigest);
    for (const key of ['kind', 'contractVersion', 'unitResultSchema', 'revisionSchema', 'successorRevisionSchema', 'reducerDigest', 'outOfScope'] as const) {
      expect(retained[key]).toEqual(current[key]);
    }
    expect(retained.crossUnit).toEqual(current.crossUnit);
    // Each selection binds its sampling contract with it: the current baseline samples under /2, the retained /1 under
    // sampling /1 as the recorded Run did, and the factual kind stays on sampling /1.
    expect(current.assurance).toMatchObject({ prompt: ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2, promptContractDigest: ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2_DIGEST });
    expect(retained.assurance).toMatchObject({ prompt: ASSURANCE_SAMPLING_PROMPT_CONTRACT, promptContractDigest: ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST });
    expect(factualReviewKindDefinition().assurance).toMatchObject({ prompt: ASSURANCE_SAMPLING_PROMPT_CONTRACT, promptContractDigest: ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST });
    expect(retained.assurance?.resultSchema).toBe(current.assurance?.resultSchema);
  });

  it('parses a unit result identically under either contract: the parser and result schema are unchanged', () => {
    const unit = { ordinal: 1, blockIds: [`blk_${'a'.repeat(24)}`], overlapBlockIds: [] } as never;
    const bare = JSON.stringify({
      schema: 'ai7.baseline-manuscript-analysis.unit-result/1', unitOrdinal: 1, synopsis: '合成概述。', entities: [], events: [],
      relationships: [], settingClaims: [], conflicts: [], unresolved: ['合成未确定事项。'], confidence: 'low',
    });
    for (const selection of ['current', 'retained-v1'] as const) {
      expect(baselineAnalysisKindDefinition(selection).parseUnitResult(bare, unit))
        .toEqual({ ok: false, code: 'schema-invalid', detail: '未解决事项不符合契约 v1。' });
    }
  });

  it('names no third contract', () => {
    for (const unknown of ['v1', 'retained-v2', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(() => baselineAnalysisKindDefinition(unknown as BaselinePromptContractSelection)).toThrowError(/ANALYSIS_PROMPT_CONTRACT_UNKNOWN/u);
    }
  });
});

describe('baselinePromptContractForLaunch (Issue #826)', () => {
  it('asks under the current contract with no fixture, developer-live included', () => {
    expect(baselinePromptContractForLaunch({ operationalScope: 'developer-live', journey: undefined, fixture: null })).toBe('current');
    expect(baselinePromptContractForLaunch({ operationalScope: 'development-ci', journey: undefined, fixture: null })).toBe('current');
    expect(baselinePromptContractForLaunch({ ...J04, fixture: null })).toBe('current');
  });

  it('asks under the current contract for an authored fixture and for captures made under /2', () => {
    expect(baselinePromptContractForLaunch({ ...J04, fixture: fixture('sample1-baseline-happy', [entry(1, undefined)]) })).toBe('current');
    const v2 = capture({ promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST, taskPromptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST });
    expect(baselinePromptContractForLaunch({ ...J04, fixture: fixture('sample1-recorded-v41-unit1', [entry(1, v2)]) })).toBe('current');
  });

  it('retains /1 for exactly the admitted recorded fixture alone, bound by a development-ci J-04 launch', () => {
    expect(baselinePromptContractForLaunch({ ...J04, fixture: fixture(RETAINED_V1_RECORDED_FIXTURE_IDENTITY, historicalEntries()) }))
      .toBe('retained-v1');
  });

  it('refuses the historical fixture outside a development-ci J-04 launch', () => {
    const historical = fixture(RETAINED_V1_RECORDED_FIXTURE_IDENTITY, historicalEntries());
    for (const launch of [
      { operationalScope: 'development-ci', journey: undefined },
      { operationalScope: 'development-ci', journey: 'J-09' },
      { operationalScope: 'development-ci', journey: 'J-10' },
      { operationalScope: 'developer-live', journey: RETAINED_V1_JOURNEY },
      { operationalScope: 'developer-live', journey: undefined },
    ] as const) {
      expect(() => baselinePromptContractForLaunch({ ...launch, fixture: historical })).toThrowError(expect.objectContaining({ code: 'MODEL_FIXTURE_REFUSED' }));
    }
  });

  it('refuses /1 captures under any other identity, and the historical identity layered or with wrong provenance', () => {
    const refused = (candidate: ReturnType<typeof fixture>) =>
      expect(() => baselinePromptContractForLaunch({ ...J04, fixture: candidate })).toThrowError(expect.objectContaining({ code: 'MODEL_FIXTURE_REFUSED' }));
    // A /1 capture anywhere but the admitted fixture: a renamed copy, or one layered into another fixture.
    refused(fixture('sample1-recorded-v41-copy', historicalEntries()));
    refused(fixture('sample1-baseline-happy', [entry(1, undefined), entry(2, capture())]));
    // The admitted identity over a base, or as a base of another head.
    refused(fixture(RETAINED_V1_RECORDED_FIXTURE_IDENTITY, historicalEntries(), ['sample1-baseline-happy']));
    refused(fixture('sample1-recorded-v41-layered', historicalEntries(), [RETAINED_V1_RECORDED_FIXTURE_IDENTITY]));
    // The admitted identity with mixed, unknown, missing or no provenance.
    const v2 = capture({ promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST, taskPromptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST });
    refused(fixture(RETAINED_V1_RECORDED_FIXTURE_IDENTITY, [...historicalEntries(), entry(1, v2)].slice(1)));
    refused(fixture(RETAINED_V1_RECORDED_FIXTURE_IDENTITY, [entry(1, v2)]));
    refused(fixture(RETAINED_V1_RECORDED_FIXTURE_IDENTITY, [...historicalEntries(), entry(9, capture({ taskPromptContractDigest: 'f'.repeat(64) }))]));
    refused(fixture(RETAINED_V1_RECORDED_FIXTURE_IDENTITY, [...historicalEntries(), entry(9, capture({ taskPromptContractDigest: null }))]));
    refused(fixture(RETAINED_V1_RECORDED_FIXTURE_IDENTITY, [...historicalEntries(), entry(9, undefined)]));
    refused(fixture(RETAINED_V1_RECORDED_FIXTURE_IDENTITY, [...historicalEntries(), entry(9, capture({ promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST }))]));
    refused(fixture(RETAINED_V1_RECORDED_FIXTURE_IDENTITY, [...historicalEntries(), entry(9, capture({ model: 'deepseek-v4-flash' }))]));
    refused(fixture(RETAINED_V1_RECORDED_FIXTURE_IDENTITY, []));
  });
});

describe('the sampling contract a frozen plan names (Issue #826 stage pin)', () => {
  it('reads a plan without the pin as sampling /1, and refuses a malformed pin', () => {
    expect(frozenAssurancePromptContractDigest({ steps: [] })).toBe(ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST);
    expect(frozenAssurancePromptContractDigest({ assurancePromptContractDigest: ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2_DIGEST }))
      .toBe(ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2_DIGEST);
    for (const malformed of [null, 7, 'short', 'F'.repeat(64)]) {
      expect(() => frozenAssurancePromptContractDigest({ assurancePromptContractDigest: malformed })).toThrowError(expect.objectContaining({ code: 'ANALYSIS_RECORD_INVALID' }));
    }
  });

  it('moves only when the kind samples under another contract than the plan froze; a kind that samples nothing never moves', () => {
    const current = baselineAnalysisKindDefinition();
    const retained = baselineAnalysisKindDefinition('retained-v1');
    expect(assuranceContractMoved(current, ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2_DIGEST)).toBe(false);
    expect(assuranceContractMoved(current, ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST)).toBe(true);
    expect(assuranceContractMoved(retained, ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST)).toBe(false);
    expect(assuranceContractMoved(retained, ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2_DIGEST)).toBe(true);
    expect(assuranceContractMoved(factualReviewKindDefinition(), ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST)).toBe(false);
    expect(assuranceContractMoved({ assurance: null }, ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2_DIGEST)).toBe(false);
  });
});
