import { describe, expect, it } from 'vitest';
import {
  LEARNING_AUDIT_FILTERS,
  LEARNING_AUDIT_FILTERS_LATER,
  LEARNING_AUDIT_NOTE,
  LEARNING_AUDIT_STANDING_LABELS,
  LEARNING_AUDIT_UNUSED,
  LEARNING_LINEAGE_STEPS,
  LEARNING_LINEAGE_TASKS_NONE,
  LEARNING_LINEAGE_NOT_YET,
  LEARNING_LINEAGE_WHY_EMPTY,
  LEARNING_REMEDIATION_GROUPS,
  LEARNING_REMEDIATION_LEFT_OUT,
  learningAuditBatchStop,
  learningAuditBookHeading,
  learningAuditChoicesCut,
  learningAuditMaterialName,
  learningAuditMaterialNames,
  learningAuditOpenLabel,
  learningAuditSelectLabel,
  learningLineageDecisionLine,
  learningLineageDecisionStatus,
  learningRemediationCompleted,
  learningRemediationFuture,
  learningRemediationLeftOutLine,
  learningRemediationOutcome,
  learningRemediationRereadFailed,
} from '../../src/renderer/learning-audit-labels.js';
import { LEARNING_AUDIT_STANDINGS } from '../../src/shared/protocol.js';

// Unit suite (L1) for 质量与学习 › 学习回溯's words (Issue #62, plan slice S27a; V2-UX-LAUD-001 to LAUD-012).

