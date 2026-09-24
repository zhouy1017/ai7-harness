import { describe, expect, it } from 'vitest';
import {
  EXPORT_ACTION_LABELS,
  EXPORT_APPROVE_REASON,
  EXPORT_DEGRADED_NOTE,
  EXPORT_DESTINATION_UNCHOSEN,
  EXPORT_LOCAL_LINE,
  EXPORT_OPTION_LABELS,
  EXPORT_OPTION_NOTES,
  exportOptionNote,
  EXPORT_OPTION_ORDER,
  EXPORT_OPTIONS_NOTE,
  EXPORT_RECORDS_HEADING,
  EXPORT_STATUS_LINES,
  exportAbsentLine,
  exportBytesLabel,
  exportCardHeading,
  exportOpenAccessibleName,
  exportPillText,
  exportPositionsLine,
  exportReceiptMeta,
  exportRecordLine,
  exportSavedRevisionLine,
  exportShownRows,
  exportStatusShape,
} from '../../src/renderer/manuscript-export-labels.js';
import { EXPORT_DISPOSITION_LABELS, EXPORT_FORMATS, EXPORT_OUTCOME_LABELS } from '../../src/service/manuscript-export.js';
import { reportExportLabel } from '../../src/shared/report-wording.js';
import {
  DEFAULT_MANUSCRIPT_EXPORT_OPTIONS,
  EXPORT_FIDELITY_STATUS_LABELS,
  PUBLICATION_FORBIDDEN_WORDS,
  type ExportFidelityRowProjection,
  type ManuscriptExportTargetProjection,
} from '../../src/shared/protocol.js';

// The words of ④ 导出 (Issue #413; editor-surfaces §7 导出, V2-UX-EXP-001 to EXP-024), pinned byte for byte.

const current: ManuscriptExportTargetProjection = { kind: 'current', milestoneId: null, milestoneLabel: null, revisionId: 'r', revisionLabel: 'r3', report: null };
const milestone: ManuscriptExportTargetProjection = { kind: 'milestone', milestoneId: 'm', milestoneLabel: '一审稿', revisionId: 'r', revisionLabel: 'r1', report: null };
// Issue #500 (S64b part 2): the second version of the 审阅报告 of a Book's first Review Run.
const report: ManuscriptExportTargetProjection = {
  kind: 'report', milestoneId: null, milestoneLabel: null, revisionId: 'r', revisionLabel: 'r2',
  report: { reportId: 'p', version: 2, reviewRunId: 'v', runLabel: '第 1 次' },
};

function row(overrides: Partial<ExportFidelityRowProjection>): ExportFidelityRowProjection {
  return {
    key: 'inline-styles', label: '行内样式', count: 0, status: 'preserved', statusLabel: '完整保留', detail: '未检测到行内样式。',
    positions: [], positionsTruncated: false, ...overrides,
  };
}

