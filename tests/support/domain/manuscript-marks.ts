import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { AI_EDIT_LOCK_SCHEMA_SQL } from '../../../src/service/ai-edit-locks.js';
import { AnalysisError } from '../../../src/service/analysis/canonical.js';
import { BoundedManuscriptStore, BoundedStoreError, BoundedStoreFatalError } from '../../../src/service/bounded-manuscript.js';
import { DECISION_FEEDBACK_SCHEMA_SQL, DecisionFeedbackError } from '../../../src/service/decision-feedback.js';
import { DOCX_PARSER_IDENTITY, parseDocx, type ParsedDocxBlock } from '../../../src/service/docx.js';
import * as editorialMarkOperations from '../../../src/service/editorial-mark-operations.js';
import { EDITORIAL_MARK_SCHEMA_SQL, EditorialMarkError, EditorialMarkStore, PROPOSAL_REVIEW_SCHEMA_SQL } from '../../../src/service/editorial-marks.js';
import { writeImportedManuscriptRows } from '../../../src/service/import-intake-operations.js';
import { IMPORT_RETENTION_SCHEMA_SQL } from '../../../src/service/import-retention.js';
import { INLINE_EDITOR_REVISION_SCHEMA_SQL } from '../../../src/service/inline-editor-revisions.js';
import { EDITORIAL_LEARNING_SCHEMA_SQL } from '../../../src/service/learning/ledger.js';
import { LEARNING_ELIGIBILITY_SCHEMA_SQL } from '../../../src/service/learning-eligibility.js';
import { MANUSCRIPT_EFFECT_SCHEMA_SQL, ManuscriptApplyStore } from '../../../src/service/manuscript-apply.js';
import * as manuscriptOperations from '../../../src/service/manuscript/operations.js';
import { REIMPORT_GROUP_SCHEMA_SQL } from '../../../src/service/reimport-group-ledger.js';
import { IMPORT_STRUCTURE_SCHEMA_SQL } from '../../../src/service/manuscript/structure-schema.js';
import { PROPOSAL_CONFLICT_SCHEMA_SQL, ProposalConflictError, ProposalConflictStore } from '../../../src/service/proposal-conflicts.js';
import { createBaselineRelations } from '../baseline-relations.js';
import { canonicalJson, sha256, StoreError, StoreFatalError } from '../../../src/service/store-records.js';
import { admittedSourcePath, ADMITTED_BASELINE_DOCX } from '../composed-fixture.js';
import { DOCX_SOURCE_STUBS } from './docx-stubs.js';
import { transaction } from './transaction.js';

/**
 * External-owner source stubs (Issue #1536), the import side of a committed Book — not a schema or provenance proof.
 * They are #1535's labelled stubs, taken by name; only the columns the import row writer and the manuscript readers
 * rely on stand in for their owners, and the service parity case checks each column against an opened store.
 */
const SOURCE_STUB_TABLES = [
  'books', 'content_objects', 'source_versions', 'source_provenance', 'import_drafts', 'staged_import_snapshots',
  'staged_import_blocks', 'staged_import_note_sources', 'import_commits', 'manuscript_import_records', 'import_fidelity_reviews',
] as const;

/** Readers' external-owner stubs: only the columns the mark and workspace readers read, with their keys. */
const READER_STUBS = {
  // book-people.ts owns it: the mark card names the Book's registered editors.
  book_people_versions: `CREATE TABLE "book_people_versions" (
  "version_id" TEXT PRIMARY KEY,
  "book_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "editors_text" TEXT NOT NULL,
  UNIQUE ("book_id", "version")
) STRICT`,
  // review/review-runs.ts owns it: the workspace's Review Run filter reads which finding a mark answers.
  review_findings: `CREATE TABLE "review_findings" (
  "review_run_id" TEXT NOT NULL,
  "finding_id" TEXT NOT NULL,
  "mark_id" TEXT,
  PRIMARY KEY ("review_run_id", "finding_id")
) STRICT`,
} as const;

