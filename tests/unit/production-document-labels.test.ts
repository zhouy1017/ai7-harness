import { describe, expect, it } from 'vitest';
import { PUBLICATION_FORBIDDEN_WORDS, type ProductionDocumentProjection } from '../../src/shared/protocol.js';
import * as labels from '../../src/renderer/production-document-labels.js';

// The words of 交付 · 生产文档 (Issue #415, plan slice S66a; V2-UX-DELIV-001, DELIV-002, WORK-013, MILE-014), byte for byte.

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
      ...Object.values(labels.DOCUMENT_STATUS_LINES),
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
});
