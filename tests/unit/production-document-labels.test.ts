import { describe, expect, it } from 'vitest';
import { PUBLICATION_FORBIDDEN_WORDS, type ProductionDocumentProjection } from '../../src/shared/protocol.js';
import * as labels from '../../src/renderer/production-document-labels.js';

// The words of 交付 · 生产文档 (Issue #415, plan slices S66a and S66b; V2-UX-DELIV-001 to DELIV-004, WORK-013, MILE-014),
// byte for byte.

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
      labels.documentDeliveredLine(1, '宣传部'),
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

  it('says what 交付 records — which version went to whom — and that AI7 sends nothing (DELIV-003, DELIV-004)', () => {
    expect(labels.DOCUMENT_NOT_DELIVERED).toBe('尚未交付');
    expect(labels.DOCUMENT_CHANGED_SINCE_DELIVERY).toBe('交付后有修改');
    expect(labels.DOCUMENT_DELIVERIES_HEADING).toBe('交付记录');
    expect(labels.DELIVERY_FORM_HEADING).toBe('交付');
    expect(labels.DELIVERY_VERSION_LEGEND).toBe('交付哪一版');
    expect(labels.DELIVERY_UNSAVED_NOTE).toBe('有修改尚未保存为版本：要交付现在的文字，先打开文档「保存为版本」；也可以交付已保存的版本。');
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
