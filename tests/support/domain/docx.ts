import { createBaselineRelations } from '../baseline-relations.js';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { BoundedManuscriptStore } from '../../../src/service/bounded-manuscript.js';
import { compileWordTrackedDocxBytes, DOCX_PARSER_IDENTITY, WORD_DOCX_PARSER_IDENTITY } from '../../../src/service/docx.js';
import { EditorialMarkStore, EDITORIAL_MARK_SCHEMA_SQL } from '../../../src/service/editorial-marks.js';
import { writeImportedManuscriptRows } from '../../../src/service/import-intake-operations.js';
import { bindWordReadingToRevision, IMPORT_RETENTION_SCHEMA_SQL, WORD_IMPORT_RETENTION_SCHEMA_SQL, readWordParentSourcePin, retainWordRevisionSource, WORD_EXTRACTOR_IDENTITY, wordParentSourcePinRecord, type WordImportChoiceRecord } from '../../../src/service/import-retention.js';
import { IMPORTED_MARK_SCHEMA_SQL } from '../../../src/service/imported-marks.js';
import { LOCAL_LEARNING_POLICY_BASIS } from '../../../src/service/learning-eligibility.js';
import { PRODUCTION_DOCUMENT_SCHEMA_SQL } from '../../../src/service/production-document-ledger.js';
import { canonicalJson, sha256 } from '../../../src/service/store-records.js';
import { buildWordProfileRecipe } from '../../fixtures/docx-fidelity/builder.js';
import { DOCX_SOURCE_STUBS } from './docx-stubs.js';

/** Production retention/mark definitions plus labelled external-owner source stubs; no store-schema import. */
export async function docxDatabase(): Promise<DatabaseSync> {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  try {
    for (const sql of Object.values(DOCX_SOURCE_STUBS)) db.exec(sql);
    createBaselineRelations(db, 'manuscripts', PRODUCTION_DOCUMENT_SCHEMA_SQL, 'import_fidelity_categories', EDITORIAL_MARK_SCHEMA_SQL,
      IMPORTED_MARK_SCHEMA_SQL, IMPORT_RETENTION_SCHEMA_SQL, WORD_IMPORT_RETENTION_SCHEMA_SQL, 'manuscript_outline', 'working_offset_nodes',
      'working_block_search');
    return db;
  } catch (error) { db.close(); throw error; }
}

/** Every table this helper creates is either a production definition or a labelled source stub. */
export const docxStubTables = new Set<string>(Object.keys(DOCX_SOURCE_STUBS));

/** Test-owned connection/transaction seam; production operations are never reimplemented here. */
export function docxTestHost(db: DatabaseSync) {
  return {
    get authority() { return db; },
    transaction<T>(connection: DatabaseSync, operation: () => T): T {
      if (connection.isTransaction) return operation();
      connection.exec('BEGIN IMMEDIATE');
      try { const result = operation(); connection.exec('COMMIT'); return result; }
      catch (error) { connection.exec('ROLLBACK'); throw error; }
    },
  };
}

