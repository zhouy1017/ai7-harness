import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PUBLICATION_FORBIDDEN_WORDS, type ProductionDocumentProjection } from '../../src/shared/protocol.js';
import * as labels from '../../src/renderer/production-document-labels.js';
import { documentStanding } from '../../src/renderer/production-document-lens.js';

// The words of 交付 · 生产文档 (Issue #415, plan slices S66a and S66b; V2-UX-DELIV-001 to DELIV-004, WORK-013, MILE-014),
// byte for byte.

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const identity = '00000000-0000-4000-8000-000000000000';
const document: ProductionDocumentProjection = {
  documentId: identity,
  branchId: identity,
  createdAt: '2026-09-24T02:00:00.000Z',
  origin: { sourceVersionId: identity, displayName: '新闻稿初稿.docx' },
  versions: [
    { revisionId: identity, label: '版本 2', ordinal: 2, createdAt: '2026-09-24T03:00:00.000Z', revisionDigest: 'a'.repeat(64) },
    { revisionId: identity, label: '版本 1', ordinal: 1, createdAt: '2026-09-24T02:00:00.000Z', revisionDigest: 'b'.repeat(64) },
  ],
  versionsTruncated: false,
  changedSinceVersion: true,
  journalSequence: 3,
  workingDigest: 'c'.repeat(64),
  deliveries: [],
  deliveriesTruncated: false,
  changedSinceDelivery: false,
  workflow: {
    profile: { id: 'ai7.manuscript.editorial.zh-CN', name: '基础书稿编辑流程', version: '2.0.0', activatedAt: '2026-09-24T02:00:00.000Z' },
    summary: '七个阶段都未开始',
    next: [],
    phases: [],
    transitions: 0,
  },
};

