import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { initializeAiEditLockSchema } from '../../../src/service/ai-edit-locks.js';
import { BoundedManuscriptStore, initializeManuscriptEntryPositionSchema } from '../../../src/service/bounded-manuscript.js';
import { initializeDecisionFeedbackSchema } from '../../../src/service/decision-feedback.js';
import { DOCX_PARSER_IDENTITY, parseDocx, type ParsedDocxBlock } from '../../../src/service/docx.js';
import * as editorialMarkOperations from '../../../src/service/editorial-mark-operations.js';
import { EditorialMarkStore, initializeEditorialMarkSchema, initializeProposalReviewSchema } from '../../../src/service/editorial-marks.js';
import { writeImportedManuscriptRows } from '../../../src/service/import-intake-operations.js';
import { IMPORT_FIDELITY_CATEGORIES_SQL, initializeImportRetentionSchema } from '../../../src/service/import-retention.js';
import { initializeInlineEditorRevisionSchema } from '../../../src/service/inline-editor-revisions.js';
import { initializeEditorialLearningSchema } from '../../../src/service/learning/ledger.js';
import { initializeLearningEligibilitySchema } from '../../../src/service/learning-eligibility.js';
import { initializeManuscriptEffectSchema, ManuscriptApplyStore } from '../../../src/service/manuscript-apply.js';
import {
  COMMON_SCHEMA_SQL, FULL_MANUSCRIPT_REIMPORT_TARGET_SCHEMA_SQL, FULL_TARGET_SCHEMA_SQL, MANUSCRIPT_REIMPORT_INDEX_SQL, RECOVERY_SCHEMA_SQL,
  TARGET_INDEX_SQL, TARGET_VIRTUAL_TABLE_SQL, V6_TARGET_SCHEMA_SQL,
} from '../../../src/service/manuscript/bounded-schema-sql.js';
import { NOTE_BLOCK_SCHEMA_SQL, NOTE_BLOCK_TRIGGER_SQL, widenedBlockKindTables } from '../../../src/service/manuscript/note-schema.js';
import * as manuscriptOperations from '../../../src/service/manuscript/operations.js';
import { STRUCTURAL_EDIT_SCHEMA_SQL } from '../../../src/service/manuscript/structural-schema.js';
import { MANUSCRIPTS_REVISION_37_SQL, PRODUCTION_DOCUMENT_INDEX_SQL } from '../../../src/service/production-document-ledger.js';
import { initializeProposalConflictSchema, ProposalConflictStore } from '../../../src/service/proposal-conflicts.js';
import { canonicalJson, sha256 } from '../../../src/service/store-records.js';
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

/** Readers' external-owner stubs (book-people.ts owns this table): the columns the mark card reads, and the keys. */
const READER_STUBS = {
  book_people_versions: `CREATE TABLE "book_people_versions" (
  "version_id" TEXT PRIMARY KEY,
  "book_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "editors_text" TEXT NOT NULL,
  UNIQUE ("book_id", "version")
) STRICT`,
} as const;

const widened = widenedBlockKindTables(FULL_MANUSCRIPT_REIMPORT_TARGET_SCHEMA_SQL);
const one = (sql: string | ReadonlyArray<string>): string => typeof sql === 'string' ? sql : sql[sql.length - 1]!;

/**
 * The manuscript's own relations at their terminal production text (block kinds widened by revision 101, as the store's
 * schema check expects them), in dependency order. Every one is compared whole with an opened store by the parity case.
 */
