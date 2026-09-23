import { describe, expect, it } from 'vitest';
import {
  MAX_DELIVERABLE_MILESTONES,
  MAX_EXPORT_DESTINATION_CODE_UNITS,
  MAX_EXPORT_RECORDS_LISTED,
  MAX_FRAME_BYTES,
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
        target: { kind: 'milestone' as const, milestoneId: identity, milestoneLabel: label, revisionId: identity, revisionLabel: 'r9999999' },
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
});
