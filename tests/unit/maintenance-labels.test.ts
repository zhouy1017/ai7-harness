import { describe, expect, it } from 'vitest';
import * as labels from '../../src/renderer/maintenance-labels.js';
import * as wording from '../../src/shared/maintenance-wording.js';
import { MAINTENANCE_CLASSIFICATIONS, PUBLICATION_FORBIDDEN_WORDS } from '../../src/shared/protocol.js';

// The words of 维护事项 (Issue #426, plan slice S68a; V2-UX-MAINT-001 to 011, ADR 0040), byte for byte: the page's own and
// the shared ones the service records and the page shows.

describe('the words of 维护事项', () => {
  it('names the six classifications unselected, what each does, and the sentence 撤回 and 归档 carry', () => {
    expect(MAINTENANCE_CLASSIFICATIONS.map((classification) => wording.MAINTENANCE_CLASSIFICATION_LABELS[classification]))
      .toEqual(['更正', '勘误', '替代', '撤回', '再版', '归档']);
    expect(wording.MAINTENANCE_CONSEQUENCES).toEqual({
      correction: '用修改建议改正文字：接受并应用后得到新的修订版；这个发稿版本不变，新的发稿版本需要另行设定。',
      errata: '写一份勘误，说明发现的错误和更正方式；勘误本身不改动稿件。',
      supersession: '另设一个更新的发稿版本，在 AI7 中取代这一版；这一版保持不变。',
      withdrawal: '这一版在 AI7 中不再用于发稿；它仍可查看，也仍可导出。',
      reissue: '新的印次或版次另设一个发稿版本，可以沿用同一个修订版。',
      archive: '这一版的维护到此结束；它的发稿用途和全部记录都不变。',
    });
    expect(wording.MAINTENANCE_INTERNAL_ONLY).toBe('仅在 AI7 内记录；不代表已撤稿、下架、召回、通知接收方或删除外部文件');
    expect(wording.MAINTENANCE_STATUS_LABELS).toEqual({ unresolved: '未解决', waiting: '等待另设发稿版本', complete: '已完成（AI7 内记录）' });
    expect(wording.MAINTENANCE_STEP_LABELS).toEqual({
      recorded: '记录维护事项', 'proposal-linked': '关联修改建议', 'publication-linked': '关联发稿版本', 'errata-saved': '保存勘误版本', concluded: '记录维护事项结论',
    });
    expect(wording.MAINTENANCE_NEXT_STEP_LABELS).toEqual({
      'link-proposal': '关联修改建议', 'link-publication': '关联发稿版本', 'write-errata': '编写勘误', conclude: '记录维护事项结论',
    });
    expect([wording.MAINTENANCE_RECORDED, wording.MAINTENANCE_CONCLUDED]).toEqual(['维护事项已记录', '维护事项结论已记录']);
    expect(wording.maintenanceWithdrawnLine('发稿版本「一审稿」 · r1')).toBe('发稿版本「一审稿」 · r1 · 已在 AI7 内撤回');
    expect([wording.MAINTENANCE_WITHDRAWN, wording.MAINTENANCE_ARCHIVED]).toEqual(['已在 AI7 内撤回', '维护已归档']);
  });

  it('says what the draft binds, what a case stands at, each revision and what it links', () => {
    expect(labels.MAINTENANCE_HEADING).toBe('维护事项');
    expect(labels.MAINTENANCE_ACTION_LABELS).toEqual({
      record: '记录维护事项…', confirmRecord: '记录维护事项', cancel: '取消', openCase: '查看', closeCase: '收起', linkProposal: '关联修改建议…',
      linkPublication: '关联发稿版本…', confirmLink: '关联', writeErrata: '编写勘误…', saveErrata: '保存勘误版本', conclude: '记录维护事项结论…', confirmConclude: '记录结论',
      older: '更早的维护事项…',
    });
    expect(labels.maintenanceRecordAccessibleName(2)).toBe('为第 2 次设为发稿版本记录维护事项…');
    expect([labels.MAINTENANCE_CLASSIFICATION_LEGEND, labels.MAINTENANCE_REASON_LABEL, labels.MAINTENANCE_EVIDENCE_LABEL, labels.MAINTENANCE_EVIDENCE_HINT])
      .toEqual(['维护类型', '原因', '依据（可选）', '例如读者来信、质检单或核对记录。']);
    expect(labels.maintenanceDraftTargetLine('第 1 次 · 「一审稿」 · r1 · 纸质版首印')).toBe('维护事项绑定到：第 1 次 · 「一审稿」 · r1 · 纸质版首印');
    expect(labels.MAINTENANCE_BLOCKERS).toEqual({
      classification: '先选择维护类型。', reason: '请写明原因（1–500 个字）。', evidence: '依据最多 500 个字；不填写时请留空。', choice: '先选择一项。',
      errata: '请写下勘误（1–4000 个字）。', conclusion: '先选择结论。', outcome: '请写明结论（1–500 个字）。',
    });
    expect(labels.maintenanceCaseLine({ ordinal: 1, classificationLabel: '勘误', statusLabel: '未解决', nextStep: 'write-errata' })).toBe('第 1 项 · 勘误 · 未解决 · 下一步：编写勘误');
    expect(labels.maintenanceCaseLine({ ordinal: 4, classificationLabel: '撤回', statusLabel: '已完成（AI7 内记录）', nextStep: null })).toBe('第 4 项 · 撤回 · 已完成（AI7 内记录）');
    expect(labels.maintenanceCaseAccessibleName({ ordinal: 1, classificationLabel: '勘误' })).toBe('查看第 1 项维护事项（勘误）');
    expect(labels.maintenanceOlderLine(3)).toBe('还有 3 项更早的维护事项');
    expect(labels.maintenanceCaseHeading(1, '勘误')).toBe('第 1 项维护事项 · 勘误');
    expect(labels.maintenanceTargetLine('第 1 次 · 「一审稿」 · r1 · 纸质版首印')).toBe('绑定的发稿版本：第 1 次 · 「一审稿」 · r1 · 纸质版首印');
    expect(labels.maintenanceStatusLine('等待另设发稿版本', 'link-publication')).toBe('状态：等待另设发稿版本 · 下一步：关联发稿版本');
    expect(labels.maintenanceStatusLine('已完成（AI7 内记录）', null)).toBe('状态：已完成（AI7 内记录）');
    expect([labels.MAINTENANCE_TIMELINE_LABEL, labels.MAINTENANCE_REVISIONS_TRUNCATED]).toEqual(['维护事项的记录', '更早的记录保留在这个维护事项中。']);
    expect(labels.maintenanceRevisionLine({ revision: 2, stepLabel: '保存勘误版本', statusLabel: '未解决' }, '9月24日 21:30')).toBe('第 2 条 · 保存勘误版本 · 未解决 · 9月24日 21:30');
    expect(labels.maintenanceReasonLine('recorded', '读者来信')).toBe('原因：读者来信');
    expect(labels.maintenanceReasonLine('concluded', '勘误已记录')).toBe('结论：勘误已记录');
    expect(labels.maintenanceEvidenceLine('质检单 12')).toBe('依据：质检单 12');
    expect(labels.maintenanceLinkLine({ kind: 'proposal', markId: 'm', label: '修改建议 · 「甲」→「乙」', stateLabel: '已应用' })).toBe('关联：修改建议 · 「甲」→「乙」 · 已应用');
    expect(labels.maintenanceLinkLine({ kind: 'publication-version', publicationVersionId: 'p', label: '第 2 次 · 「更正稿」 · r2 · 纸质版二印' }))
      .toBe('关联发稿版本：第 2 次 · 「更正稿」 · r2 · 纸质版二印');
    expect(labels.maintenanceLinkLine({ kind: 'errata', errataVersionId: 'e', version: 3 })).toBe('勘误第 3 版');
    expect(labels.maintenanceErrataHeading(3)).toBe('勘误 · 第 3 版');
    expect(labels.MAINTENANCE_NO_PROPOSALS).toBe('这个发稿版本之后，稿件上还没有修改建议：先在稿件中提出修改建议，再回到这里关联。');
    expect(labels.MAINTENANCE_NO_PUBLICATIONS).toBe('还没有在这个发稿版本之后另设的发稿版本：先保存里程碑版本，再另行设为发稿版本。');
    expect([labels.MAINTENANCE_PROPOSALS_LEGEND, labels.MAINTENANCE_PUBLICATIONS_LEGEND, labels.MAINTENANCE_ERRATA_LABEL, labels.MAINTENANCE_CONCLUSION_LEGEND, labels.MAINTENANCE_OUTCOME_LABEL])
      .toEqual(['这个发稿版本之后提出的修改建议', '之后另设的发稿版本', '勘误内容', '结论', '结论说明']);
    expect(labels.MAINTENANCE_CONCLUSION_CHOICES).toEqual({ unresolved: '仍未解决', complete: '已完成（AI7 内记录）' });
    expect(labels.MAINTENANCE_COMPLETE_AFTER_LINK).toBe('关联另行设定的发稿版本之后，才能记为已完成。');
    expect(labels.MAINTENANCE_STATUS_LINES).toEqual({
      reading: '正在读取维护事项…', readFailed: '无法读取维护事项。', recording: '正在记录维护事项…', recordFailed: '未能记录维护事项。',
      stepping: '正在记录这一步…', stepFailed: '未能记录这一步。', cancelled: '已取消，没有记录维护事项。',
      loadingOlder: '正在读取更早的维护事项…', olderLoaded: '已列出更早的维护事项', olderFailed: '无法读取更早的维护事项。',
    });
  });

  it('never says a text was published, sent, withdrawn, taken down, recalled or reissued outside AI7 (MAINT-008, MAINT-011)', () => {
    const words = [
      ...Object.values(wording.MAINTENANCE_CLASSIFICATION_LABELS), ...Object.values(wording.MAINTENANCE_CONSEQUENCES),
      ...Object.values(wording.MAINTENANCE_STATUS_LABELS), ...Object.values(wording.MAINTENANCE_STEP_LABELS), ...Object.values(wording.MAINTENANCE_NEXT_STEP_LABELS),
      wording.MAINTENANCE_RECORDED, wording.MAINTENANCE_CONCLUDED, wording.maintenanceWithdrawnLine('发稿版本「一审稿」 · r1'), wording.MAINTENANCE_ARCHIVED,
      labels.MAINTENANCE_HEADING, ...Object.values(labels.MAINTENANCE_ACTION_LABELS), labels.maintenanceRecordAccessibleName(1),
      labels.MAINTENANCE_CLASSIFICATION_LEGEND, labels.MAINTENANCE_REASON_LABEL, labels.MAINTENANCE_EVIDENCE_LABEL, labels.MAINTENANCE_EVIDENCE_HINT,
      ...Object.values(labels.MAINTENANCE_BLOCKERS), labels.maintenanceOlderLine(3), labels.MAINTENANCE_COMPLETE_AFTER_LINK, labels.MAINTENANCE_TIMELINE_LABEL, labels.MAINTENANCE_REVISIONS_TRUNCATED,
      labels.MAINTENANCE_NO_PROPOSALS, labels.MAINTENANCE_NO_PUBLICATIONS, ...Object.values(labels.MAINTENANCE_CONCLUSION_CHOICES),
      ...Object.values(labels.MAINTENANCE_STATUS_LINES),
    ];
    for (const phrase of words) {
      for (const forbidden of [...wording.MAINTENANCE_FORBIDDEN_COMPLETIONS, ...PUBLICATION_FORBIDDEN_WORDS]) expect(phrase).not.toContain(forbidden);
    }
    // The one sentence that names them does so to say none of them happened.
    expect(wording.MAINTENANCE_INTERNAL_ONLY.startsWith('仅在 AI7 内记录；不代表')).toBe(true);
  });
});
