import { describe, expect, it } from 'vitest';
import {
  MAX_DELIVERABLE_MILESTONES,
  MAX_EXPORT_DESTINATION_CODE_UNITS,
  MAX_EXPORT_RECORDS_LISTED,
  MAX_PRODUCTION_DOCUMENT_DELIVERIES_LISTED,
  MAX_PRODUCTION_DOCUMENT_DELIVERY_NOTE_CHARACTERS,
  MAX_PRODUCTION_DOCUMENT_RECIPIENT_CHARACTERS,
  MAX_PRODUCTION_DOCUMENT_PHASE_REASON_CHARACTERS,
  MAX_PRODUCTION_DOCUMENT_SOURCES_LISTED,
  PRODUCTION_DOCUMENT_PHASE_IDS,
  MAX_PRODUCTION_DOCUMENT_VERSIONS_LISTED,
  MAX_FRAME_BYTES,
  MAX_BOOK_DELIVERY_PACKAGE_EXPORTS_LISTED,
  MAX_BOOK_DELIVERY_PACKAGE_PURPOSE_CHARACTERS,
  MAX_BOOK_DELIVERY_PACKAGE_REPORTS_LISTED,
  MAX_BOOK_DELIVERY_PACKAGE_VERSIONS_LISTED,
  MAX_MILESTONE_PURPOSE_CODE_UNITS,
  MAX_PUBLICATION_BASIS_CHARACTERS,
  MAX_PUBLICATION_SCOPE_CHARACTERS,
  MAX_PUBLICATION_VERSIONS_LISTED,
  PUBLICATION_ACTUALS_PROMPT_LABEL,
  PUBLICATION_ACTUALS_PROMPT_STATE,
  PUBLICATION_CHANGE_NOTICE,
  PUBLICATION_EVENT_KINDS,
  PUBLICATION_FORBIDDEN_WORDS,
  PUBLICATION_NEEDS_MANUSCRIPT,
  PUBLICATION_NEEDS_MILESTONE,
  PUBLICATION_VERSION_LABEL,
  PUBLICATION_VERSION_STATEMENT,
  milestoneChangedSinceLabel,
  publicationDesignatedLabel,
  publicationText,
  publicationUnchangedLabel,
  type DeliverablesProjection,
  type MilestoneListItemProjection,
  type PublicationDesignationProjection,
  type ProductionDocumentsProjection,
  type BookDeliveryPackageItemProjection,
  type BookDeliveryPackageProjection,
  type BookDeliveryPackageVersionProjection,
  type PublicationVersionProjection,
} from '../../src/shared/protocol.js';

// The words of ⑥ 发稿 (Issue #414): what the service says a Milestone Version and a Publication Version
// are, so the surface shows exactly what the records mean (V2-UX-MILE-007, PUB-004, PUB-006, PUB-009).