describe('the words of 导出', () => {
  it('name the actions, the options and their defaults as the specification words them', () => {
    expect(EXPORT_ACTION_LABELS).toEqual({
      open: '导出…', choose: '选择保存位置…', chooseAgain: '重新选择保存位置…', approve: '按上述方式导出', cancel: '取消', close: '完成',
      reveal: '在文件夹中显示',
    });
    expect(EXPORT_OPTION_ORDER.map((key) => [EXPORT_OPTION_LABELS[key], DEFAULT_MANUSCRIPT_EXPORT_OPTIONS[key]])).toEqual([
      ['含批注', true], ['含修改建议（作为修订）', true], ['含备注', false],
    ]);
    expect(EXPORT_OPTION_NOTES.includeEditorNotes).toBe('备注默认不随导出；勾选后作为批注写出，作者为「备注」。');
    expect(EXPORT_OPTIONS_NOTE).toBe('这些选项只改变导出的文件，不改变稿件和稿件上的标记。');
    expect(exportOpenAccessibleName({ kind: 'current' })).toBe('导出当前修订版…');
    expect(exportOpenAccessibleName({ kind: 'milestone', label: '一审稿' })).toBe('导出里程碑版本「一审稿」…');
    expect(exportOpenAccessibleName({ kind: 'report', label: reportExportLabel('第 1 次', 2) })).toBe('导出「审阅报告 · 第 1 次审阅 · 第 2 版」…');
  });

  it('head the card with the exact version, and say when unsaved edits were saved for it', () => {
    expect(exportCardHeading(null, { kind: 'current' })).toBe('导出 · 当前修订版');
    expect(exportCardHeading(null, { kind: 'milestone', label: '一审稿' })).toBe('导出 · 里程碑版本「一审稿」');
    expect(exportCardHeading(current, { kind: 'current' })).toBe('导出 · 当前修订版 r3');
    expect(exportCardHeading(milestone, { kind: 'milestone', label: '一审稿' })).toBe('导出 · 里程碑版本「一审稿」 · r1');
    expect(exportCardHeading(null, { kind: 'report', label: '审阅报告 · 第 1 次审阅 · 第 2 版' })).toBe('导出 · 审阅报告 · 第 1 次审阅 · 第 2 版');
    expect(exportCardHeading(report, { kind: 'report', label: '' })).toBe('导出 · 审阅报告 · 第 1 次审阅 · 第 2 版');
    expect(exportSavedRevisionLine('r3')).toBe('未保存的修改已为导出保存为修订版 r3；这不是里程碑版本。');
    expect(EXPORT_LOCAL_LINE).toBe('导出只写到本机你选择的位置；AI7 不会发送、上传或发布这个文件。');
  });

  it('offer DOCX first, PDF as optional and Markdown only as the 备用格式, with what each promises (Issue #500)', () => {
    expect(EXPORT_FORMATS.map((format) => [format.format, format.label, format.available])).toEqual([
      ['docx', 'DOCX', true], ['pdf', 'PDF', true], ['markdown', 'Markdown（备用格式）', true],
    ]);
    expect(EXPORT_FORMATS[1]!.note).toBe('可选 · 固定版式，适合阅读与打印；不能继续编辑，也不能导回 AI7。');
    expect(EXPORT_FORMATS[2]!.note).toBe('备用格式 · 只写出文字与标题层级，用于迁移或留底。');
    // Markdown is offered only under the 备用格式 disclosure, never as a peer of DOCX and PDF (EXP-005).
    expect(EXPORT_FORMATS.map((format) => [format.format, format.fallback])).toEqual([['docx', false], ['pdf', false], ['markdown', true]]);
    // What each option writes follows the format the card reviews.
    expect(exportOptionNote('includeAnnotations', 'docx')).toBe('作为 Word 批注写出，保留作者名与回复。');
    expect(exportOptionNote('includeAnnotations', 'pdf')).toBe('在正文中标出编号，连同作者名与回复列在文末。');
    expect(exportOptionNote('includeSuggestions', 'markdown')).toBe('待处理的修改建议写成 CriticMarkup 标记，作者写在脚注里。');
    expect(exportOptionNote('includeEditorNotes', 'markdown')).toBe('备注默认不随导出；勾选后写成脚注，作者为「备注」。');
  });

  it('read each review row by its shape as well as its words, and summarize what is nowhere', () => {
    expect(EXPORT_FIDELITY_STATUS_LABELS).toEqual({ preserved: '完整保留', degraded: '降级导出', unavailable: '无法导出', excluded: '本次不含' });
    expect((['preserved', 'degraded', 'unavailable', 'excluded'] as const).map(exportStatusShape)).toEqual(['✓', '△', '⊘', '○']);
    expect(exportPillText(row({ status: 'degraded', statusLabel: '降级导出' }))).toBe('△ 降级导出');
    expect(exportPositionsLine(row({ positions: [2, 5, 9] }))).toBe('涉及稿件第 2、5、9 段。');
    expect(exportPositionsLine(row({ positions: [2], positionsTruncated: true }))).toBe('涉及稿件第 2 段 等。');
    expect(exportPositionsLine(row({}))).toBeNull();
    const rows = [
      row({}),
      row({ key: 'annotations', label: '批注', count: 2 }),
      row({ key: 'editor-notes', label: '备注', status: 'excluded', statusLabel: '本次不含' }),
      row({ key: 'tables', label: '表格' }),
    ];
    expect(exportShownRows(rows).map((entry) => entry.key)).toEqual(['annotations', 'editor-notes']);
    expect(exportAbsentLine(rows)).toBe('未检测到：行内样式、表格。');
    expect(exportAbsentLine([rows[1]!])).toBeNull();
    expect(EXPORT_DEGRADED_NOTE).toBe('标为「降级导出」或「无法导出」的内容会按上面所说的方式处理；选择「按上述方式导出」即表示只对这一次导出接受这些处理。');
  });

  it('leave the destination and its collisions to the system dialog, and wait for it before the approval', () => {
    expect(EXPORT_DESTINATION_UNCHOSEN).toBe('还没有选择保存位置。所选位置已有同名文件时，由系统的保存对话框询问是否替换。');
    expect(EXPORT_APPROVE_REASON).toBe('先选择保存位置。');
    expect(EXPORT_DISPOSITION_LABELS).toEqual({ create: '新建文件', replace: '替换所选位置的同名文件' });
  });

  it('end at 已导出到所选位置 or a classified outcome, and list every export by what it came to', () => {
    expect(EXPORT_OUTCOME_LABELS).toEqual({ exported: '已导出到所选位置', ambiguous: '结果待确认', failed: '未能导出' });
    expect(exportBytesLabel(null)).toBe('—');
    expect(exportBytesLabel(900)).toBe('900 字节');
    expect(exportBytesLabel(12_800)).toBe('12.5 KB');
    expect(exportBytesLabel(3 * 1024 * 1024)).toBe('3.0 MB');
    expect(exportReceiptMeta({ fileName: '稿件.docx', byteLength: 2048 }, '9月22日 10:00')).toBe('「稿件.docx」 · 2.0 KB · 9月22日 10:00');
    expect(exportRecordLine({ outcomeLabel: '已导出到所选位置', fileName: '稿件.docx', target: milestone }, '9月22日 10:00'))
      .toBe('已导出到所选位置 · 「稿件.docx」 · 里程碑版本「一审稿」 · r1 · 9月22日 10:00');
    expect(exportRecordLine({ outcomeLabel: '结果待确认', fileName: '稿件.docx', target: current }, null)).toBe('结果待确认 · 「稿件.docx」 · 修订版 r3');
    expect(exportRecordLine({ outcomeLabel: '已导出到所选位置', fileName: '报告.md', target: report }, null))
      .toBe('已导出到所选位置 · 「报告.md」 · 审阅报告 · 第 1 次审阅 · 第 2 版');
    expect(EXPORT_RECORDS_HEADING).toBe('导出记录');
  });

  it('never say a file was sent, delivered or published (V2-UX-EXP-017)', () => {
    const words = JSON.stringify([
      EXPORT_ACTION_LABELS, EXPORT_OPTION_LABELS, EXPORT_OPTION_NOTES, EXPORT_STATUS_LINES, EXPORT_LOCAL_LINE, EXPORT_DEGRADED_NOTE,
      EXPORT_DESTINATION_UNCHOSEN, EXPORT_OUTCOME_LABELS, EXPORT_FORMATS,
    ]);
    for (const word of PUBLICATION_FORBIDDEN_WORDS) expect(words.includes(word)).toBe(false);
  });
});
