import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AnalysisError, canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import {
  MATERIAL_PLAN_FIELDS,
  MATERIAL_PLAN_FIELD_LABELS,
  NO_PARTICIPATION_STATEMENT,
  PLAN_ADAPTATION_CLASSES,
  PLAN_REVISION_REQUIRED_REASON,
  buildPlanAdaptationRecord,
  diffMaterialPlanInputs,
  materialPlanInputsOfComponents,
  planAdaptationLabel,
  planBoundarySplit,
  planRevisionLabel,
  reusePlanCountsDiffEntry,
  sameMaterialPlanInputs,
} from '../../src/service/analysis/plan-boundary.js';
import type { MaterialPlanField, MaterialPlanInputsProjection } from '../../src/shared/protocol.js';

// Drift detection is a pure comparison of the material plan inputs a version froze with the inputs
// re-derived from durable state: every material field, and only a material field, produces a diff
// line; a derived consequence (the reuse-plan counts) is reported beside them, never as material.

const EXPECTED_OUTCOME = '稿件分析结果集修订版（基线稿件分析契约 v1）';
const RANGE_A = { startPosition: 26, endPosition: 43 };
const RANGE_B = { startPosition: 93, endPosition: 97 };
const PREDECESSOR = { revisionId: randomUUID(), ordinal: 1, digest: 'c'.repeat(64) };

function inputs(): MaterialPlanInputsProjection {
  return {
    providerBinding: { providerId: 'deepseek-open-platform', modelId: 'deepseek-v4-pro', adapterRevision: 1, configurationRevision: 1, credentialReference: '11111111-1111-4111-8111-111111111111' },
    artifactPin: { identity: '@ai7/editorial-workspace-profile', version: '1.0.0', nativeCarrierSha256: 'a'.repeat(64), sidecarRevision: 2, sidecarSha256: 'b'.repeat(64) },
    selectedRange: RANGE_A,
    predecessorRevision: PREDECESSOR,
    runBudgetCeiling: 'unset',
    outboundDataCategory: 'public-or-synthetic',
    expectedOutcome: EXPECTED_OUTCOME,
  };
}

/** One synthetic drift of exactly the named field. */
function drifted(field: MaterialPlanField): MaterialPlanInputsProjection {
  const base = inputs();
  switch (field) {
    case 'providerBinding.providerId': return { ...base, providerBinding: { ...base.providerBinding, providerId: 'other-provider' } };
    case 'providerBinding.modelId': return { ...base, providerBinding: { ...base.providerBinding, modelId: 'other-model' } };
    case 'providerBinding.adapterRevision': return { ...base, providerBinding: { ...base.providerBinding, adapterRevision: 2 } };
    case 'providerBinding.configurationRevision': return { ...base, providerBinding: { ...base.providerBinding, configurationRevision: 2 } };
    case 'providerBinding.credentialReference': return { ...base, providerBinding: { ...base.providerBinding, credentialReference: '22222222-2222-4222-8222-222222222222' } };
    case 'artifactPin.identity': return { ...base, artifactPin: { ...base.artifactPin, identity: '@ai7/other-profile' } };
    case 'artifactPin.version': return { ...base, artifactPin: { ...base.artifactPin, version: '1.1.0' } };
    case 'artifactPin.nativeCarrierSha256': return { ...base, artifactPin: { ...base.artifactPin, nativeCarrierSha256: 'd'.repeat(64) } };
    case 'artifactPin.sidecarRevision': return { ...base, artifactPin: { ...base.artifactPin, sidecarRevision: 1 } };
    case 'artifactPin.sidecarSha256': return { ...base, artifactPin: { ...base.artifactPin, sidecarSha256: 'e'.repeat(64) } };
    case 'selectedRange': return { ...base, selectedRange: RANGE_B };
    case 'predecessorRevision': return { ...base, predecessorRevision: { ...PREDECESSOR, ordinal: 2, digest: 'f'.repeat(64) } };
    case 'runBudgetCeiling': return { ...base, runBudgetCeiling: 'tokens:1000' as unknown as 'unset' };
    case 'outboundDataCategory': return { ...base, outboundDataCategory: 'private' as unknown as 'public-or-synthetic' };
    case 'expectedOutcome': return { ...base, expectedOutcome: '其他结果类别' };
  }
}