describe('学习回溯 words', () => {
  it('says what the audit is, grants nothing, and names the filters that wait for records', () => {
    expect(LEARNING_AUDIT_NOTE).toContain('不会删除任何历史');
    expect(LEARNING_AUDIT_NOTE).toContain('不授予任何权限');
    expect(Object.values(LEARNING_AUDIT_FILTERS)).toEqual(['搜索', '图书', '书系', '类型', '准入状态', '起始日期', '截止日期']);
    expect(LEARNING_AUDIT_FILTERS_LATER).toContain('记忆候选、已启用记忆、后续使用和历史影响');
    expect(LEARNING_AUDIT_STANDINGS.map((standing) => LEARNING_AUDIT_STANDING_LABELS[standing])).toEqual([
      '待定', '改过 · 需要重新决定', '稍后决定', '仅纳入当前图书', '纳入出版社经验', '明确排除',
    ]);
    expect(LEARNING_AUDIT_UNUSED).toBe('尚未被任何任务使用');
    expect(learningAuditBookHeading({ title: '回溯之书', materialCount: 3 })).toBe('《回溯之书》 · 3 条');
  });

  it('keeps the lineage in its fixed order and says why the later stages are empty', () => {
    expect(LEARNING_LINEAGE_STEPS.map((entry) => entry.label)).toEqual(['学习材料', '准入决定', '学习信号', '记忆候选', '已启用记忆', '使用过的任务']);
    expect([LEARNING_LINEAGE_NOT_YET, LEARNING_LINEAGE_TASKS_NONE]).toEqual(['尚未生成', '尚未被任何任务使用']);
    expect(LEARNING_LINEAGE_WHY_EMPTY).toContain('并非被隐藏');
    const instant = (iso: string) => `本地 ${iso}`;
    expect(learningLineageDecisionLine({ choice: 'excluded', recordedAt: 'T', note: null }, instant)).toBe('明确排除 · 本地 T');
    expect(learningLineageDecisionLine({ choice: 'book', recordedAt: 'T', note: '只在本书' }, instant)).toBe('仅纳入当前图书 · 本地 T · 只在本书');
    expect(learningLineageDecisionStatus({ superseded: false, currentVersion: true, via: 'learning-audit' })).toBe('现在的决定 · 在学习回溯中停止今后使用');
    expect(learningLineageDecisionStatus({ superseded: true, currentVersion: false, via: 'learning-eligibility' })).toBe('已被后来的决定取代 · 针对材料较早的版本');
  });

  it('states the remediation preview in its four groups, and each item left out with why', () => {
    expect(LEARNING_REMEDIATION_GROUPS.map((entry) => entry.label)).toEqual(['未来使用', '正在运行', '候选或已启用记忆', '已完成历史']);
    expect(learningRemediationFuture(2, 'book', '回溯之书')).toBe('2 条学习材料今后不再可用于学习（原来是仅纳入《回溯之书》）；它们会显示为明确排除。');
    expect(learningRemediationFuture(1, 'house', '回溯之书')).toContain('原来是纳入出版社经验');
    expect(learningRemediationFuture(0, null, '回溯之书')).toBe('所选材料中没有可以停止今后使用的。');
    expect(learningRemediationCompleted(3)).toContain('此前的 3 个准入决定，都原样保留');
    expect(Object.keys(LEARNING_REMEDIATION_LEFT_OUT).sort()).toEqual(['changed', 'different-kind', 'different-scope', 'duplicate', 'not-found', 'not-included']);
    expect(learningRemediationLeftOutLine({ name: '修改建议 · 拒绝 · 本地 T · 你的原因：甲', reason: 'changed' })).toBe('修改建议 · 拒绝 · 本地 T · 你的原因：甲：在你选中之后改过，不在本次之列');
    expect(learningRemediationLeftOutLine({ name: null, reason: 'not-found' })).toBe('一条学习材料：已经不在学习材料之列，不在本次之列');
    expect(learningRemediationOutcome(1, 0)).toBe('已停止今后使用 1 条学习材料。');
    expect(learningRemediationOutcome(1, 1)).toBe('已停止今后使用 1 条学习材料；另有 1 条未处理。');
    expect(learningAuditBatchStop(2)).toBe('停止今后使用所选 2 条…');
    expect(learningRemediationRereadFailed('已停止今后使用 1 条学习材料。')).toBe('已停止今后使用 1 条学习材料。但学习回溯没能重新读取，列表可能还是之前的状态；请稍后重新打开。');
  });

  it('names each material by its origin, time and own last line, so rows sharing an origin are told apart', () => {
    const instant = (iso: string) => `本地 ${iso}`;
    const name = learningAuditMaterialName({ originLabel: '修改建议 · 拒绝', recordedAt: 'T', excerpt: ['原文：甲', '你的原因：篇幅'] }, instant);
    expect(name).toBe('修改建议 · 拒绝 · 本地 T · 你的原因：篇幅');
    expect(learningAuditMaterialName({ originLabel: '审阅 · 错别字', recordedAt: 'T', excerpt: [] }, instant)).toBe('审阅 · 错别字 · 本地 T');
    expect([learningAuditSelectLabel(name), learningAuditOpenLabel(name)]).toEqual([`选择：${name}`, `查看来源链：${name}`]);
  });

  it('tells apart, by an ordinal in page order, only the materials on a page whose names read alike (Issue #677)', () => {
    const instant = (iso: string) => `本地 ${iso}`;
    const material = (materialKey: string, excerpt: string[], recordedAt = 'T') => ({ materialKey, originLabel: '修改建议 · 拒绝', recordedAt, excerpt });
    const names = learningAuditMaterialNames([
      material('a', ['原文：甲', '你的原因：篇幅']),
      material('b', ['原文：乙']),
      material('c', ['原文：丙', '你的原因：篇幅']),
      material('d', ['原文：丁', '你的原因：篇幅'], 'U'),
      material('e', ['原文：戊', '你的原因：篇幅']),
      material('f', ['原文：己', '你的原因：不符合体例']),
      material('g', ['原文：庚', '你的原因：不符合体例']),
    ], instant);
    expect([...names]).toEqual([
      ['a', '修改建议 · 拒绝 · 本地 T · 你的原因：篇幅（第 1 条）'],
      ['b', '修改建议 · 拒绝 · 本地 T · 原文：乙'],
      ['c', '修改建议 · 拒绝 · 本地 T · 你的原因：篇幅（第 2 条）'],
      ['d', '修改建议 · 拒绝 · 本地 U · 你的原因：篇幅'],
      ['e', '修改建议 · 拒绝 · 本地 T · 你的原因：篇幅（第 3 条）'],
      // Each group that reads alike counts on its own.
      ['f', '修改建议 · 拒绝 · 本地 T · 你的原因：不符合体例（第 1 条）'],
      ['g', '修改建议 · 拒绝 · 本地 T · 你的原因：不符合体例（第 2 条）'],
    ]);
    expect(new Set(names.values()).size).toBe(7);
    expect(learningAuditMaterialNames([], instant).size).toBe(0);
  });

  it('says a filter lists only the first of the house’s Books or Series, and a refusal not read again that the list may be out of date (Issue #677)', () => {
    expect(learningAuditChoicesCut('book', 1200)).toBe('图书筛选只列出按书名排序的前 1200 本图书。');
    expect(learningAuditChoicesCut('series', 500)).toBe('书系筛选只列出按名称排序的前 500 个书系。');
    expect(learningRemediationRereadFailed('预览之后，这些学习材料或它们的准入决定有了变化；请重新查看影响，再决定。'))
      .toBe('预览之后，这些学习材料或它们的准入决定有了变化；请重新查看影响，再决定。但学习回溯没能重新读取，列表可能还是之前的状态；请稍后重新打开。');
  });
});
