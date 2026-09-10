import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  TaskAuthorizationError,
  executionPlanValue,
  foregroundDenialReasons,
  planEnvelopeSummary,
  planEnvelopeValue,
  planProviderProcessingPin,
  planStopCondition,
  providerResolutionPlanValue,
} from '../../src/service/task-authorization.js';
import type { LaunchPolicyProjection } from '../../src/shared/protocol.js';

// Unit suite (L1) for the readings the provider-denied Task kind derives from its bound launch.
// `#requireDeniedPolicy` admits only the `development-ci` denial, so a Run under a second scope
// cannot be stood up end to end by design; these assert directly what each reading would say if one
// were, which is the whole point of deriving them. No store, database, or Provider is involved.

const CREDENTIAL_REFERENCE = '11111111-1111-4111-8111-111111111111';

function launch(scope: 'development-ci' | 'developer-live'): LaunchPolicyProjection {
  const live = scope === 'developer-live';
  return {
    integrityState: 'verified',
    denialReason: null,
    operationalScope: scope,
    activePolicySetVersion: 'v5',
    providerProcessing: {
      version: live ? 'v5' : 'v1',
      decision: live ? 'eligible-only' : 'deny',
      authorizedLiveTransmissionCount: live ? 'bounded-by-run' : 0,
      liveTransmissionAllowed: live,
      label: live ? '开发者实时：实时传输受运行边界约束' : '开发与持续集成：零次实时传输',
    },
    externalExport: {
      version: 'v1',
      policyEligibilityIsEffectApproval: false,
      currentExportEffectAvailable: false,
      label: '对外导出策略独立；当前未提供导出受控动作',
    },
    publicReleasePermission: { present: false, label: '公开发布许可：不存在' },
  };
}

const frozen = {
  taskIntentId: randomUUID(),
  checkpointDigest: '1'.repeat(64),
  manuscriptPinDigest: '2'.repeat(64),
  artifactPinDigest: '3'.repeat(64),
  runSourceScopeDigest: '4'.repeat(64),
  providerResolutionPlanDigest: '5'.repeat(64),
  executionPlanDigest: '6'.repeat(64),
};

describe('the denied Task kind reads its statements from the bound launch', () => {
  it('states the development-ci denial exactly as it always has', () => {
    const pin = planProviderProcessingPin(launch('development-ci'));
    expect(pin).toEqual({
      operationalScope: 'development-ci',
      version: 'v1',
      decision: 'deny',
      authorizedLiveTransmissionCount: 0,
    });
    expect(planStopCondition(pin)).toBe('Provider Processing v1 denies dispatch');
    expect(planEnvelopeSummary(pin)).toBe('计划已冻结；Provider Processing v1 拒绝派发');
    expect(foregroundDenialReasons(pin)).toEqual([
      '现有 Run 权限仅为 record-only-no-dispatch，不能派发。',
      '当前可信启动范围为 development-ci，Provider Processing v1 允许 0 次实时传输。',
      '生产或录制尝试必须创建新 Plan Envelope 并重新记录 Run Authorization。',
    ]);
  });

  it('states a developer-live launch as itself, naming no development-ci fact', () => {
    const pin = planProviderProcessingPin(launch('developer-live'));
    expect(pin).toEqual({
      operationalScope: 'developer-live',
      version: 'v5',
      decision: 'eligible-only',
      authorizedLiveTransmissionCount: 'bounded-by-run',
    });

    const readings = [
      planStopCondition(pin),
      planEnvelopeSummary(pin),
      ...foregroundDenialReasons(pin),
      providerResolutionPlanValue(CREDENTIAL_REFERENCE, pin).providerProcessing.operationalScope,
      executionPlanValue(pin).stopCondition,
      planEnvelopeValue(pin, frozen).summary,
    ];
    // The defect this Issue removes is a surface that promises zero live transmission under a launch
    // that authorizes them: no reading of a second scope may carry a first scope's facts.
    for (const reading of readings) {
      expect(reading).not.toContain('development-ci');
      expect(reading).not.toContain('v1');
      expect(reading).not.toContain('0 次');
    }
    expect(planStopCondition(pin)).toContain('v5');
    expect(foregroundDenialReasons(pin)[1]).toContain('developer-live');
    expect(foregroundDenialReasons(pin)[1]).toContain('bounded-by-run');
    // The plan and its envelope carry the second scope's pin and the readings of that pin.
    expect(executionPlanValue(pin).stopCondition).toBe(planStopCondition(pin));
    expect(planEnvelopeValue(pin, frozen).summary).toBe(planEnvelopeSummary(pin));
    expect(providerResolutionPlanValue(CREDENTIAL_REFERENCE, pin).providerProcessing).toEqual(pin);
  });

  it('refuses a launch whose stated facts are not its own scope pin', () => {
    const forged = launch('development-ci');
    const mismatched: LaunchPolicyProjection = {
      ...forged,
      providerProcessing: { ...forged.providerProcessing, authorizedLiveTransmissionCount: 'bounded-by-run' },
    };
    expect(() => planProviderProcessingPin(mismatched)).toThrowError(TaskAuthorizationError);
    expect(() => planProviderProcessingPin({ ...forged, operationalScope: null })).toThrowError(TaskAuthorizationError);
  });
});