describe('material plan drift', () => {
  it('reports no diff for identical inputs, including a first-baseline shape with null range and predecessor', () => {
    expect(diffMaterialPlanInputs(inputs(), inputs())).toEqual([]);
    expect(sameMaterialPlanInputs(inputs(), inputs())).toBe(true);
    const first = { ...inputs(), selectedRange: null, predecessorRevision: null };
    expect(diffMaterialPlanInputs(first, { ...first })).toEqual([]);
  });

  it('names exactly the drifted field with its label, prior and proposed values, for every material field', () => {
    expect(MATERIAL_PLAN_FIELDS).toHaveLength(15);
    for (const field of MATERIAL_PLAN_FIELDS) {
      const diff = diffMaterialPlanInputs(inputs(), drifted(field));
      expect(diff.map((entry) => entry.field)).toEqual([field]);
      expect(diff[0]).toMatchObject({ label: MATERIAL_PLAN_FIELD_LABELS[field], materiality: 'material' });
      expect(canonicalJson(diff[0]!.prior)).not.toBe(canonicalJson(diff[0]!.proposed));
      expect(sameMaterialPlanInputs(inputs(), drifted(field))).toBe(false);
    }
    const range = diffMaterialPlanInputs(inputs(), drifted('selectedRange'))[0]!;
    expect(range).toEqual({ field: 'selectedRange', label: MATERIAL_PLAN_FIELD_LABELS.selectedRange, prior: RANGE_A, proposed: RANGE_B, materiality: 'material' });
    const credential = diffMaterialPlanInputs(inputs(), drifted('providerBinding.credentialReference'))[0]!;
    expect(credential.prior).toBe('11111111-1111-4111-8111-111111111111');
    expect(credential.proposed).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('treats a removed or added range and predecessor as material drift and lists several fields in the fixed order', () => {
    const removed = { ...inputs(), selectedRange: null, predecessorRevision: null };
    expect(diffMaterialPlanInputs(inputs(), removed).map((entry) => [entry.field, entry.proposed])).toEqual([['selectedRange', null], ['predecessorRevision', null]]);
    expect(diffMaterialPlanInputs(removed, inputs()).map((entry) => [entry.field, entry.prior])).toEqual([['selectedRange', null], ['predecessorRevision', null]]);
    const several = { ...drifted('expectedOutcome'), providerBinding: drifted('providerBinding.modelId').providerBinding, selectedRange: RANGE_B };
    expect(diffMaterialPlanInputs(inputs(), several).map((entry) => entry.field)).toEqual(['providerBinding.modelId', 'selectedRange', 'expectedOutcome']);
  });

  it('never reports a non-material difference: labels, timestamps, and manuscript edits are not inputs', () => {
    // The projection carries no display label or time; the only fields compared are the fifteen material ones.
    const decorated = { ...inputs(), label: '显示标签', detectedAt: new Date().toISOString() } as unknown as MaterialPlanInputsProjection;
    expect(diffMaterialPlanInputs(inputs(), decorated)).toEqual([]);
  });

  it('adds the derived reuse-plan counts entry only when the counts change', () => {
    const counts = { reused: 5, recomputed: 3, invalidated: 1, bypassed: 2 };
    expect(reusePlanCountsDiffEntry(counts, { ...counts })).toBeNull();
    const changed = { reused: 6, recomputed: 2, invalidated: 1, bypassed: 1 };
    expect(reusePlanCountsDiffEntry(counts, changed)).toEqual({ field: 'reusePlan.counts', label: expect.any(String), prior: counts, proposed: changed, materiality: 'derived' });
  });

  it('labels a revision by its versions and changed fields and an adaptation by unit and classified reason', () => {
    expect(planRevisionLabel(1, 2, ['selectedRange', 'reusePlan.counts'])).toBe('计划修订 · 版本 1 → 2 · selectedRange、reusePlan.counts');
    expect(planRevisionLabel(3, null, ['providerBinding.credentialReference'])).toBe('计划修订 · 版本 3 → 4（待重新确认） · providerBinding.credentialReference');
    expect(planAdaptationLabel(5, '适配器失败（PROVIDER_ERROR · 503）。')).toBe('计划内调整 · 单元 5 安全重试 1 次 · 适配器失败（PROVIDER_ERROR · 503）。');
    expect(PLAN_REVISION_REQUIRED_REASON).toBe('plan-revision-required');
  });
});

describe('plan boundary split', () => {
  it('declares exactly safe-retry, the fifteen material fields with their labels, and no expected participation', () => {
    const split = planBoundarySplit();
    expect(PLAN_ADAPTATION_CLASSES).toEqual(['safe-retry']);
    expect(split.adaptable.map((entry) => entry.adaptationClass)).toEqual(['safe-retry']);
    expect(split.adaptable[0]!.statement).toContain('安全重试一次');
    expect(split.material.map((entry) => entry.field)).toEqual([...MATERIAL_PLAN_FIELDS]);
    expect(split.material.every((entry) => entry.label === MATERIAL_PLAN_FIELD_LABELS[entry.field])).toBe(true);
    expect(split.participation).toEqual({ expected: false, statement: NO_PARTICIPATION_STATEMENT });
    expect(NO_PARTICIPATION_STATEMENT).toBe('预计无需中途参与');
  });

  it('digests deterministically and differently when the declared classes change', () => {
    const split = planBoundarySplit();
    const digest = sha256Hex(canonicalJson(split));
    expect(sha256Hex(canonicalJson(planBoundarySplit()))).toBe(digest);
    const widened = { ...split, adaptable: [...split.adaptable, { adaptationClass: 'safe-retry', label: '第二类', statement: '不在本切片内' }] };
    expect(sha256Hex(canonicalJson(widened))).not.toBe(digest);
    const narrowed = { ...split, adaptable: [] };
    expect(sha256Hex(canonicalJson(narrowed))).not.toBe(digest);
  });
});

describe('material inputs of plan components', () => {
  const components = (reusePlan: Record<string, unknown> | null): Record<string, unknown> => ({
    'provider-resolution-plan': {
      role: 'Main Editorial Role',
      remoteBinding: { providerId: 'deepseek-open-platform', modelId: 'deepseek-v4-pro', adapterRevision: 1, configurationRevision: 1, credentialReference: '11111111-1111-4111-8111-111111111111', credentialReadiness: 'missing' },
      outboundDataCategory: 'public-or-synthetic',
      runBudgetCeiling: 'unset',
    },
    'artifact-pin': { identity: '@ai7/editorial-workspace-profile', version: '1.0.0', nativeCarrierSha256: 'a'.repeat(64), sidecarIdentity: 'ai7.editorial-workspace-profile.authority', sidecarRevision: 2, sidecarSha256: 'b'.repeat(64) },
    ...(reusePlan === null ? {} : { 'reuse-plan': reusePlan }),
  });

  it('reads the binding, the pin, and the reuse plan back into the material inputs, ignoring credential readiness', () => {
    const read = materialPlanInputsOfComponents(components({ selectedRange: RANGE_A, predecessor: { ...PREDECESSOR, contractVersion: 'x', coverageManifestDigest: 'y', unitCount: 8 } }), EXPECTED_OUTCOME);
    expect(read).toEqual(inputs());
  });

  it('yields a null range and predecessor for a first baseline and for an update without a range', () => {
    expect(materialPlanInputsOfComponents(components(null), EXPECTED_OUTCOME)).toEqual({ ...inputs(), selectedRange: null, predecessorRevision: null });
    expect(materialPlanInputsOfComponents(components({ selectedRange: null, predecessor: PREDECESSOR }), EXPECTED_OUTCOME)).toEqual({ ...inputs(), selectedRange: null });
  });

  it('rejects components without a remote binding or with a malformed pin', () => {
    expect(() => materialPlanInputsOfComponents({ 'artifact-pin': components(null)['artifact-pin'] }, EXPECTED_OUTCOME)).toThrowError(AnalysisError);
    const malformed = components(null);
    malformed['artifact-pin'] = { ...(malformed['artifact-pin'] as Record<string, unknown>), sidecarRevision: 'two' };
    expect(() => materialPlanInputsOfComponents(malformed, EXPECTED_OUTCOME)).toThrowError(/构件 pin 记录无效/u);
  });
});

describe('plan adaptation record', () => {
  const input = () => ({
    adaptationId: randomUUID(),
    attemptId: randomUUID(),
    runRecordId: randomUUID(),
    taskIntentId: randomUUID(),
    ordinal: 1,
    unitOrdinal: 5,
    attemptIndex: 2,
    classifiedReason: '适配器失败（PROVIDER_ERROR · 503）。',
    failureCode: 'PROVIDER_ERROR',
    failureClass: 'adapter-failure',
    failureStatus: 503,
    requestDigest: '1'.repeat(64),
    firstPayloadDigest: '2'.repeat(64),
    planEnvelopeDigest: '3'.repeat(64),
    bindingDigest: '4'.repeat(64),
    recordedAt: '2026-09-06T00:00:00.000Z',
  });

  it('canonicalizes the safe-retry record with the unchanged envelope and binding digests', () => {
    const built = buildPlanAdaptationRecord(input());
    expect(built.record).toMatchObject({ adaptationClass: 'safe-retry', attemptIndex: 2, unitOrdinal: 5, failureStatus: 503, planEnvelopeDigest: '3'.repeat(64), bindingDigest: '4'.repeat(64) });
    expect(built.json).toBe(canonicalJson(built.record));
    expect(built.digest).toBe(sha256Hex(built.json));
    expect(JSON.parse(built.json)).toEqual(built.record);
    expect(buildPlanAdaptationRecord({ ...input(), firstPayloadDigest: null }).record.firstPayloadDigest).toBeNull();
  });

  it('refuses a malformed record: a second retry, a bad ordinal, or a bad digest', () => {
    expect(() => buildPlanAdaptationRecord({ ...input(), attemptIndex: 3 })).toThrowError(AnalysisError);
    expect(() => buildPlanAdaptationRecord({ ...input(), ordinal: 0 })).toThrowError(AnalysisError);
    expect(() => buildPlanAdaptationRecord({ ...input(), bindingDigest: 'short' })).toThrowError(AnalysisError);
    expect(() => buildPlanAdaptationRecord({ ...input(), attemptId: 'not-a-uuid' })).toThrowError(AnalysisError);
  });
});
