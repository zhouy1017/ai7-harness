import { describe, expect, it } from 'vitest';
import {
  DECISION_REASON_CHIPS,
  MARK_KIND_LABELS,
  markSourceLine,
  markStateLabel,
  markTimeLabel,
  selectionMenuReason,
} from '../../src/renderer/editorial-mark-labels.js';
import type { EditorialMarkCardProjection } from '../../src/shared/protocol.js';

const editor = { kind: 'editor', origin: null, label: null, taskId: null } as const;

function suggestionState(disposition: 'rejected' | 'accepted-with-edit' | null): Pick<EditorialMarkCardProjection, 'kind' | 'status' | 'anchorState' | 'suggestion'> {
  return {
    kind: 'change-suggestion',
    status: disposition === 'rejected' ? 'resolved' : 'open',
    anchorState: 'exact',
    suggestion: {
      itemId: 'item',
      currentText: '原文',
      proposedText: '改后',
      rationale: '',
      atomicGroupId: null,
      decision: disposition === null ? null : {
        decisionId: 'decision', disposition, editedText: disposition === 'rejected' ? null : '改后二', reason: null, reasonSource: null, recordedAt: '2026-09-21T00:00:00.000Z',
      },
    },
  };
}

describe('the wording of the Mark surface', () => {
  it('names the four kinds in the editor\'s words', () => {
    expect(MARK_KIND_LABELS).toEqual({ 'change-suggestion': '修改建议', annotation: '批注', 'editor-note': '备注', 'personal-highlight': '高亮' });
  });

  it('says who a mark comes from, and what it was converted from (V2-UX-MARK-002)', () => {
    expect(markSourceLine({ source: editor, convertedFrom: null })).toBe('你');
    expect(markSourceLine({ source: { kind: 'ai7', origin: 'review-category', label: '人名与称谓一致', taskId: null }, convertedFrom: null }))
      .toBe('AI7 · 审阅「人名与称谓一致」');
    expect(markSourceLine({ source: { kind: 'ai7', origin: 'task', label: '核查人名与称谓一致', taskId: 'task' }, convertedFrom: null }))
      .toBe('AI7 · 任务「核查人名与称谓一致」');
    expect(markSourceLine({ source: { kind: 'ai7', origin: 'analysis', label: '分析', taskId: null }, convertedFrom: null })).toBe('AI7 · 分析');
    expect(markSourceLine({ source: { kind: 'imported-author', origin: null, label: '示例作者', taskId: null }, convertedFrom: null }))
      .toBe('示例作者（导入文件的作者）');
    expect(markSourceLine({ source: editor, convertedFrom: { markId: 'mark', kind: 'annotation', sourceKind: 'ai7' } })).toBe('你 · 由 AI7 的批注转来');
    expect(markSourceLine({ source: editor, convertedFrom: { markId: 'mark', kind: 'personal-highlight', sourceKind: 'editor' } })).toBe('你 · 由高亮转来');
  });

  it('never calls a recorded acceptance an applied change', () => {
    expect(markStateLabel(suggestionState(null))).toBe('待你处理');
    expect(markStateLabel(suggestionState('rejected'))).toBe('已拒绝');
    expect(markStateLabel(suggestionState('accepted-with-edit'))).toBe('已记录 · 尚未写入稿件');
    expect(markStateLabel({ ...suggestionState(null), anchorState: 'drifted' })).toBe('待你处理 · 原文已变');
    expect(markStateLabel({ kind: 'annotation', status: 'resolved', anchorState: 'exact', suggestion: null })).toBe('已处理');
    expect(markStateLabel({ kind: 'editor-note', status: 'open', anchorState: 'exact', suggestion: null })).toBe('仅自己可见');
  });

  it('offers reason chips without a preselection and explains an unavailable mark entry', () => {
    expect(DECISION_REASON_CHIPS.rejected).toContain('证据不足');
    expect(DECISION_REASON_CHIPS['accepted-with-edit']).toContain('语言更准确');
    expect(selectionMenuReason('none')).toContain('先选中');
    expect(selectionMenuReason('multiple-blocks')).toContain('同一段落');
    expect(selectionMenuReason('unsettled')).toContain('修订日志');
  });

  it('writes a time the way the manuscript surface does, and nothing for a time it cannot read', () => {
    expect(markTimeLabel(new Date(2026, 8, 7, 14, 5).toISOString())).toBe('9月7日 14:05');
    expect(markTimeLabel('not a time')).toBe('');
  });
});