describe('the words of 发稿', () => {
  it('state the fixed sentence, the marks and the notices exactly as the specification words them', () => {
    expect(PUBLICATION_VERSION_STATEMENT).toBe('仅表示此版本可用于上述发稿范围；AI7 不会发布或发送');
    expect(PUBLICATION_VERSION_LABEL).toBe('发稿版本');
    expect(PUBLICATION_CHANGE_NOTICE).toBe('自发稿版本后有修改');
    expect(PUBLICATION_NEEDS_MILESTONE).toBe('先保存里程碑版本');
    expect(PUBLICATION_ACTUALS_PROMPT_LABEL).toBe('录入定价与首印');
    expect(PUBLICATION_ACTUALS_PROMPT_STATE).toBe('随评估功能提供');
    expect(PUBLICATION_EVENT_KINDS).toEqual(['actuals-prompt', 'exemplar-archive']);
  });

  it('name the milestone the manuscript changed after, and the exact version and scope of a designation', () => {
    expect(milestoneChangedSinceLabel('二审稿')).toBe('自「二审稿」后有修改');
    expect(publicationDesignatedLabel('二审稿', 'r3', '纸质版首印')).toBe('已设为发稿版本 · 「二审稿」 · r3 · 纸质版首印');
    expect(publicationUnchangedLabel('二审稿', 'r3', '纸质版首印')).toBe('已是当前发稿版本 · 「二审稿」 · r3 · 纸质版首印');
  });

  it('never word a Publication Version as published, sent, delivered or received', () => {
    expect(PUBLICATION_FORBIDDEN_WORDS).toEqual(['已发布', '已发送', '已交付', '已确认送达']);
    const said = [
      PUBLICATION_VERSION_STATEMENT, PUBLICATION_VERSION_LABEL, PUBLICATION_CHANGE_NOTICE, PUBLICATION_NEEDS_MILESTONE,
      PUBLICATION_NEEDS_MANUSCRIPT, PUBLICATION_ACTUALS_PROMPT_LABEL, PUBLICATION_ACTUALS_PROMPT_STATE,
      milestoneChangedSinceLabel('二审稿'), publicationDesignatedLabel('二审稿', 'r3', '纸质版首印'),
      publicationUnchangedLabel('二审稿', 'r3', '纸质版首印'),
    ].join('\n');
    for (const word of PUBLICATION_FORBIDDEN_WORDS) expect(said.includes(word)).toBe(false);
  });

  it('record 发稿范围 and 依据 normalized and trimmed, counting code points as SQLite counts them', () => {
    expect(publicationText('  纸质版首印\n', MAX_PUBLICATION_SCOPE_CHARACTERS)).toBe('纸质版首印');
    expect(publicationText('Café', MAX_PUBLICATION_SCOPE_CHARACTERS)).toBe('Café');
    expect(publicationText('范'.repeat(MAX_PUBLICATION_SCOPE_CHARACTERS), MAX_PUBLICATION_SCOPE_CHARACTERS)).toBe('范'.repeat(MAX_PUBLICATION_SCOPE_CHARACTERS));
    expect(publicationText('范'.repeat(MAX_PUBLICATION_SCOPE_CHARACTERS + 1), MAX_PUBLICATION_SCOPE_CHARACTERS)).toBeNull();
    // A character outside the Basic Multilingual Plane is one character, though two code units.
    expect(publicationText('𠀀'.repeat(MAX_PUBLICATION_SCOPE_CHARACTERS), MAX_PUBLICATION_SCOPE_CHARACTERS)).toBe('𠀀'.repeat(MAX_PUBLICATION_SCOPE_CHARACTERS));
    expect(publicationText('𠀀'.repeat(MAX_PUBLICATION_SCOPE_CHARACTERS + 1), MAX_PUBLICATION_SCOPE_CHARACTERS)).toBeNull();
    expect(publicationText('据'.repeat(MAX_PUBLICATION_BASIS_CHARACTERS), MAX_PUBLICATION_BASIS_CHARACTERS)).toHaveLength(MAX_PUBLICATION_BASIS_CHARACTERS);
    for (const value of ['', '   ', '\n\t', '\uD800', 42, null, undefined]) {
      expect(publicationText(value, MAX_PUBLICATION_BASIS_CHARACTERS)).toBeNull();
    }
  });

  it('keep the most 交付物 one answer lists within one service frame, every field at its widest', () => {
    const identity = '00000000-0000-4000-8000-000000000000';
    const digest = 'f'.repeat(64);
    const time = '2026-09-22T00:00:00.000Z';
    // A label, purpose and note are bounded in code units, so a BMP character is their widest byte for
    // byte; 发稿范围 and 依据 are bounded in code points, so a supplementary character is theirs.
    const label = '标'.repeat(80);
    const milestone: MilestoneListItemProjection = {
      milestoneId: identity, label, purposeKind: 'custom', purposeLabel: '途'.repeat(MAX_MILESTONE_PURPOSE_CODE_UNITS),
      revisionId: identity, revisionLabel: 'r9999999', actor: '本机编辑', createdAt: time, note: '注'.repeat(500),
      changedSince: true, changedSinceLabel: milestoneChangedSinceLabel(label),
      designation: { publicationVersionId: identity, label: PUBLICATION_VERSION_LABEL }, technical: { signoffRecordId: identity },
    };
    const designation: PublicationVersionProjection = {
      publicationVersionId: identity, ordinal: 9_999_999, current: false, milestoneId: identity, milestoneLabel: label,
      revisionId: identity, revisionLabel: 'r9999999', scope: '𠀀'.repeat(MAX_PUBLICATION_SCOPE_CHARACTERS),
      basis: '𠀀'.repeat(MAX_PUBLICATION_BASIS_CHARACTERS), actor: '本机编辑', createdAt: time,
      technical: {
        revisionDigest: digest, digest, permissionId: identity,
        events: [{ eventId: identity, kind: 'actuals-prompt' }, { eventId: identity, kind: 'exemplar-archive' }],
      },
    };
    const deliverables: DeliverablesProjection = {
      bookId: identity,
      bookTitle: '书'.repeat(180),
      manuscript: { manuscriptId: identity, branchId: identity, revisionId: identity, revisionLabel: 'r9999999', journalSequence: 9_999_999, workingDigest: digest },
      publication: {
        milestones: Array.from({ length: MAX_DELIVERABLE_MILESTONES }, () => milestone),
        milestonesTruncated: true,
        designations: Array.from({ length: MAX_PUBLICATION_VERSIONS_LISTED }, () => designation),
        designationsTruncated: true,
        changeNotice: { label: PUBLICATION_CHANGE_NOTICE, publicationVersionId: identity, revisionLabel: 'r9999999' },
        designate: { available: true, unavailableReason: null },
        statement: PUBLICATION_VERSION_STATEMENT,
        actualsPrompt: { eventId: identity, publicationVersionId: identity, label: PUBLICATION_ACTUALS_PROMPT_LABEL, stateLabel: PUBLICATION_ACTUALS_PROMPT_STATE, recordedAt: time },
      },
      // Issue #413: the listed exports, each at its widest — a destination of a BMP character at its bound
      // in code units, a file name of 255, and a longer outcome detail than the ledger writes.
      exports: Array.from({ length: MAX_EXPORT_RECORDS_LISTED }, () => ({
        bookId: identity,
        preparationId: identity,
        // A milestone's target, with its label at its bound, is wider than a 审阅报告's (Issue #500, S64b part 2).
        target: { kind: 'milestone' as const, milestoneId: identity, milestoneLabel: label, revisionId: identity, revisionLabel: 'r9999999', report: null, document: null, packageVersion: null },
        // Issue #500: the longest format name the receipt binds.
        format: 'markdown' as const,
        outcome: 'ambiguous' as const,
        outcomeLabel: '结果待确认',
        detail: '导'.repeat(120),
        fileName: '文'.repeat(250) + '.docx',
        destination: `C:\\${'径'.repeat(MAX_EXPORT_DESTINATION_CODE_UNITS - 3)}`,
        byteLength: null,
        recordedAt: time,
        revealAvailable: false,
        technical: { approvalId: identity, receiptId: identity, receiptDigest: digest, fileSha256: null, failureCode: 'EXPORT_COMMIT_UNCERTAIN' },
      })),
    };
    const answer: PublicationDesignationProjection = {
      bookId: identity,
      outcome: 'designated',
      completionLabel: publicationDesignatedLabel(label, 'r9999999', designation.scope),
      publicationVersionId: identity,
      deliverables,
    };
    const response = { id: identity, ok: true, op: 'designatePublicationVersion', result: answer };
    expect(Buffer.byteLength(JSON.stringify(response), 'utf8')).toBeLessThan(MAX_FRAME_BYTES);
  });

  it('keep the widest 交付 · 生产文档 answer within one service frame, apart from the 发稿 block (Issue #415)', () => {
    const identity = '00000000-0000-4000-8000-000000000000';
    const digest = 'f'.repeat(64);
    const time = '2026-09-22T00:00:00.000Z';
    // Issue #415: every house type with a document at its widest — its versions listed to their bound and a source
    // name at the length a file name may take — and the materials listed to theirs.
    const documents: ProductionDocumentsProjection = {
      bookId: identity,
        configuration: { schema: 'ai7.production-document-types/1', version: '1', digest },
        unavailableReason: null,
        types: ['news-release', 'promotion-article', 'review-article', 'launch-materials', 'marketing-points'].map((typeId) => ({
          typeId,
          label: '类'.repeat(16),
          notForThisBook: true,
          document: {
            documentId: identity,
            branchId: identity,
            createdAt: time,
            origin: { sourceVersionId: identity, displayName: '文'.repeat(250) + '.docx', marksNotCarried: Number.MAX_SAFE_INTEGER },
            versions: Array.from({ length: MAX_PRODUCTION_DOCUMENT_VERSIONS_LISTED }, (_, index) => ({
              revisionId: identity, label: `版本 ${9_999_999 - index}`, ordinal: 9_999_999 - index, createdAt: time, revisionDigest: digest,
            })),
            versionsTruncated: true,
            changedSinceVersion: true,
            journalSequence: 9_999_999,
            workingDigest: digest,
            // Issue #415 (S66b): its Delivery Records listed to their bound, each at its widest.
            deliveries: Array.from({ length: MAX_PRODUCTION_DOCUMENT_DELIVERIES_LISTED }, (_, index) => ({
              deliveryId: identity, ordinal: 9_999_999 - index, revisionId: identity, versionLabel: '版本 9999999',
              recipient: { kind: 'custom' as const, label: '交'.repeat(MAX_PRODUCTION_DOCUMENT_RECIPIENT_CHARACTERS) },
              note: '𠀀'.repeat(MAX_PRODUCTION_DOCUMENT_DELIVERY_NOTE_CHARACTERS), recordedAt: time,
              export: { preparationId: identity, outcome: 'ambiguous' as const, outcomeLabel: '结果待确认', fileName: '文'.repeat(250) + '.docx' },
            })),
            deliveriesTruncated: true,
            changedSinceDelivery: true,
            // Issue #415 (S66c): seven phases, each with its latest move at its widest reason.
            workflow: {
              profile: { id: 'p'.repeat(128), name: '流'.repeat(64), version: '9'.repeat(32), activatedAt: time },
              summary: '7 个阶段进行中 · 7 项等待处理',
              next: PRODUCTION_DOCUMENT_PHASE_IDS.map((phaseId) => ({ phaseId, text: `${'阶'.repeat(8)} · 9999999 条修改建议待处理` })),
              phases: PRODUCTION_DOCUMENT_PHASE_IDS.map((phaseId) => ({
                phaseId, label: '阶'.repeat(8), state: 'reopened' as const, stateLabel: '等待你处理', waiting: '9999999 条修改建议待处理',
                actions: ['complete', 'skip'] as const,
                latest: {
                  action: 'reopen' as const, fromState: 'skipped' as const, toState: 'reopened' as const,
                  reason: { choice: 'redo-after-delivery', label: '交付后需要重做', text: '𠀀'.repeat(MAX_PRODUCTION_DOCUMENT_PHASE_REASON_CHARACTERS) },
                  recordedAt: time,
                },
                moves: 9_999_999,
              })),
              transitions: 9_999_999,
            },
          },
        })),
        sources: Array.from({ length: MAX_PRODUCTION_DOCUMENT_SOURCES_LISTED }, () => ({
          sourceVersionId: identity, displayName: '文'.repeat(250) + '.docx', format: 'DOCX' as const, createdAt: time,
        })),
        sourcesTruncated: true,
      };
    const response = { id: identity, ok: true, op: 'recordProductionDocumentDelivery', result: { bookId: identity, documents, document: documents.types[0]!.document, typeId: 'news-release' } };
    expect(Buffer.byteLength(JSON.stringify(response), 'utf8')).toBeLessThan(MAX_FRAME_BYTES);
  });

  it('keep the widest 图书交付包 answer within one service frame (Issue #416)', () => {
    const identity = '00000000-0000-4000-8000-000000000000';
    const digest = 'f'.repeat(64);
    const wide = (length: number) => '𠀀'.repeat(length);
    // Every condition at its widest words, every list at its bound, and every version with the widest purpose.
    const conditions = [
      { key: 'publication' as const, typeId: null, label: '发稿版本', met: true, stateLabel: `发稿版本「${wide(80)}」 · r9999`, notice: wide(120), route: 'publication' as const, routeLabel: '设为发稿版本…' },
      ...Array.from({ length: 5 }, (_, index) => ({
        key: 'document' as const, typeId: `type-${index}`, label: wide(40), met: true, stateLabel: '第 9999 次交付 · 版本 9999', notice: wide(120),
        route: 'document' as const, routeLabel: '再交付…',
      })),
      { key: 'work-records' as const, typeId: null, label: '工作记录', met: false, stateLabel: '第 9999 次审阅尚未生成报告', notice: null, route: 'review' as const, routeLabel: '前往审阅' },
    ];
    const item = (kind: BookDeliveryPackageItemProjection['kind']): BookDeliveryPackageItemProjection => ({ kind, label: wide(120), detail: wide(200) });
    const answer: BookDeliveryPackageProjection = {
      bookId: identity,
      statement: wide(80),
      conditions,
      ready: false,
      unmet: conditions.map((condition) => condition.label),
      content: {
        digest,
        included: [item('publication'), ...Array.from({ length: 5 }, () => item('document')), ...Array.from({ length: MAX_BOOK_DELIVERY_PACKAGE_REPORTS_LISTED }, () => item('review-report'))],
        includedTruncated: true,
        excluded: [...Array.from({ length: 5 }, () => item('not-for-this-book')), ...Array.from({ length: 3 }, () => item('exclusion'))],
        limitations: Array.from({ length: 6 + MAX_BOOK_DELIVERY_PACKAGE_REPORTS_LISTED + 1 }, () => wide(160)),
        limitationsTruncated: true,
      },
      versions: Array.from({ length: MAX_BOOK_DELIVERY_PACKAGE_VERSIONS_LISTED }, (_, index): BookDeliveryPackageVersionProjection => ({
        packageVersionId: identity, packageId: identity, version: index + 1, label: `v${index + 1}`, purpose: wide(MAX_BOOK_DELIVERY_PACKAGE_PURPOSE_CHARACTERS),
        preparedAt: '2026-09-24T00:00:00.000Z', current: index === 0, summary: wide(200), exportHistoryLabel: '已导出 9999999 次',
        // Issue #416 (S67b): each version's exports as far as they are listed, each folder at its bound in code units.
        exports: Array.from({ length: MAX_BOOK_DELIVERY_PACKAGE_EXPORTS_LISTED }, () => ({
          exportId: identity, folder: '𠀀'.repeat(MAX_EXPORT_DESTINATION_CODE_UNITS / 2), state: 'incomplete' as const,
          summary: '已导出 9999 个文件，9999 个未能导出，9999 个结果待确认，其余 9999 个没有写入', exportedAt: '2026-09-24T00:00:00.000Z', fileCount: 9999,
          revealPreparationId: identity,
        })),
        exportsTruncated: true,
        technical: { contentDigest: digest, digest, priorVersionId: identity },
      })),
      versionsTruncated: true,
      changedSinceLatest: true,
    };
    const response = { id: identity, ok: true, op: 'prepareBookDeliveryPackage', result: { bookId: identity, outcome: 'prepared', version: 21, package: answer } };
    expect(Buffer.byteLength(JSON.stringify(response), 'utf8')).toBeLessThan(MAX_FRAME_BYTES);
  });
});
