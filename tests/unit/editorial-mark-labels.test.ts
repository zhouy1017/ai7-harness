import { describe, expect, it } from 'vitest';
import {
  DECISION_REASON_ADD,
  DECISION_REASON_CHIPS,
  DECISION_REASON_DISMISS,
  DECISION_REASON_OWN,
  DECISION_REASON_PROMPTS,
  DECISION_REASON_REVISE,
  DECISION_REASON_STATUS,
  decisionReasonLine,
  INSERTION_CONVERT_REASON,
  MARK_KIND_LABELS,
  RESOLVE_CONFLICT_LABEL,
  REVERSAL_CORRECTION_LINE,
  SAFE_MERGE_LINE,
  insertionLine,
  markDriftNote,
  markPointKind,
  markPointLabel,
  markSourceLine,
  markStateLabel,
  markTimeLabel,
  reverseApplyNote,
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
      changeType: 'replace',
      currentText: '原文',
      proposedText: '改后',
      rationale: '',
      atomicGroupId: null,
      application: null,
      decision: disposition === null ? null : {
        decisionId: 'decision', disposition, editedText: disposition === 'rejected' ? null : '改后二', reason: null, reasonSource: null, reasonState: 'none', feedbackEntries: 0, reasonRevisedAt: null, recordedAt: '2026-09-21T00:00:00.000Z',
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
    expect(markStateLabel({ ...suggestionState(null), status: 'applied' })).toBe('已应用');
    expect(markStateLabel({ ...suggestionState(null), status: 'applied', anchorState: 'drifted' })).toBe('已应用 · 之后又改过');
    expect(markStateLabel({ kind: 'annotation', status: 'resolved', anchorState: 'exact', suggestion: null })).toBe('已处理');
    expect(markStateLabel({ kind: 'editor-note', status: 'open', anchorState: 'exact', suggestion: null })).toBe('仅自己可见');
  });

  it('names a version saved from a conflict for what it came from, not as a conversion (Issue #57)', () => {
    const convertedFrom = { markId: 'mark', kind: 'change-suggestion', sourceKind: 'ai7' } as const;
    expect(markSourceLine({ source: editor, convertedFrom, resolvedFrom: { markId: 'mark', conflictKind: 'suggestion' } })).toBe('你 · 由冲突解决生成的新版本');
    expect(markSourceLine({ source: editor, convertedFrom: null, resolvedFrom: { markId: 'mark', conflictKind: 'reversal' } })).toBe('你 · 由撤销冲突生成的更正建议');
    expect(markSourceLine({ source: editor, convertedFrom, resolvedFrom: null })).toBe('你 · 由 AI7 的修改建议转来');
  });

  it('says where a conflict stands on the card: deferred with its time, and kept as the manuscript is (ADR 0085 §3)', () => {
    const deferredAt = new Date(2026, 8, 22, 9, 5).toISOString();
    const conflict = (state: 'unresolved' | 'deferred' | 'resolved', outcome: 'keep-current' | 'new-version' | null, kind: 'suggestion' | 'reversal' = 'suggestion') => ({
      kind, state, deferredAt: state === 'deferred' ? deferredAt : null, outcome, newMarkId: null, resolvedAt: null,
    });
    const drifted = { ...suggestionState(null), anchorState: 'drifted' as const };
    expect(markStateLabel({ ...drifted, conflict: conflict('unresolved', null) })).toBe('待你处理 · 原文已变');
    expect(markStateLabel({ ...drifted, conflict: conflict('deferred', null) })).toBe('待你处理 · 原文已变 · 暂不处理 · 9月22日 09:05');
    expect(markStateLabel({ ...suggestionState('accepted-with-edit'), anchorState: 'drifted', conflict: conflict('deferred', null) }))
      .toBe('已记录 · 尚未写入稿件 · 原文已变 · 暂不处理 · 9月22日 09:05');
    expect(markStateLabel({ ...suggestionState('rejected'), anchorState: 'drifted', conflict: conflict('resolved', 'keep-current') })).toBe('已拒绝 · 保留当前稿件');
    expect(markStateLabel({ ...suggestionState('rejected'), anchorState: 'drifted', conflict: null })).toBe('已拒绝 · 原文已变');
    const applied = { ...suggestionState(null), status: 'applied' as const, anchorState: 'drifted' as const };
    expect(markStateLabel({ ...applied, conflict: conflict('deferred', null, 'reversal') })).toBe('已应用 · 之后又改过 · 暂不处理 · 9月22日 09:05');
    expect(markStateLabel({ ...applied, conflict: conflict('resolved', 'keep-current', 'reversal') })).toBe('已保留当前稿件');
    expect(markStateLabel({ ...applied, conflict: conflict('resolved', 'new-version', 'reversal') })).toBe('已应用 · 之后又改过');
  });

  it('words the conflict entry, the §2 line and a reversal\'s correction exactly', () => {
    expect(RESOLVE_CONFLICT_LABEL).toBe('解决冲突…');
    expect(SAFE_MERGE_LINE).toBe('本段后来改过别处，没有碰到这条建议的原文');
    expect(REVERSAL_CORRECTION_LINE).toBe('已为这处冲突生成更正建议；它在稿件上等你处理，尚未应用。');
  });

  it('says what reversing an Apply will write, and writes a deletion\'s words in again where they were', () => {
    expect(reverseApplyNote('改后', '原文')).toBe('会把「改后」换回「原文」，并记为一次新的应用；原来的应用记录保留，不会被改写。');
    expect(reverseApplyNote('', '原文')).toBe('会在原处重新写入「原文」，并记为一次新的应用；原来的应用记录保留，不会被改写。');
  });

  it('quotes what a drifted mark was made on, or the words an applied deletion took away', () => {
    const { suggestion } = suggestionState(null);
    expect(markDriftNote({ pinnedText: '原文', suggestion })).toBe('原文已变：标记时的文字是「原文」，这段文字后来改过，标记仍留在原处。');
    expect(markDriftNote({ pinnedText: '批注的文字', suggestion: null })).toBe('原文已变：标记时的文字是「批注的文字」，这段文字后来改过，标记仍留在原处。');
    expect(markDriftNote({ pinnedText: '', suggestion })).toBe('原文已变：这里删去了「原文」，删去处后来又改过，标记仍留在原处。');
  });

  it('names the point a mark on no text is drawn as: what was deleted there, or which mark waits there', () => {
    expect(markPointLabel({ kind: 'change-suggestion', deletedText: '原文' }, false)).toBe('已删去「原文」');
    expect(markPointLabel({ kind: 'change-suggestion', deletedText: '原文' }, true)).toBe('已删去「原文」 · 原文已变');
    expect(markPointLabel({ kind: 'annotation', deletedText: null }, true)).toBe('批注 · 原文已变');
  });

  it('words an insertion a file\'s author proposed: at its point, on its card, and when it is reversed (Issue #411)', () => {
    expect(insertionLine('插入的字')).toBe('在此插入「插入的字」');
    expect(markPointLabel({ kind: 'change-suggestion', deletedText: null, insertedText: '插入的字' }, false)).toBe('待插入「插入的字」');
    expect(markPointLabel({ kind: 'change-suggestion', deletedText: null, insertedText: '插入的字' }, true)).toBe('待插入「插入的字」 · 原文已变');
    expect(markPointKind({ deletedText: null, insertedText: '插入的字' })).toBe('insertion');
    expect(markPointKind({ deletedText: '原文', insertedText: null })).toBe('deletion');
    expect(markPointKind({ deletedText: null, insertedText: null })).toBe('mark');
    const { suggestion } = suggestionState(null);
    const insertion = { ...suggestion!, changeType: 'insert' as const, currentText: '', proposedText: '插入的字' };
    expect(markDriftNote({ pinnedText: '', suggestion: insertion })).toBe('原文已变：这里原本建议插入「插入的字」，插入处后来又改过，标记仍留在原处。');
    expect(reverseApplyNote('插入的字', '')).toBe('会删去在此插入的「插入的字」，并记为一次新的应用；原来的应用记录保留，不会被改写。');
    expect(INSERTION_CONVERT_REASON).toBe('插入建议没有原文可以批注，不能转为批注。');
  });

  it('offers reason chips without a preselection and explains an unavailable mark entry', () => {
    expect(DECISION_REASON_CHIPS.rejected).toContain('证据不足');
    expect(DECISION_REASON_CHIPS['accepted-with-edit']).toContain('语言更准确');
    expect(selectionMenuReason('none')).toContain('先选中');
    expect(selectionMenuReason('multiple-blocks')).toContain('同一段落');
    expect(selectionMenuReason('unsettled')).toContain('修订日志');
  });

  it('asks why once after each kind of decision, with the editor’s own words beside the chips and 不说明 to end it (Issue #61, S26a)', () => {
    expect(DECISION_REASON_PROMPTS).toEqual({ accepted: '为什么接受？（可选）', rejected: '为什么拒绝？（可选）', 'accepted-with-edit': '为什么这样改？（可选）' });
    for (const chips of Object.values(DECISION_REASON_CHIPS)) {
      expect(chips.length).toBeGreaterThanOrEqual(2);
      expect(chips.length).toBeLessThanOrEqual(3);
      expect(chips.some((chip) => chip.includes('AI7'))).toBe(false);
    }
    expect([DECISION_REASON_OWN, DECISION_REASON_DISMISS, DECISION_REASON_ADD, DECISION_REASON_REVISE]).toEqual(['其他 / 自行输入', '不说明', '补充原因…', '改原因…']);
    // What each record says back — none of it a celebration, and 不说明 no more than that.
    expect(DECISION_REASON_STATUS).toEqual({
      recorded: '已记下你的原因。', revised: '已改好原因；原来的原因仍留在记录里。', dismissed: '已记下：这次不说明原因。', failed: '原因未能记录。',
    });
    const instant = (iso: string): string => `〔${iso.slice(0, 10)}〕`;
    expect(decisionReasonLine('证据不足', null, instant)).toBe('你的原因：证据不足');
    expect(decisionReasonLine('其实是篇幅所限', '2026-09-25T05:00:00.000Z', instant)).toBe('你的原因：其实是篇幅所限（〔2026-09-25〕 改过）');
  });

  it('writes a time the way the manuscript surface does, and nothing for a time it cannot read', () => {
    expect(markTimeLabel(new Date(2026, 8, 7, 14, 5).toISOString())).toBe('9月7日 14:05');
    expect(markTimeLabel('not a time')).toBe('');
  });
});
