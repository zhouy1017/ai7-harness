import { execPre74Fixture } from '../support/pre74-schema.js';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { ANALYSIS_LEDGER_REVISION_23_SQL, EDITORIAL_MARK_SCHEMA_VERSION, CLARIFICATION_SCHEMA_VERSION, LATEST_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import type { ManuscriptWindowProjection } from '../../src/shared/protocol.js';
import {
  ADMITTED_BASELINE_DOCX,
  composeManuscriptDocx,
  type ComposedManuscriptRequest,
} from '../support/composed-fixture.js';
import { downgradeKindCoupledRelations } from '../support/analysis-ledger-revisions.js';
import { REVIEW_RUN_RELATIONS_DROP_ORDER } from '../support/review-categories.js';
import { PUBLICATION_VERSION_RELATIONS_DROP_ORDER } from '../support/publication-versions.js';
import { PROPOSAL_CONFLICT_RELATIONS_DROP_ORDER } from '../support/proposal-conflicts.js';
import { IMPORT_RETENTION_RELATIONS_DROP_ORDER } from '../support/import-retention.js';
import { IMPORTED_MARK_RELATIONS_DROP_ORDER } from '../support/imported-marks.js';
import { EXPORT_LEDGER_RELATIONS_DROP_ORDER } from '../support/manuscript-export.js';
import { DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER } from '../support/default-execution-rules.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { downgradeEditorialMarksToRevision22 } from '../support/editorial-mark-revisions.js';
import { EDITORIAL_MARK_REVISION_22_SQL, EDITORIAL_MARK_SCHEMA_SQL } from '../../src/service/editorial-marks.js';
import { CLARIFICATION_RELATIONS_DROP_ORDER } from '../support/clarifications.js';
import { REIMPORT_GROUP_RELATIONS_DROP_ORDER } from '../support/reimport-groups.js';
import { PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER } from '../support/production-documents.js';
import { RUN_CHECKPOINT_RELATIONS_DROP_ORDER } from '../support/run-continuation.js';

// Service-integration suite (L2) for AI7 Apply on Change Suggestions (Issue #408). The manuscript is
// composed from the one admitted SampleBook; every string written into it is authored here, and
// manuscript text is compared by boolean, length and offset only.

const EXCERPT: ComposedManuscriptRequest = { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 40, title: '应用组稿' };
const PROPOSED = '〔建议〕';
const EDITED = '〔编辑改定〕';
const EFFECT_RELATIONS = ['manuscript_effect_receipts', 'manuscript_effect_dispatches', 'manuscript_effect_approvals', 'manuscript_effect_targets', 'manuscript_effect_intents'];

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots();
});

afterEach(async () => {
  await roots.dispose();
});

interface Imported { manuscriptId: string; branchId: string }

async function importBook(store: EditorialStore): Promise<Imported> {
  const selectedPath = join(roots.inputRoot, 'apply.docx');
  await composeManuscriptDocx(selectedPath, EXCERPT);
  const staged = await store.stageSelectedManuscript(randomUUID(), selectedPath);
  const review = store.prepareNewBookReview(
    staged.draftId,
    staged.draftVersion,
    { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value },
    false,
  );
  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({
    draftId: staged.draftId,
    expectedDraftVersion: review.draftVersion,
    reviewDigest: review.reviewDigest!,
    commitId,
  });
  await store.acknowledgeImportCompletion(commitId);
  return { manuscriptId: commit.manuscriptId, branchId: commit.branchId };
}

function paragraphs(window: ManuscriptWindowProjection): ManuscriptWindowProjection['blocks'] {
  const found = window.blocks.filter((block) => block.kind === 'paragraph' && graphemesOf(block.text).length >= 40);
  if (found.length < 2) throw new Error('the composed window holds fewer than two paragraphs of 40 graphemes');
  return found;
}

function blockText(store: EditorialStore, book: Imported, blockId: string): string {
  return store.getManuscriptWindow(book.manuscriptId, book.branchId, null).blocks.find((block) => block.blockId === blockId)!.text;
}