/**
 * The manuscript's own relations at their baseline text, with their indexes and triggers. Every one is compared whole with an
 * opened store by the parity case.
 */
const MANUSCRIPT_RELATIONS: ReadonlyArray<string> = [
  'manuscripts', 'manuscript_branches', 'manuscript_blocks', 'manuscript_revisions', 'manuscript_block_versions', 'working_blocks',
  'branch_working_state', 'edit_journal_entries', 'manuscript_outline', 'working_offset_nodes', 'working_block_search',
  'manuscript_search_sessions', 'manuscript_search_results', 'manuscript_replacement_previews', 'manuscript_replacement_matches',
  'milestone_versions', 'milestone_signoff_records', 'service_lifetimes', 'service_lifetime_branch_writes', 'recovery_snapshots',
  'recovery_attention', 'recovery_restore_stages', 'recovery_restore_stage_blocks', 'recovery_decisions', 'recovery_restorations',
  'manuscript_recovery_review_status', 'manuscript_command_groups', 'manuscript_command_edits', 'manuscript_block_lineage',
  'manuscript_note_sources',
];

/** The tables of the helper that are labelled stubs; every other table is a production definition. */
export const manuscriptMarksStubTables = new Set<string>([...SOURCE_STUB_TABLES, ...Object.keys(READER_STUBS)]);

/** Production manuscript, mark, Apply, conflict, lock and revision definitions plus labelled source stubs on `:memory:`. */
export function manuscriptMarksDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  try {
    // The behaviour-bearing pragmas of the store's configureDatabase (the file-only ones have no meaning here).
    db.exec('PRAGMA foreign_keys = ON; PRAGMA recursive_triggers = ON; PRAGMA trusted_schema = OFF; PRAGMA temp_store = MEMORY;');
    for (const table of SOURCE_STUB_TABLES) db.exec(DOCX_SOURCE_STUBS[table]);
    for (const sql of Object.values(READER_STUBS)) db.exec(sql);
    createBaselineRelations(db, ...MANUSCRIPT_RELATIONS, 'import_fidelity_categories', IMPORT_RETENTION_SCHEMA_SQL,
      'manuscript_entry_positions', EDITORIAL_MARK_SCHEMA_SQL, PROPOSAL_REVIEW_SCHEMA_SQL, MANUSCRIPT_EFFECT_SCHEMA_SQL,
      PROPOSAL_CONFLICT_SCHEMA_SQL, DECISION_FEEDBACK_SCHEMA_SQL, AI_EDIT_LOCK_SCHEMA_SQL, INLINE_EDITOR_REVISION_SCHEMA_SQL,
      // A Proposal Decision is captured as learning material inside the Apply transaction.
      EDITORIAL_LEARNING_SCHEMA_SQL, LEARNING_ELIGIBILITY_SCHEMA_SQL,
      // The relations whose presence the readers test (a mark set aside by a reimport, a comparison's group sets, the imported
      // structure's lineage), so every reader takes the branch an opened store takes, on a Book that was never reimported.
      REIMPORT_GROUP_SCHEMA_SQL, IMPORT_STRUCTURE_SCHEMA_SQL);
    return db;
  } catch (error) { db.close(); throw error; }
}

let sampleBlocks: Promise<ReadonlyArray<ParsedDocxBlock>> | undefined;

/** The admitted SampleBook's body blocks, read once by the production DOCX parser. */
function sample1Blocks(): Promise<ReadonlyArray<ParsedDocxBlock>> {
  sampleBlocks ??= (async () => {
    const blocks: ParsedDocxBlock[] = [];
    await parseDocx(admittedSourcePath(ADMITTED_BASELINE_DOCX), ADMITTED_BASELINE_DOCX, (block) => { if (block.kind !== 'note') blocks.push(block); });
    return blocks;
  })();
  return sampleBlocks;
}