/** Real compiler bytes and the production manuscript-row writer; caller owns the transaction. */
export function wordRetentionFixture(db: DatabaseSync) {
  const originalBytes = buildWordProfileRecipe('replacement');
  const compiled = compileWordTrackedDocxBytes(originalBytes);
  if (compiled.kind !== 'ready') throw new Error('expected actual supported Word compiler output');
  const bookId = randomUUID(), draftId = randomUUID(), sourceVersionId = randomUUID(), manuscriptId = randomUUID();
  const branchId = randomUUID(), revisionId = randomUUID(), commitId = randomUUID(), fidelityReviewId = randomUUID();
  const provenanceId = randomUUID(), recordedAt = '2026-10-25T00:00:00Z', reading = compiled.readings.rejected;
  const reviewDigest = sha256(canonicalJson({ draftId, sourceVersionId }));
  // External-owner stub inserts — not a schema or provenance proof; the selected reading is their only claim.
  db.prepare('INSERT INTO books(book_id, stable_identity, title, created_at) VALUES (?, ?, ?, ?)').run(bookId, randomUUID(), 'Word 对应契约', recordedAt);
  db.prepare('INSERT INTO content_objects(object_digest, relative_key, byte_length, verified_at) VALUES (?, ?, ?, ?)')
    .run(compiled.sourceDigest, compiled.sourceDigest + '.docx', originalBytes.length, recordedAt);
  db.prepare(`INSERT INTO source_versions(source_version_id, book_id, object_digest, source_digest, content_digest, structure_digest,
    parser_identity, format, display_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'DOCX', 'word-parent.docx', ?)`)
    .run(sourceVersionId, bookId, compiled.sourceDigest, compiled.sourceDigest, reading.contentDigest, reading.structureDigest, DOCX_PARSER_IDENTITY, recordedAt);
  db.prepare(`INSERT INTO source_provenance(provenance_id, source_version_id, acquisition_path, locality, sanitized_identity, parser_identity, recorded_at)
    VALUES (?, ?, 'native-file-picker', 'local-provider-free', 'word-parent.docx', ?, ?)`)
    .run(provenanceId, sourceVersionId, WORD_DOCX_PARSER_IDENTITY, recordedAt);
  db.prepare(`INSERT INTO import_drafts(draft_id, selection_token, state, draft_version, display_name, object_digest, selected_path, staged_at)
    VALUES (?, ?, 'staged', 1, 'word-parent.docx', ?, 'word-parent.docx', ?)`).run(draftId, randomUUID(), compiled.sourceDigest, recordedAt);
  db.prepare(`INSERT INTO staged_import_snapshots(draft_id, parser_identity, source_digest, content_digest, structure_digest, block_count,
    fidelity_json, title_suggestion, title_source, snapshot_created_at, character_count) VALUES (?, ?, ?, ?, ?, ?, '[]', 'Word 对应契约', '文件名', ?, ?)`)
    .run(draftId, WORD_DOCX_PARSER_IDENTITY, compiled.sourceDigest, reading.contentDigest, reading.structureDigest, reading.blocks.length, recordedAt, reading.characterCount);
  const insert = db.prepare(`INSERT INTO staged_import_blocks(draft_id, staged_block_id, position, kind, level, text, digest, start_offset, grapheme_length)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  let offset = 0;
  for (const block of reading.blocks) {
    insert.run(draftId, 'blk_' + sha256(draftId + ':' + block.position).slice(0, 24), block.position, block.kind, block.level, block.text, block.digest, offset, block.graphemeLength);
    offset += block.graphemeLength;
  }
  const revisionDigest = sha256(canonicalJson({ manuscriptId, contentDigest: reading.contentDigest }));
  const bounded = new BoundedManuscriptStore(db);
  writeImportedManuscriptRows(db, { input: { draftId }, bookId, manuscriptId, branchId, revisionId, sourceVersionId,
    revisionDigest, workingDigest: revisionDigest, now: recordedAt, shaped: false, word: { compiled },
    snapshot: { blockCount: reading.blocks.length }, blockCount: reading.blocks.length, unmappedBlocks: 0,
    characterCount: reading.characterCount, merged: null, structure: null }, () => {
    db.prepare(`INSERT INTO import_fidelity_reviews(fidelity_review_id, book_id, source_version_id, review_digest, outcome, round_trip_guaranteed, created_at)
      VALUES (?, ?, ?, ?, 'clean-import-no-round-trip', 0, ?)`).run(fidelityReviewId, bookId, sourceVersionId, reviewDigest, recordedAt);
    db.prepare(`INSERT INTO import_fidelity_categories(fidelity_review_id, category_key, display_label, item_count, status, detail, position)
      VALUES (?, 'text-boxes', '文本框', 0, 'preserved', '无文本框', 1)`).run(fidelityReviewId);
    db.prepare(`INSERT INTO import_commits(commit_id, draft_id, request_fingerprint, expected_draft_version, review_digest, operation_kind, result_json, committed_at)
      VALUES (?, ?, ?, 1, ?, 'manuscript-import', '{}', ?)`).run(commitId, draftId, sha256(commitId), reviewDigest, recordedAt);
    db.prepare(`INSERT INTO manuscript_import_records(import_record_id, commit_id, book_id, manuscript_id, source_version_id,
      fidelity_review_id, degradation_decision_id, resulting_revision_id, provenance_id, imported_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`)
      .run(randomUUID(), commitId, bookId, manuscriptId, sourceVersionId, fidelityReviewId, revisionId, provenanceId, recordedAt);
  }, branch => bounded.initializeImportedBranch(branch));
  const pin = readWordParentSourcePin(db, bookId, sourceVersionId);
  retainWordRevisionSource(db, pin, compiled.graph);
  const bound = bindWordReadingToRevision(db, bookId, revisionId, sourceVersionId, reading);
  const choice: WordImportChoiceRecord = { schema: 'ai7.word-import-choice/1', sourceVersionId,
    parentSourcePinDigest: wordParentSourcePinRecord(pin).digest, originalDigest: compiled.sourceDigest, workingObjectDigest: null,
    importReviewId: reviewDigest, fidelityReviewId, commitId, revisionId, extractorIdentity: WORD_EXTRACTOR_IDENTITY,
    graphDigest: compiled.graphDigest, mode: 'suggestions', learnFromEdits: true, acceptedBaselineConfirmed: false,
    readings: { rejected: { digest: reading.readingDigest, blockCount: reading.blocks.length, usable: reading.usable },
      accepted: { digest: compiled.readings.accepted.readingDigest, blockCount: compiled.readings.accepted.blocks.length, usable: compiled.readings.accepted.usable } },
    mappingDigest: bound.mappingDigest, templateManifestDigest: compiled.templateManifestDigest,
    // External-owner stub read: default learning controls; learning-policy proofs remain in service tests.
    effectiveControls: { global: { enabled: true, reference: { kind: 'default', basis: LOCAL_LEARNING_POLICY_BASIS } },
      book: { excluded: false, reference: { kind: 'default', basis: LOCAL_LEARNING_POLICY_BASIS } }, materials: [] } };
  return { bookId, compiled, originalBytes, choice, bound, sourceVersionId, commitId, recordedAt, branchId, markStore: new EditorialMarkStore(db) };
}