describe('the words of 交付 · 生产文档', () => {
  it('names the block, a card\'s states and every action in the specification\'s words', () => {
    expect(labels.DOCUMENTS_HEADING).toBe('交付 · 生产文档');
    expect(labels.DOCUMENTS_LEDE).toBe('每一类生产文档有自己的版本，与稿件的发稿互不影响。');
    expect(labels.DOCUMENT_STATE_NONE).toBe('尚未创建');
    expect(labels.DOCUMENT_STATE_NOT_FOR_THIS_BOOK).toBe('本书不做');
    expect(labels.DOCUMENT_KEPT_NOTE).toBe('文档与它的版本都保留；恢复后照常处理。');
    expect(labels.DOCUMENT_CHANGED_SINCE_VERSION).toBe('有修改尚未保存为版本');
    expect(labels.DOCUMENT_NO_SOURCES).toBe('先把文档的初稿作为来源材料导入：导入稿件时选「作为来源材料导入」。');
    expect(labels.DOCUMENT_ACTION_LABELS).toEqual({
      create: '从来源材料创建…',
      confirmCreate: '创建文档',
      cancel: '取消',
      open: '打开',
      notForThisBook: '本书不做',
      restore: '恢复',
      saveVersion: '保存为版本',
      back: '返回交付物',
      deliver: '交付…',
      redeliver: '再交付…',
      confirmDeliver: '交付',
    });
    expect(labels.documentActionName('create', '新闻稿')).toBe('从来源材料创建…：新闻稿');
  });

  it('says what a card holds: the latest version and the material, and a material by its name, format and time', () => {
    expect(labels.documentCardLine(document)).toBe('版本 2 · 由「新闻稿初稿.docx」创建');
    expect(labels.documentSourceLine({ sourceVersionId: identity, displayName: '新闻稿初稿.docx', format: 'DOCX', createdAt: '' }, '9月24日 10:00'))
      .toBe('新闻稿初稿.docx · DOCX · 导入于 9月24日 10:00');
    expect(labels.documentCreatedLine('新闻稿')).toBe('已创建「新闻稿」');
    expect(labels.documentVersionSavedLine('版本 3')).toBe('已保存为版本 3');
    expect(labels.documentVersionLine('版本 2', '9月24日 11:00')).toBe('版本 2 · 9月24日 11:00');
  });

  it('names the document\'s surface by versions, never by milestones, 签发 or 发稿, and never says 已交付', () => {
    const surface = [
      labels.DOCUMENT_SURFACE_LABEL, labels.DOCUMENT_CURRENT_VERSION, labels.DOCUMENT_LENS_LABEL, labels.DOCUMENT_VERSIONS_HEADING,
      labels.DOCUMENT_VERSIONS_TRUNCATED, labels.DOCUMENT_VERSION_CURRENT_MARK, labels.DOCUMENT_MATERIALS_HEADING,
      labels.DOCUMENT_MATERIALS_EMPTY, labels.DOCUMENT_CHANGED_SINCE_VERSION, ...Object.values(labels.DOCUMENT_ACTION_LABELS),
      ...Object.values(labels.DOCUMENT_STATUS_LINES), labels.DOCUMENT_NOT_DELIVERED, labels.DOCUMENT_CHANGED_SINCE_DELIVERY,
      labels.DOCUMENT_DELIVERIES_HEADING, labels.DELIVERY_FORM_HEADING, labels.DELIVERY_VERSION_LEGEND, labels.DELIVERY_UNSAVED_NOTE,
      labels.DELIVERY_RECIPIENT_LEGEND, labels.DELIVERY_CUSTOM_RECIPIENT, labels.DELIVERY_CUSTOM_LABEL, labels.DELIVERY_NOTE_LABEL,
      labels.DELIVERY_STATEMENT, ...Object.values(labels.DELIVERY_BLOCKERS), labels.DELIVERY_NO_EXPORT,
      labels.documentDeliveryLine({ ordinal: 1, recipient: { kind: 'publicity', label: '宣传部' }, versionLabel: '版本 2' }, '9月24日 11:00'),
      labels.documentDeliveredLine(1, '宣传部'), labels.documentCurrentTextChoice(3),
      labels.RECOVERY_RESTORED_SECTION_LABEL, labels.RECOVERY_RESTORED_HEADING,
    ];
    expect(labels.DOCUMENT_LENS_LABEL).toBe('工作流程');
    expect(labels.DOCUMENT_VERSIONS_HEADING).toBe('版本与交付');
    expect(labels.DOCUMENT_MATERIALS_HEADING).toBe('这份文档的材料');
    expect(labels.DOCUMENT_MATERIALS_EMPTY).toBe('暂无材料。任务简报、引语台账、事实核查记录与参考的范例会列在这里。');
    for (const words of surface) {
      expect(words).not.toMatch(/里程碑|签发|发稿/u);
      for (const forbidden of PUBLICATION_FORBIDDEN_WORDS) expect(words).not.toContain(forbidden);
    }
  });

  it('stops asking for a decision once a restore stands and nothing it restored could open (Issue #593)', () => {
    expect([labels.RECOVERY_RESTORED_SECTION_LABEL, labels.RECOVERY_RESTORED_HEADING]).toEqual(['稿件恢复优先 · 已恢复', '已恢复所选的文字']);
    for (const words of [labels.RECOVERY_RESTORED_SECTION_LABEL, labels.RECOVERY_RESTORED_HEADING]) expect(words).not.toMatch(/待确认|先确认|选择/u);
  });

  it('puts those words on the recovery screen and hides its lede and legend, from the catch that closes its choices (Issue #603)', () => {
    const words = {
      sectionLabel: { textContent: '稿件恢复优先 · 1 项待确认' },
      heading: { textContent: '先确认中断后的稿件状态' },
      lede: { hidden: false },
      legend: { hidden: false },
    };
    labels.showRestoreStands(words);
    expect(words).toEqual({
      sectionLabel: { textContent: '稿件恢复优先 · 已恢复' },
      heading: { textContent: '已恢复所选的文字' },
      lede: { hidden: true },
      legend: { hidden: true },
    });
    // The renderer has no DOM test layer, so where it applies them is read from its source: once, in the catch where the
    // restore stands, after the choices close and before the reopen is offered.
    const source = readFileSync(join(ROOT, 'src', 'renderer', 'index.ts'), 'utf8').replace(/\r\n/gu, '\n');
    // The call is a statement of the catch itself: on its own line at the catch's indentation, after the choices close and
    // before the reopen is offered — so neither a guard around it nor a handler it moved into passes (#609). A comment that
    // names the function is not a call. It passes the four parts by their own names, in whatever order: a part given in
    // another's place is typed alike and compiles, and would leave the choice's words on screen (#616).
    const call = /^( +)choices\.disabled = true;$[\s\S]*?^\1showRestoreStands\(\{ ([^}\n]+) \}\);$[\s\S]*?^\1actions\.replaceChildren\(reopen\);$/mu.exec(source);
    expect(call?.[2]?.split(', ').sort()).toEqual(['heading', 'lede', 'legend', 'sectionLabel']);
    expect(source.split('showRestoreStands({').length - 1).toBe(1);
  });

  it('says what 交付 records — which version went to whom — and that AI7 sends nothing (DELIV-003, DELIV-004)', () => {
    expect(labels.DOCUMENT_NOT_DELIVERED).toBe('尚未交付');
    expect(labels.DOCUMENT_CHANGED_SINCE_DELIVERY).toBe('交付后有修改');
    expect(labels.DOCUMENT_DELIVERIES_HEADING).toBe('交付记录');
    expect(labels.DELIVERY_FORM_HEADING).toBe('交付');
    expect(labels.DELIVERY_VERSION_LEGEND).toBe('交付哪一版');
    expect(labels.DELIVERY_UNSAVED_NOTE).toBe('有修改尚未保存为版本：交付「现在的文字」会先把它保存为新的版本；也可以交付已保存的版本。');
    expect(labels.documentCurrentTextChoice(3)).toBe('现在的文字（交付时先保存为版本 3）');
    expect(labels.DELIVERY_RECIPIENT_LEGEND).toBe('交给谁');
    expect(labels.DELIVERY_CUSTOM_RECIPIENT).toBe('自行输入');
    expect(labels.DELIVERY_CUSTOM_LABEL).toBe('交给谁（自行输入）');
    expect(labels.DELIVERY_NOTE_LABEL).toBe('备注（可不填）');
    expect(labels.DELIVERY_STATEMENT).toBe('交付只记录这一版交给了谁；AI7 不会发送，文件由你导出到所选位置后自行交出。');
    expect(labels.DELIVERY_BLOCKERS).toEqual({ version: '先选择要交付的版本', recipient: '先选择交给谁', custom: '请写明交给谁' });
    expect(labels.DOCUMENT_STATUS_LINES.delivering).toBe('正在记录交付…');
    expect(labels.DOCUMENT_STATUS_LINES.deliverFailed).toBe('无法记录这次交付。');
    expect(labels.documentDeliveryLine({ ordinal: 2, recipient: { kind: 'custom', label: '出版社发行部' }, versionLabel: '版本 3' }, '9月24日 11:00'))
      .toBe('第 2 次交付 · 出版社发行部 · 版本 3 · 9月24日 11:00');
    expect(labels.documentDeliveredLine(2, '出版社发行部')).toBe('已记录第 2 次交付 · 出版社发行部');
    expect(labels.documentDeliveryExportLine({ export: null })).toBe('暂无导出记录');
    expect(labels.documentDeliveryExportLine({
      export: { preparationId: identity, outcome: 'created', outcomeLabel: '已导出到所选位置', fileName: '新闻稿 · 版本 2.docx' },
    })).toBe('已导出到所选位置 · 新闻稿 · 版本 2.docx');
    expect(labels.documentExportLabel('新闻稿', '版本 2')).toBe('新闻稿 · 版本 2');
  });
});

