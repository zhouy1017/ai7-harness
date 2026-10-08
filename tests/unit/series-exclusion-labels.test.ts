import { describe, expect, it } from 'vitest';
import {
  EXCLUSIONS_NOTE,
  EXCLUSIONS_UNREAD_NOTE,
  EXCLUSION_KIND_CHOICES,
  exclusionChoiceLine,
  exclusionLine,
  exclusionPreviewRows,
  exclusionReasonLine,
  exclusionRevisionByline,
  exclusionRevisionLine,
} from '../../src/renderer/series-exclusion-labels.js';
import { REVIEW_ACTION_LABELS, REVIEW_RUN_STATE_PILLS, REVIEW_SCOPE_STOP_NOTE } from '../../src/renderer/review-labels.js';

// Unit suite for 书系检索排除's words (Issue #64, plan slice S29b; V2-UX-SER-020 to SER-029) and the 审阅 words of a Run an
// exclusion stopped: every line the page builds from a projection, pinned.

const instant = (iso: string): string => `[${iso}]`;
const target = { kind: 'knowledge-item' as const, id: 'i', label: '书系知识条目「海边小城」（地点）', continuing: '这个条目现在和以后的修订版都一并排除。', read: true };

describe('书系检索排除 on a Series\' page', () => {
  it('states an immediate restriction of this Series\' retrieval and nothing more', () => {
    expect(EXCLUSIONS_NOTE).toContain('记录后立即生效');
    expect(EXCLUSIONS_NOTE).toContain('不删除、不隐藏图书或稿件');
    expect(EXCLUSIONS_UNREAD_NOTE).toBe('现在还没有哪项书系检索读取来源版本；这条排除先记下，以后读取来源版本的检索都要遵守。');
    expect(EXCLUSION_KIND_CHOICES.map((choice) => choice.label)).toEqual(['书系知识条目', '知识类别', '成员图书', '来源版本']);
  });

  it('names an exclusion in force, a revision, and a target already excluded', () => {
    expect(exclusionLine({ target, effectiveSince: 'T' }, instant)).toBe('书系知识条目「海边小城」（地点） · 自 [T] 起排除');
    expect(exclusionReasonLine('')).toBe('（未填写理由）');
    expect(exclusionReasonLine('待核对')).toBe('理由：待核对');
    expect(exclusionRevisionLine({ actionLabel: '停止此排除', target })).toBe('停止此排除：书系知识条目「海边小城」（地点）');
    expect(exclusionRevisionByline({ actor: '本机编辑', recordedAt: 'T', revision: 2, reason: '' }, instant)).toBe('本机编辑 · [T] · 第 2 版 · （未填写理由）');
    expect(exclusionChoiceLine({ ...target, excluded: true })).toBe('书系知识条目「海边小城」（地点） · 已排除');
    expect(exclusionChoiceLine({ ...target, excluded: false })).toBe('书系知识条目「海边小城」（地点）');
  });

  it('opens the preview with exact target, scope, effective time, how far it reaches, reason and actor (SER-021)', () => {
    expect(exclusionPreviewRows({ target, scope: '只限书系「星河三部曲」的书系检索', effectiveTime: '记录后立即生效', reason: '', actor: '本机编辑' })).toEqual([
      ['对象', '书系知识条目「海边小城」（地点）'],
      ['范围', '只限书系「星河三部曲」的书系检索'],
      ['生效时间', '记录后立即生效'],
      ['持续范围', '这个条目现在和以后的修订版都一并排除。'],
      ['理由', '（未填写理由）'],
      ['操作人', '本机编辑'],
    ]);
  });
});

describe('a Review Run an exclusion stopped, in 审阅', () => {
  it('offers exactly 修改计划并重新授权 and 取消任务, and reads the stop as a decision, never a failure', () => {
    expect([REVIEW_ACTION_LABELS['scope-redo'], REVIEW_ACTION_LABELS['scope-cancel'], REVIEW_ACTION_LABELS['scope-cancel-confirm']])
      .toEqual(['修改计划并重新授权', '取消任务', '确认取消任务']);
    expect(REVIEW_SCOPE_STOP_NOTE).toContain('不能继续审阅、重试或改用别的材料');
    expect(REVIEW_SCOPE_STOP_NOTE).toContain('已经发给模型服务的内容无法收回');
    expect(REVIEW_RUN_STATE_PILLS['scope-changed']).toEqual({ tone: 'attention', shape: 'triangle' });
    expect(REVIEW_RUN_STATE_PILLS.cancelled).toEqual({ tone: 'neutral', shape: 'dash' });
  });
});
