import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXECUTION_RULES_STATEMENT,
  DEFAULT_EXECUTION_RULE_QUICK_LABELS,
  QUICK_START_DEVELOPER_LIVE,
  QUICK_START_RANGE_REASON,
  defaultExecutionRuleBindingOf,
  defaultExecutionRuleDoes,
  defaultExecutionRuleDrift,
  defaultExecutionRuleName,
  isDefaultExecutionRulePattern,
  quickStartNoRuleReason,
  ruleDriftReason,
  setRuleAlreadyReason,
} from '../../src/service/default-execution-rules.js';
import { defaultRuleBindingRows } from '../../src/service/task-plan.js';
import type { MaterialPlanInputsProjection } from '../../src/shared/protocol.js';

// 默认执行规则 (Issue #421, plan slice S75): what a rule binds, how it is named, and every sentence quick start and
// 设为快速开始默认… say, pinned byte for byte. The service suite reads the same words off the real store.

const INPUTS: MaterialPlanInputsProjection = {
  providerBinding: { providerId: 'deepseek-open-platform', modelId: 'deepseek-v4-pro', adapterRevision: 1, configurationRevision: 1, credentialReference: 'ref-1' },
  artifactPin: { identity: 'ai7.editorial-workspace-profile', version: '1.0.0', nativeCarrierSha256: 'a'.repeat(64), sidecarRevision: 2, sidecarSha256: 'b'.repeat(64) },
  selectedRange: null,
  predecessorRevision: { revisionId: 'revision-7', ordinal: 7, digest: 'c'.repeat(64) },
  runBudgetCeiling: 'unset',
  outboundDataCategory: 'public-or-synthetic',
  expectedOutcome: '稿件分析结果集修订版（基线稿件分析契约 v1）',
};

describe('what a 默认执行规则 binds', () => {
  it('binds the plan\'s material inputs except the range and the predecessor, which are each Run\'s own', () => {
    const binding = defaultExecutionRuleBindingOf(INPUTS);
    expect(binding).toEqual({
      providerBinding: INPUTS.providerBinding, artifactPin: INPUTS.artifactPin, runBudgetCeiling: 'unset',
      outboundDataCategory: 'public-or-synthetic', expectedOutcome: INPUTS.expectedOutcome,
    });
    // A later Run's own predecessor and range never read as drift.
    expect(defaultExecutionRuleDrift(binding, { ...INPUTS, predecessorRevision: { revisionId: 'revision-8', ordinal: 8, digest: 'd'.repeat(64) } })).toEqual([]);
    expect(defaultExecutionRuleDrift(binding, { ...INPUTS, selectedRange: { startPosition: 1, endPosition: 4 } })).toEqual([]);
    // Every bound field that moves is named, in the Plan Revision diff's own labels and order.
    expect(defaultExecutionRuleDrift(binding, {
      ...INPUTS,
      providerBinding: { ...INPUTS.providerBinding, credentialReference: 'ref-2' },
      artifactPin: { ...INPUTS.artifactPin, sidecarRevision: 3 },
      runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 240_000 },
    })).toEqual(['Provider 绑定 · Credential Reference', '权限承载构件 pin · 侧车修订', 'Run Budget Ceiling 状态']);
  });

  it('lists what it binds in the editor\'s words', () => {
    expect(defaultRuleBindingRows(defaultExecutionRuleBindingOf(INPUTS))).toEqual([
      { label: '模型服务', value: 'DeepSeek 开放平台 · deepseek-v4-pro（凭据引用 ref-1）' },
      { label: '工序', value: '基线分析 · ai7.editorial-workspace-profile 1.0.0（方案修订 2）' },
      { label: '预算上限', value: '未设置任务预算上限' },
      { label: '发送内容类别', value: '公开或合成材料' },
      { label: '会得到', value: '稿件分析结果集修订版（基线稿件分析契约 v1）' },
    ]);
  });
});

describe('the words of quick start and its rules', () => {
  it('names a rule by the quick start it gives and its version, and covers only the two whole-Book updates', () => {
    expect(DEFAULT_EXECUTION_RULE_QUICK_LABELS).toEqual({ 'sync-current': '开始同步', 'reanalyze-book': '开始全部重来' });
    expect(defaultExecutionRuleName('sync-current', 3)).toBe('开始同步 · 第 3 版');
    expect(['first-baseline', 'sync-current', 'reanalyze-range', 'reanalyze-book'].filter(isDefaultExecutionRulePattern)).toEqual(['sync-current', 'reanalyze-book']);
  });

  it('says a rule starts nothing by itself, and what quick start does under it', () => {
    expect(DEFAULT_EXECUTION_RULES_STATEMENT).toBe('默认执行规则只在你点快速开始时使用：它不会自己开始任何任务；每次开始都会留下那一次的计划和运行授权，并写明按哪一版规则开始。');
    expect(defaultExecutionRuleDoes('sync-current')).toBe('点「开始同步」后，AI7 先准备计划：计划与这条规则一致时直接开始，只重新分析改动过的部分，其余沿用；有任何不同都停在计划上，等你看过再开始。');
    expect(defaultExecutionRuleDoes('reanalyze-book')).toBe('点「开始全部重来」后，AI7 先准备计划：计划与这条规则一致时直接开始，把整本书重新分析一遍；有任何不同都停在计划上，等你看过再开始。');
  });

  it('says why a quick start is not offered or stopped at the plan', () => {
    expect(QUICK_START_RANGE_REASON).toBe('重新分析所选范围每次都要先选范围，没有快速开始；请先看计划。');
    expect(quickStartNoRuleReason('reanalyze-book')).toBe('这本书还没有「开始全部重来」的默认执行规则：先看计划，可以在完整计划里设为快速开始默认。');
    expect(QUICK_START_DEVELOPER_LIVE).toBe('开发者实时模式下不用默认执行规则：每次都先看计划，再开始任务。');
    expect(ruleDriftReason('开始同步 · 第 1 版', ['Provider 绑定 · 模型', '外发数据类别']))
      .toBe('默认执行规则「开始同步 · 第 1 版」定下的「Provider 绑定 · 模型」、「外发数据类别」已经变化，不能按规则直接开始；请看过计划后再开始，也可以把新的计划设为快速开始默认。');
    expect(setRuleAlreadyReason('开始同步 · 第 1 版')).toBe('默认执行规则「开始同步 · 第 1 版」就是由这份计划设定的，正在使用。');
  });
});