// Issue #415 (S66c): the Deliverable Workflow Lens's own words; the phases, pills, summary and reasons come from the service.
describe('the words of a document\'s workflow', () => {
  it('names the profile, the lists and a phase\'s four moves, and asks for a reason before 跳过 and 重新打开', () => {
    expect(labels.workflowProfileLine('基础书稿编辑流程', '2.0.0', '2026年9月24日 10:30')).toBe('基础书稿编辑流程 2.0.0 · 启用于 2026年9月24日 10:30');
    expect([labels.DOCUMENT_WORKFLOW_NEXT_HEADING, labels.DOCUMENT_WORKFLOW_NEXT_EMPTY, labels.DOCUMENT_WORKFLOW_PHASES_HEADING])
      .toEqual(['下一项需要处理', '目前没有需要处理的事项', '阶段']);
    expect(labels.DOCUMENT_PHASE_ACTION_LABELS).toEqual({ start: '开始', complete: '完成', skip: '跳过…', reopen: '重新打开…' });
    expect(['start', 'complete', 'skip', 'reopen'].map((action) => labels.phaseActionName(action as 'start', '起草')))
      .toEqual(['开始「起草」', '完成「起草」', '跳过「起草」', '重新打开「起草」']);
    expect([labels.DOCUMENT_PHASE_REASON_LEGENDS, labels.DOCUMENT_PHASE_CONFIRM_LABELS])
      .toEqual([{ skip: '跳过的原因', reopen: '重新打开的原因' }, { skip: '确认跳过', reopen: '确认重新打开' }]);
    expect([labels.DOCUMENT_PHASE_REASON_NEEDED, labels.DOCUMENT_PHASE_CUSTOM_NEEDED, labels.DOCUMENT_PHASE_SHOW_REASON])
      .toEqual(['请先选一个原因。', '选了「自行输入」，请写下原因。', '查看原因']);
  });

  it('says a phase\'s latest move with its reason in the editor\'s words, how often it moved, and each move once made', () => {
    const at = '2026年9月24日 10:30';
    const move = (action: 'start' | 'complete' | 'skip' | 'reopen', reason: { choice: string; label: string; text: string | null } | null) =>
      ({ action, fromState: 'not-started' as const, toState: 'in-progress' as const, reason, recordedAt: '2026-09-24T02:30:00.000Z' });
    expect(labels.phaseLatestLine(move('start', null), at)).toBe(`开始于 ${at}`);
    expect(labels.phaseLatestLine(move('complete', null), at)).toBe(`完成于 ${at}`);
    expect(labels.phaseLatestLine(move('skip', { choice: 'done-elsewhere', label: '这一阶段已在别处完成', text: null }), at))
      .toBe(`跳过于 ${at} · 这一阶段已在别处完成`);
    expect(labels.phaseLatestLine(move('reopen', { choice: 'needs-change', label: '发现需要再改的地方', text: '开头' }), at))
      .toBe(`重新打开于 ${at} · 发现需要再改的地方：开头`);
    expect(labels.phaseLatestLine(move('reopen', { choice: 'custom', label: '自行输入', text: '读者反馈后要改开头' }), at))
      .toBe(`重新打开于 ${at} · 读者反馈后要改开头`);
    expect(labels.phaseMovesLine(3)).toBe('共 3 次变动');
    expect(['start', 'complete', 'skip', 'reopen'].map((action) => labels.phaseMovedLine(action as 'start', '交付')))
      .toEqual(['「交付」已开始', '「交付」已完成', '「交付」已跳过', '「交付」已重新打开']);
    // Completing 交付 never reads as a document 已交付.
    expect(labels.phaseMovedLine('complete', '交付')).not.toContain('已交付');
  });
});

