import { describe, expect, it } from 'vitest';
import { TASK_BAR_OFFLINE_LATER } from '../../src/renderer/task-drawer-labels.js';
import { OFFLINE_START_LATER } from '../../src/shared/offline-wording.js';
import { QUICK_START_OFFLINE } from '../../src/service/default-execution-rules.js';
import {
  DEFAULT_EXECUTION_RULES_STATEMENT,
  DEFAULT_EXECUTION_RULE_PROCEDURES,
  DEFAULT_EXECUTION_RULE_QUICK_LABELS,
  QUICK_START_DEVELOPER_LIVE,
  QUICK_START_RANGE_REASON,
  defaultExecutionRuleBindingOf,
  defaultExecutionRuleDoes,
  defaultExecutionRuleDrift,
  defaultExecutionRuleCovers,
  defaultExecutionRuleKind,
  defaultExecutionRuleName,
  defaultExecutionRuleTitle,
  writingRuleOtherTypeReason,
  writingRulePattern,
  writingRuleTypeId,
  writingRuleTypeLabel,
  isDefaultExecutionRulePattern,
  quickStartNoRuleReason,
  ruleDriftReason,
  setRuleAlreadyReason,
} from '../../src/service/default-execution-rules.js';
import { defaultRuleBindingRows } from '../../src/service/task-plan.js';
import { BUILTIN_PRODUCTION_DOCUMENT_TYPES } from '../../src/service/production-document-types.js';
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
    // Every bound field that moves is named in the drawer's words for its field, in the Plan Revision diff's order.
    expect(defaultExecutionRuleDrift(binding, {
      ...INPUTS,
      providerBinding: { ...INPUTS.providerBinding, credentialReference: 'ref-2' },
      artifactPin: { ...INPUTS.artifactPin, sidecarRevision: 3 },
      runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 240_000 },
    })).toEqual(['模型服务 · 连接', '所用工序 · 权限规则版本', '预算上限']);
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
  it('names a rule by the quick start it gives and its version, and covers only the two whole-Book updates and one writing type each', () => {
    expect(DEFAULT_EXECUTION_RULE_QUICK_LABELS).toEqual({ 'sync-current': '开始同步', 'reanalyze-book': '开始全部重来' });
    expect(DEFAULT_EXECUTION_RULE_PROCEDURES).toEqual({ 'baseline-analysis': '基线分析', writing: '写作任务' });
    expect(defaultExecutionRuleName('sync-current', 3)).toBe('开始同步 · 第 3 版');
    // A writing rule is one house type's (#701 review P2-1), named by the Task and its type.
    expect(writingRulePattern('promotion-article')).toBe('writing:promotion-article');
    expect(defaultExecutionRuleName('writing:promotion-article', 1)).toBe('写作任务 · 宣传文章 · 第 1 版');
    expect(defaultExecutionRuleTitle('writing:news-release')).toBe('写作任务 · 新闻稿');
    // A type the house's configuration no longer holds is named by its identity.
    expect(defaultExecutionRuleTitle('writing:gone-type')).toBe('写作任务 · gone-type');
    expect(writingRuleTypeId('writing:news-release')).toBe('news-release');
    expect(writingRuleTypeId('sync-current')).toBeNull();
    expect(writingRuleTypeLabel('writing:news-release')).toBe('新闻稿');
    expect(writingRuleTypeLabel('reanalyze-book')).toBe('');
    expect(defaultExecutionRuleKind('writing:news-release')).toBe('writing');
    expect(defaultExecutionRuleKind('sync-current')).toBe('baseline-analysis');
    expect(['first-baseline', 'sync-current', 'reanalyze-range', 'reanalyze-book', 'writing-first', 'writing-again', 'writing', 'writing:', 'writing:Bad',
      'writing:news-release', 'xwriting:news-release', 'writing:news-release ', `writing:${'a'.repeat(65)}`].filter(isDefaultExecutionRulePattern))
      .toEqual(['sync-current', 'reanalyze-book', 'writing:news-release']);
  });

  it('admits every built-in house type as a writing rule pattern (#701 re-review P3-5)', () => {
    for (const type of BUILTIN_PRODUCTION_DOCUMENT_TYPES.types) {
      expect(isDefaultExecutionRulePattern(writingRulePattern(type.typeId))).toBe(true);
      expect(writingRuleTypeId(writingRulePattern(type.typeId))).toBe(type.typeId);
      expect(defaultExecutionRuleKind(writingRulePattern(type.typeId))).toBe('writing');
    }
  });

  it("names the writing Task's 工序 among what its rule binds (S84b)", () => {
    expect(defaultRuleBindingRows(defaultExecutionRuleBindingOf(INPUTS), '写作任务')[1])
      .toEqual({ label: '工序', value: '写作任务 · ai7.editorial-workspace-profile 1.0.0（方案修订 2）' });
  });

  it('says a rule starts nothing by itself, and what quick start does under it', () => {
    expect(DEFAULT_EXECUTION_RULES_STATEMENT).toBe('默认执行规则只在你点快速开始时使用：它不会自己开始任何任务；每次开始都会留下那一次的计划和运行授权，并写明按哪一版规则开始。');
    expect(defaultExecutionRuleDoes('sync-current')).toBe('点「开始同步」后，AI7 先准备计划：计划与这条规则一致时直接开始，只重新分析改动过的部分，其余沿用；有任何不同都停在计划上，等你看过再开始。');
    expect(defaultExecutionRuleDoes('reanalyze-book')).toBe('点「开始全部重来」后，AI7 先准备计划：计划与这条规则一致时直接开始，把整本书重新分析一遍；有任何不同都停在计划上，等你看过再开始。');
    expect(defaultExecutionRuleDoes('writing:promotion-article')).toBe('在「交付物」的新建文档里选「宣传文章」再点「快速开始」后，AI7 先准备计划：计划与这条规则一致时直接开始，按你写的受众和渠道起草这本书的宣传文章，范例只参照、不复制；有任何不同都停在计划上，等你看过再开始。');
  });

  it('says why a quick start is not offered or stopped at the plan', () => {
    expect(QUICK_START_RANGE_REASON).toBe('重新分析所选范围每次都要先选范围，没有快速开始；请先看计划。');
    expect(quickStartNoRuleReason('reanalyze-book')).toBe('这本书还没有「开始全部重来」的默认执行规则：先看计划，可以在完整计划里设为快速开始默认。');
    expect(quickStartNoRuleReason('writing:news-release')).toBe('这本书还没有「写作任务 · 新闻稿」的默认执行规则：先看计划，可以在完整计划里设为快速开始默认。');
    expect(writingRuleOtherTypeReason('写作任务 · 宣传文章 · 第 1 版', '宣传文章', '新闻稿'))
      .toBe('默认执行规则「写作任务 · 宣传文章 · 第 1 版」是按「宣传文章」的计划设定的，不用于「新闻稿」；请看过这份计划后再开始，也可以把这份计划设为「新闻稿」的快速开始默认。');
    // What a writing rule covers, named where it is confirmed and listed (#701 re-review P2-1).
    expect(defaultExecutionRuleCovers('writing:promotion-article')).toBe('新建文档「宣传文章」');
    expect(defaultExecutionRuleCovers('sync-current')).toBeNull();
    expect(defaultRuleBindingRows(defaultExecutionRuleBindingOf(INPUTS), '写作任务', '新建文档「宣传文章」').at(-1)).toEqual({ label: '适用于', value: '新建文档「宣传文章」' });
    expect(defaultRuleBindingRows(defaultExecutionRuleBindingOf(INPUTS)).map((row) => row.label)).toEqual(['模型服务', '工序', '预算上限', '发送内容类别', '会得到']);
    // Every kind with a quick start waits now (Issue #760, S74c): offline, its quick start stops at the plan whose bar offers
    // 联网后开始任务, and says so. The bar's fallback sentence for a kind without a wait keeps its one shared owner (#714).
    expect(QUICK_START_OFFLINE).toBe('离线：这份计划要连到模型服务，而这台设备现在没有网络；可以在计划里选择联网后开始任务。');
    expect(TASK_BAR_OFFLINE_LATER).toBe(OFFLINE_START_LATER);
    expect(QUICK_START_DEVELOPER_LIVE).toBe('开发者实时模式下不用默认执行规则：每次都先看计划，再开始任务。');
    expect(ruleDriftReason('开始同步 · 第 1 版', ['Provider 绑定 · 模型', '外发数据类别']))
      .toBe('默认执行规则「开始同步 · 第 1 版」定下的「Provider 绑定 · 模型」、「外发数据类别」已经变化，不能按规则直接开始；请看过计划后再开始，也可以把新的计划设为快速开始默认。');
    expect(setRuleAlreadyReason('开始同步 · 第 1 版')).toBe('默认执行规则「开始同步 · 第 1 版」就是由这份计划设定的，正在使用。');
  });
});