function suggest(store: EditorialStore, book: Imported, blockId: string, from: number, to: number, proposedText = PROPOSED): { markId: string; pinned: string } {
  const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  const block = window.blocks.find((candidate) => candidate.blockId === blockId)!;
  const made = store.createEditorialMark({
    ...book,
    windowStartBlockId: window.blocks[0]!.blockId,
    clientMarkId: randomUUID(),
    baseRevisionId: window.revisionId,
    expectedJournalSequence: window.journalSequence,
    blockId,
    baseBlockDigest: block.digest,
    fromGrapheme: from,
    toGrapheme: to,
    selectedText: graphemesOf(block.text).slice(from, to).join(''),
    kind: 'change-suggestion',
    highlightColor: null,
    body: '',
    proposedText,
    rationale: null,
  });
  return { markId: made.markId, pinned: made.card!.pinnedText };
}

function binding(store: EditorialStore, book: Imported): Imported & { windowStartBlockId: string } {
  return { ...book, windowStartBlockId: store.getManuscriptWindow(book.manuscriptId, book.branchId, null).blocks[0]!.blockId };
}

function storeError(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    if (error instanceof StoreError) return error.code;
    throw error;
  }
  return 'no-error';
}

/** The editor's own typing: one journal edit of one block, against the window as it stands now. */
function typeInto(store: EditorialStore, book: Imported, blockId: string, from: number, to: number, insertText: string): ManuscriptWindowProjection {
  const now = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  return store.flushJournalEdit({
    clientEditId: randomUUID(), ...book, baseRevisionId: now.revisionId, blockId, windowStartBlockId: now.blocks[0]!.blockId,
    baseBlockDigest: now.blocks.find((candidate) => candidate.blockId === blockId)!.digest, expectedJournalSequence: now.journalSequence,
    fromGrapheme: from, toGrapheme: to, insertText,
  }).window;
}

describe('Proposal decision workspace', () => {
  it('offers the workspace only above 20, keeps drafts reversible, records and supersedes pinned partial decisions', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const block = paragraphs(window)[0]!;
      const marks = Array.from({ length: 20 }, () => suggest(store, book, block.blockId, 0, 2).markId);
      const input = { ...book, resultId: null };
      expect(store.inspectProposalWorkspace(input).offerWorkspace).toBe(false);
      marks.push(suggest(store, book, block.blockId, 3, 5).markId);
      let work = store.inspectProposalWorkspace(input);
      expect(work.offerWorkspace).toBe(true);
      const sequence = work.journalSequence;
      work = store.saveProposalDecisionDraft({ ...input, markIds: [marks[0]!], atomicGroupId: null, disposition: 'accepted', expectedScopeDigest: work.scopeDigest });
      expect(work.items.find((item) => item.markId === marks[0])?.draft).toBe('accepted');
      work = store.saveProposalDecisionDraft({ ...input, markIds: [marks[0]!], atomicGroupId: null, disposition: null, expectedScopeDigest: work.scopeDigest });
      expect(work.items.find((item) => item.markId === marks[0])?.draft).toBeNull();
      work = store.saveProposalDecisionDraft({ ...input, markIds: [marks[0]!], atomicGroupId: null, disposition: 'deferred', expectedScopeDigest: work.scopeDigest });
      work = store.recordProposalDecision({ ...input, expectedScopeDigest: work.scopeDigest, clientDecisionId: randomUUID() });
      expect(work.decision?.items[0]?.disposition).toBe('deferred');
      expect(work.decision?.unresolved).toHaveLength(21);
      const old = work.decision!.decisionId;
      work = store.saveProposalDecisionDraft({ ...input, markIds: [marks[0]!], atomicGroupId: null, disposition: 'rejected', expectedScopeDigest: work.scopeDigest });
      work = store.recordProposalDecision({ ...input, expectedScopeDigest: work.scopeDigest, clientDecisionId: randomUUID() });
      expect(work.decision?.supersedes).toBe(old);
      expect(work.journalSequence).toBe(sequence);
      const position = { blockId: block.blockId, activeMarkId: marks[0]!, comparison: 'side-by-side' as const, review: 'reviewed' as const, chapterBlockId: null, changeType: null, expanded: true };
      expect(store.inspectProposalWorkspace({ ...input, returnPosition: position }).returnPosition).toEqual(position);
    } finally { store.close(); }
  });
});