// Issue #543: where a document's text stands, read against the working digest the window holds now.
describe('where a document\'s text stands', () => {
  const delivered = { ...document, deliveries: [{
    deliveryId: identity, ordinal: 1, revisionId: 'r1', versionLabel: '版本 1', recipient: { kind: 'publicity' as const, label: '宣传部' },
    note: null, recordedAt: '2026-09-24T02:30:00.000Z', export: null,
  }] };
  const versions = [
    { revisionId: 'r2', label: '版本 2', ordinal: 2, createdAt: '2026-09-24T03:00:00.000Z', revisionDigest: 'a'.repeat(64) },
    { revisionId: 'r1', label: '版本 1', ordinal: 1, createdAt: '2026-09-24T02:00:00.000Z', revisionDigest: 'b'.repeat(64) },
  ];
  const read = { ...delivered, versions, workingDigest: 'a'.repeat(64), changedSinceVersion: false, changedSinceDelivery: true };

  it('answers as 交付物 read it while the text is what it read', () => {
    expect(documentStanding(read, 'a'.repeat(64))).toEqual({ current: versions[0], changedSinceVersion: false, changedSinceDelivery: true });
  });

  it('moves 当前 off a version as soon as an edit is written, and reads a version only by its own digest', () => {
    // An edit: no version holds the text, which moved past the latest and away from the delivered one.
    expect(documentStanding(read, 'c'.repeat(64))).toEqual({ current: null, changedSinceVersion: true, changedSinceDelivery: true });
    // A working digest is chained, an undo's too, so no edit brings the text back to an earlier version's digest: only a
    // digest a version holds stands on it. Given 版本 1's, the version delivered, it reads that version as the reading
    // would, past the latest and with no edit after the delivery.
    expect(documentStanding(read, 'b'.repeat(64))).toEqual({ current: versions[1], changedSinceVersion: true, changedSinceDelivery: false });
    // With no delivery there is nothing to have moved away from.
    expect(documentStanding({ ...read, deliveries: [] }, 'c'.repeat(64)).changedSinceDelivery).toBe(false);
  });
});