const MANUSCRIPT_DEFINITIONS: ReadonlyArray<string> = [
  MANUSCRIPTS_REVISION_37_SQL,
  PRODUCTION_DOCUMENT_INDEX_SQL.manuscripts_one_primary_per_book,
  one(COMMON_SCHEMA_SQL.manuscript_branches),
  one(COMMON_SCHEMA_SQL.manuscript_blocks),
  V6_TARGET_SCHEMA_SQL.manuscript_revisions,
  one(widened.manuscript_block_versions!),
  MANUSCRIPT_REIMPORT_INDEX_SQL.revision_reimport_identity,
  one(widened.working_blocks!),
  TARGET_INDEX_SQL.working_blocks_window,
  FULL_TARGET_SCHEMA_SQL.branch_working_state,
  FULL_TARGET_SCHEMA_SQL.edit_journal_entries,
  TARGET_INDEX_SQL.journal_branch_order,
  V6_TARGET_SCHEMA_SQL.manuscript_outline,
  TARGET_INDEX_SQL.manuscript_outline_order,
  V6_TARGET_SCHEMA_SQL.working_offset_nodes,
  TARGET_VIRTUAL_TABLE_SQL,
  V6_TARGET_SCHEMA_SQL.manuscript_search_sessions,
  V6_TARGET_SCHEMA_SQL.manuscript_search_results,
  V6_TARGET_SCHEMA_SQL.manuscript_replacement_previews,
  V6_TARGET_SCHEMA_SQL.manuscript_replacement_matches,
  TARGET_INDEX_SQL.replacement_matches_block,
  V6_TARGET_SCHEMA_SQL.milestone_versions,
  V6_TARGET_SCHEMA_SQL.milestone_signoff_records,
  RECOVERY_SCHEMA_SQL.service_lifetimes,
  RECOVERY_SCHEMA_SQL.service_lifetime_branch_writes,
  TARGET_INDEX_SQL.lifetime_outcome_order,
  RECOVERY_SCHEMA_SQL.recovery_snapshots,
  TARGET_INDEX_SQL.recovery_snapshot_branch,
  RECOVERY_SCHEMA_SQL.recovery_attention,
  TARGET_INDEX_SQL.recovery_attention_startup,
  RECOVERY_SCHEMA_SQL.recovery_restore_stages,
  one(widened.recovery_restore_stage_blocks!),
  RECOVERY_SCHEMA_SQL.recovery_decisions,
  RECOVERY_SCHEMA_SQL.recovery_restorations,
  RECOVERY_SCHEMA_SQL.manuscript_recovery_review_status,
  // Revision 100's command relations (structural-schema.ts) at their terminal text; its initializer rebuilds prior ones.
  STRUCTURAL_EDIT_SCHEMA_SQL.manuscript_command_groups,
  STRUCTURAL_EDIT_SCHEMA_SQL.manuscript_command_edits,
  TARGET_INDEX_SQL.command_history_state,
  STRUCTURAL_EDIT_SCHEMA_SQL.manuscript_block_lineage,
  NOTE_BLOCK_SCHEMA_SQL.manuscript_note_sources,
  ...Object.values(NOTE_BLOCK_TRIGGER_SQL),
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
    for (const sql of MANUSCRIPT_DEFINITIONS) db.exec(sql);
    db.exec(IMPORT_FIDELITY_CATEGORIES_SQL);
    initializeImportRetentionSchema(db);
    initializeManuscriptEntryPositionSchema(db);
    initializeEditorialMarkSchema(db);
    initializeProposalReviewSchema(db);
    initializeManuscriptEffectSchema(db);
    initializeProposalConflictSchema(db);
    initializeDecisionFeedbackSchema(db);
    initializeAiEditLockSchema(db);
    initializeInlineEditorRevisionSchema(db);
    // A Proposal Decision is captured as learning material inside the Apply transaction: the learning ledger's own
    // production initializer (learning/ledger.ts), compared whole with an opened store by the parity case.
    initializeEditorialLearningSchema(db);
    initializeLearningEligibilitySchema(db);
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
 * real owners the store builds over it and the two operation Hosts. The store's error wrappers are pass-through here:
 * an owner's refusal reaches the case as the owner's error, with the same `code` the store's wrapper would carry.
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
  const passThrough = <T>(operation: () => T): T => operation();
  const marksHost: editorialMarkOperations.EditorialMarkOperationsHost = {
    authority: db, boundedAuthority, lifetimeId, editorialMarks, manuscriptApply, proposalConflicts,
    markCall: passThrough, conflictCall: passThrough, boundedCall: passThrough, transaction,
    // Labelled stub read: no factual-verification ledger here, so no mark has a Correction Proposal lineage.
    factualLineageOfMark: () => null,
  };
  const manuscriptHost: manuscriptOperations.ManuscriptOperationsHost = {
    authority: db, bounded, boundedAuthority, lifetimeId,
    // Labelled stub: recovery objects live on disk; the milestone and recovery cases stay in tests/service.
    get recoveryObjects(): never { throw new Error('recovery objects are files; this case belongs in tests/service'); },
    assertAvailable: () => undefined, boundedCall: passThrough, withRecoveryObjectLifecycle: (operation) => operation(),
    // Labelled stubs: learning capture and the baseline analysis belong to other owners.
    captureManual: () => undefined, analysisResultSetRevision: () => null,
    cancelReplacement: (previewId) => manuscriptOperations.cancelReplacement(manuscriptHost, previewId),
    admitJournalWrite: () => undefined, journalWritten: () => undefined,
  };
  return { db, bookId, manuscriptId, branchId, lifetimeId, bounded, boundedAuthority, editorialMarks, manuscriptApply, proposalConflicts, marksHost, manuscriptHost };
}