export interface ManuscriptMarksBook {
  readonly db: DatabaseSync;
  readonly bookId: string;
  readonly manuscriptId: string;
  readonly branchId: string;
  readonly lifetimeId: string;
  /** The editor's reads and edits (the store's journal connection is this same `:memory:` connection). */
  readonly bounded: BoundedManuscriptStore;
  readonly boundedAuthority: BoundedManuscriptStore;
  readonly editorialMarks: EditorialMarkStore;
  readonly manuscriptApply: ManuscriptApplyStore;
  readonly proposalConflicts: ProposalConflictStore;
  readonly marksHost: editorialMarkOperations.EditorialMarkOperationsHost;
  readonly manuscriptHost: manuscriptOperations.ManuscriptOperationsHost;
}

/**
 * One Book committed from the first `blocks` body blocks of sample1 through the production import row writer, with the
 * real owners the store builds over it and the two operation Hosts, whose wrappers map an owner's refusal to a StoreError
 * exactly as the store's do.
 */
export async function manuscriptMarksBook(blocks = 40, startBlock = 1): Promise<ManuscriptMarksBook> {
  const available = await sample1Blocks();
  const excerpt = available.slice(startBlock - 1, startBlock - 1 + blocks);
  if (excerpt.length !== blocks) throw new Error(`sample1 holds ${available.length} body blocks`);
  const db = manuscriptMarksDatabase();
  const bookId = randomUUID(), draftId = randomUUID(), sourceVersionId = randomUUID(), manuscriptId = randomUUID();
  const branchId = randomUUID(), revisionId = randomUUID(), lifetimeId = randomUUID(), now = '2026-11-18T00:00:00.000Z';
  const objectDigest = sha256(`sample1:${startBlock}:${blocks}`);
  const contentDigest = sha256(canonicalJson(excerpt.map((block) => block.digest)));
  const characterCount = excerpt.reduce((total, block) => total + block.graphemeLength, 0);
  // External-owner stub inserts — not a schema or provenance proof; they only stand the Book and its draft up.
  db.prepare('INSERT INTO books(book_id, stable_identity, title, created_at) VALUES (?, ?, ?, ?)').run(bookId, randomUUID(), '标记组稿', now);
  db.prepare('INSERT INTO content_objects(object_digest, relative_key, byte_length, verified_at) VALUES (?, ?, ?, ?)').run(objectDigest, `${objectDigest}.docx`, 1, now);
  db.prepare(`INSERT INTO source_versions(source_version_id, book_id, object_digest, source_digest, content_digest, structure_digest,
    parser_identity, format, display_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'DOCX', ?, ?)`)
    .run(sourceVersionId, bookId, objectDigest, objectDigest, contentDigest, contentDigest, DOCX_PARSER_IDENTITY, ADMITTED_BASELINE_DOCX, now);
  db.prepare(`INSERT INTO import_drafts(draft_id, selection_token, state, draft_version, display_name, object_digest, selected_path, staged_at)
    VALUES (?, ?, 'staged', 1, ?, ?, ?, ?)`).run(draftId, randomUUID(), ADMITTED_BASELINE_DOCX, objectDigest, ADMITTED_BASELINE_DOCX, now);
  db.prepare(`INSERT INTO staged_import_snapshots(draft_id, parser_identity, source_digest, content_digest, structure_digest, block_count,
    fidelity_json, title_suggestion, title_source, snapshot_created_at, character_count) VALUES (?, ?, ?, ?, ?, ?, '[]', '标记组稿', '文件名', ?, ?)`)
    .run(draftId, DOCX_PARSER_IDENTITY, objectDigest, contentDigest, contentDigest, excerpt.length, now, characterCount);
  const staged = db.prepare(`INSERT INTO staged_import_blocks(draft_id, staged_block_id, position, kind, level, text, digest, start_offset, grapheme_length)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const source = db.prepare('INSERT INTO staged_import_block_sources(draft_id, position, source_paragraph_index) VALUES (?, ?, ?)');
  let offset = 0;
  excerpt.forEach((block, index) => {
    staged.run(draftId, block.blockId, index + 1, block.kind, block.level, block.text, block.digest, offset, block.graphemeLength);
    source.run(draftId, index + 1, block.sourceParagraphIndex);
    offset += block.graphemeLength;
  });
  const boundedAuthority = new BoundedManuscriptStore(db);
  const bounded = new BoundedManuscriptStore(db);
  const revisionDigest = sha256(canonicalJson({ schema: 'ai7.manuscript-revision/2', manuscriptId, parserIdentity: DOCX_PARSER_IDENTITY,
    contentDigest, structureDigest: contentDigest, blockCount: excerpt.length, characterCount }));
  transaction(db, () => writeImportedManuscriptRows(db, { input: { draftId }, bookId, manuscriptId, branchId, revisionId, sourceVersionId,
    revisionDigest, workingDigest: revisionDigest, now, shaped: false, word: undefined, snapshot: { blockCount: excerpt.length },
    blockCount: excerpt.length, unmappedBlocks: 0, characterCount, merged: null, structure: null },
  () => undefined, (branch) => boundedAuthority.initializeImportedBranch(branch)));
  boundedAuthority.startServiceLifetime(lifetimeId, now);
  const editorialMarks = new EditorialMarkStore(db);
  const manuscriptApply = new ManuscriptApplyStore(db, boundedAuthority, editorialMarks, lifetimeId);
  const proposalConflicts = new ProposalConflictStore(db, editorialMarks);
  // The store's #markCall, #conflictCall and #boundedCall class mappings, so a refusal reaches the case as the StoreError
  // the store would throw. Poisoning the store on a fatal error is store state and stays in the service suite.
  const mapped = (refusals: ReadonlyArray<new (...args: never[]) => Error & { code: string }>, fatal: (error: unknown) => boolean) =>
    <T>(operation: () => T): T => {
      try {
        return operation();
      } catch (error) {
        if (refusals.some((type) => error instanceof type)) throw new StoreError((error as { code: string }).code, (error as Error).message);
        if (fatal(error)) throw new StoreFatalError(error as Error);
        throw error;
      }
    };
  const markCall = mapped([EditorialMarkError, ProposalConflictError, DecisionFeedbackError], () => false);
  const conflictCall = mapped([ProposalConflictError, EditorialMarkError, AnalysisError], (error) => error instanceof AggregateError);
  const boundedCall = mapped([BoundedStoreError], (error) => error instanceof BoundedStoreFatalError);
  const marksHost: editorialMarkOperations.EditorialMarkOperationsHost = {
    authority: db, boundedAuthority, lifetimeId, editorialMarks, manuscriptApply, proposalConflicts,
    markCall, conflictCall, boundedCall, transaction,
    // Labelled stub read: no factual-verification ledger here, so no mark has a Correction Proposal lineage.
    factualLineageOfMark: () => null,
  };
  const manuscriptHost: manuscriptOperations.ManuscriptOperationsHost = {
    authority: db, bounded, boundedAuthority, lifetimeId,
    // Labelled stub: recovery objects live on disk; the milestone and recovery cases stay in tests/service.
    get recoveryObjects(): never { throw new Error('recovery objects are files; this case belongs in tests/service'); },
    assertAvailable: () => undefined, boundedCall, withRecoveryObjectLifecycle: (operation) => operation(),
    // Labelled stubs: learning capture and the baseline analysis belong to other owners.
    captureManual: () => undefined, analysisResultSetRevision: () => null,
    cancelReplacement: (previewId) => manuscriptOperations.cancelReplacement(manuscriptHost, previewId),
    admitJournalWrite: () => undefined, journalWritten: () => undefined,
  };
  return { db, bookId, manuscriptId, branchId, lifetimeId, bounded, boundedAuthority, editorialMarks, manuscriptApply, proposalConflicts, marksHost, manuscriptHost };
}
