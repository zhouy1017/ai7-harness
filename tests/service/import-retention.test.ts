import { execPre74Fixture } from '../support/pre74-schema.js';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { unzipSync, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseDocx, parseNativeDocxIntake, compileWordTrackedDocx, compileWordTrackedDocxBytes, WORD_DOCX_PARSER_IDENTITY,
  type ParsedDocx, type ParsedDocxBlock, type NativeDocxIntakeParse } from '../../src/service/docx.js';
import { fixedArchiveTime } from '../../src/shared/archive-time.js';
import {
  IMPORT_FIDELITY_CATEGORIES_REVISION_26_SQL,
  IMPORT_RETENTION_TRIGGER_SQL,
  importFidelityCategoriesShape,
  initializeWordImportRetentionSchema,
  validateWordImportRetentionSchema,
  WORD_IMPORT_RETENTION_SCHEMA_SQL,
  readWordParentSourcePin,
  wordParentSourcePinRecord,
  requireWordParentSourcePin,
  requireWordRevisionSource,
  retainWordRevisionSource,
  wordTrackedSamples,
  wordTrackedSampleRecord,
  WORD_EXTRACTOR_IDENTITY,
  stageWordRevisionIntake,
  requireWordStagedIntake,
  createWordSampleDetailContext,
  wordSampleDetailContextCurrent,
  resolveWordSampleDetailSource,
  wordSampleDetailStream,
  pageWordSampleDetail,
  bindWordReadingToRevision,
  retainWordManuscriptSourceSegments,
  requireWordManuscriptSourceSegments,
  retainWordRevisionImport,
  type WordImportChoiceRecord,
} from '../../src/service/import-retention.js';
import { canonicalRecord, isRecord } from '../../src/service/analysis/canonical.js';
import { DATA_VERSION_TRIGGER_SQL, DataVersionLedger, dataVersionMarkerPath, readDataVersionMarkerText,
  refuseNewerDataVersion } from '../../src/service/data-version.js';
import { EditorialLearningLedger } from '../../src/service/learning/ledger.js';
import { wordTrackedEditCandidate, learningMaterialDigest, wordLocalImportAdmissions } from '../../src/service/learning-eligibility.js';
import { readWordManuscriptExportSource, planWordManuscriptExport } from '../../src/service/manuscript-export.js';
import { renderDocxExport } from '../../src/service/docx-export.js';
import { createWordImportedMarks, validateWordImportedMarkSources } from '../../src/service/imported-marks.js';
import { EditorialMarkStore } from '../../src/service/editorial-marks.js';
import { DEFAULT_MANUSCRIPT_EXPORT_OPTIONS } from '../../src/shared/protocol.js';
import { EditorialStore, SOURCE_VERSION_PARSER_CHANGED_MESSAGE, StoreError } from '../../src/service/store.js';
import { CLARIFICATION_SCHEMA_VERSION, LATEST_SCHEMA_VERSION, MODEL_REQUEST_ADMISSION_SCHEMA_VERSION,
  PROPOSAL_CONFLICT_SCHEMA_VERSION, ANALYSIS_LEDGER_REVISION_58_SQL } from '../../src/service/task-authorization.js';
import type { ManuscriptBlockProjection, TextBoxDisposition } from '../../src/shared/protocol.js';
import {
  ADMITTED_BASELINE_DOCX,
  composeManuscriptDocx,
  composeRevisedDocx,
  type ComposedManuscriptRequest,
} from '../support/composed-fixture.js';
import { IMPORT_RETENTION_RELATIONS_DROP_ORDER, WORD_IMPORT_RETENTION_RELATIONS_DROP_ORDER, SAMPLE1_V1_REPORT, stageHistoricalTrackedDocxFixture } from '../support/import-retention.js';
import { IMPORTED_MARK_RELATIONS_DROP_ORDER } from '../support/imported-marks.js';
import { EXPORT_LEDGER_RELATIONS_DROP_ORDER } from '../support/manuscript-export.js';
import { DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER } from '../support/default-execution-rules.js';
import { SAMPLE1_BLOCKS, importSample1Book, requireExactSample1, sample1Path } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { CLARIFICATION_RELATIONS_DROP_ORDER } from '../support/clarifications.js';
import { REIMPORT_GROUP_RELATIONS_DROP_ORDER } from '../support/reimport-groups.js';
import { MIGRATION_EMPTY_RELATIONS, PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER } from '../support/production-documents.js';
import { RUN_CHECKPOINT_RELATIONS_DROP_ORDER } from '../support/run-continuation.js';
import { downgradeKindCoupledRelations } from '../support/analysis-ledger-revisions.js';

// Service-integration suite (L2) for import retention (Issue #410, plan slice S61; ADR 0086) over the real
// `EditorialStore` on a temporary Agent Data Root. Every manuscript is exact `sample1` or composed from it —
// its text boxes, fields and notes included — and no assertion reads manuscript text back: blocks are
// compared by digest, position and count.

type Row = Record<string, SQLOutputValue>;

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots();
});

afterEach(async () => {
  await roots.dispose();
});

/** Six blocks with a two-paragraph text box anchored at the second; the box's words are sample1's own. */
const TEXT_BOX_EXCERPT: ComposedManuscriptRequest = {
  source: ADMITTED_BASELINE_DOCX,
  startBlock: 1,
  blocks: 6,
  title: '文本框组稿',
  retention: { textBox: { anchorBlock: 2, sourceStartBlock: 7, blocks: 2 } },
};

function databasePath(): string {
  return join(roots.dataRoot, 'store', 'ai7.sqlite');
}

function dropEmptyWordRetentionLayer(db: DatabaseSync): void {
  for (const table of WORD_IMPORT_RETENTION_RELATIONS_DROP_ORDER) {
    expect(db.prepare(`SELECT count(*) total FROM ${table}`).get()?.total).toBe(0);
    db.exec(`DROP TABLE ${table}`);
  }
}

/** Reader 92 differs here only in the absent Word layer and the exact version metadata, never in source/retention bytes. */
function constructReader92Predecessor(db: DatabaseSync): void {
  dropEmptyWordRetentionLayer(db);
  const versions = db.prepare('SELECT * FROM store_versions ORDER BY ordinal').all();
  expect(versions).toHaveLength(1);
  const row = versions[0]!;
  const value: unknown = JSON.parse(String(row.canonical_json));
  if (!isRecord(value) || value.schema !== 'ai7.store-version/1' || value.schemaRevision !== LATEST_SCHEMA_VERSION || value.upgrade !== undefined) {
    throw new Error('expected one unupgraded current version record');
  }
  const old = canonicalRecord({ ...value, schemaRevision: MODEL_REQUEST_ADMISSION_SCHEMA_VERSION });
  db.exec('DROP TRIGGER store_versions_no_update');
  db.prepare('UPDATE store_versions SET schema_revision = ?, canonical_json = ?, sha256 = ? WHERE record_id = ?')
    .run(MODEL_REQUEST_ADMISSION_SCHEMA_VERSION, old.json, old.digest, String(row.record_id));
  db.exec(DATA_VERSION_TRIGGER_SQL.store_versions_no_update!);
  db.exec(`PRAGMA user_version = ${MODEL_REQUEST_ADMISSION_SCHEMA_VERSION}`);
  expect(new DataVersionLedger(db).standing().latest?.schemaRevision).toBe(MODEL_REQUEST_ADMISSION_SCHEMA_VERSION);
  const markerPath = dataVersionMarkerPath(roots.dataRoot);
  const marker = readDataVersionMarkerText(readFileSync(markerPath, 'utf8'));
  const oldMarker = { ...marker, schemaRevision: MODEL_REQUEST_ADMISSION_SCHEMA_VERSION };
  refuseNewerDataVersion(oldMarker, { dataVersion: 1, schemaRevision: MODEL_REQUEST_ADMISSION_SCHEMA_VERSION });
  writeFileSync(markerPath, JSON.stringify(oldMarker));
}

function retainedSourceRows(db: DatabaseSync) {
  return ['content_objects', 'source_versions', 'source_provenance', 'source_import_records', 'manuscript_import_records',
    'manuscript_block_sources', 'import_fidelity_reviews', 'import_fidelity_categories', 'import_fidelity_choices']
    .map((table) => ({ table, rows: db.prepare(`SELECT rowid, * FROM ${table} ORDER BY rowid`).all() }));
}

async function retainedWordParentFixture(paragraphs = 1) {
  const path = join(roots.inputRoot, 'word-parent.docx');
  await composeRevisedDocx(path, { source: ADMITTED_BASELINE_DOCX, title: '来源固定记录', paragraphs: Array.from({ length: paragraphs }, () =>
    ({ runs: [{ text: { block: 8, from: 0, to: 10 } }, { text: { block: 9, from: 0, to: 5 },
      revision: { kind: 'ins' as const, author: '作者', date: '2026-10-25T00:00:00Z' } }] })) });
  const compiled = await compileWordTrackedDocx(path);
  if (compiled.kind !== 'ready') throw new Error('expected actual supported Word compiler output');
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  let bookId: string;
  try {
    const staged = stageHistoricalTrackedDocxFixture(store, roots.dataRoot, await store.stageSelectedManuscript(randomUUID(), path));
    const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
      { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }, false);
    if (review.reviewDigest === null) throw new Error('historical fixture unexpectedly requires degradation confirmation');
    const commitId = randomUUID();
    bookId = (await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion,
      reviewDigest: review.reviewDigest, commitId })).bookId;
    await store.acknowledgeImportCompletion(commitId);
    store.getBookOverview(bookId); // Validate the original records through their existing historical reader.
    store.markCleanShutdown();
  } finally { store.close(); }
  return { compiled, bookId, originalBytes: new Uint8Array(readFileSync(path)) };
}

/** New-layer fixture only: genuine legacy parents plus separate Word derivation provenance, inside the caller's transaction. */
function wordChoiceFixture(db: DatabaseSync, bookId: string, compiled: Awaited<ReturnType<typeof retainedWordParentFixture>>['compiled']) {
  const original = db.prepare(`SELECT mir.*, ic.review_digest, ic.committed_at FROM manuscript_import_records mir
    JOIN import_commits ic ON ic.commit_id = mir.commit_id WHERE mir.book_id = ?`).get(bookId)!;
  const sourceVersionId = String(original.source_version_id);
  const commitId = String(original.commit_id);
  const recordedAt = String(original.committed_at);
  const pin = readWordParentSourcePin(db, bookId, sourceVersionId);
  const originalProvenance = db.prepare('SELECT * FROM source_provenance WHERE provenance_id = ?').get(String(original.provenance_id));
  const wordProvenanceId = randomUUID();
  db.prepare(`INSERT INTO source_provenance(provenance_id, source_version_id, acquisition_path, locality, sanitized_identity, parser_identity, recorded_at)
    VALUES (?, ?, 'native-file-picker', 'local-provider-free', ?, ?, ?)`).run(wordProvenanceId, sourceVersionId, pin.displayName, WORD_DOCX_PARSER_IDENTITY, recordedAt);
  db.prepare('UPDATE manuscript_import_records SET provenance_id = ? WHERE commit_id = ?').run(wordProvenanceId, commitId);
  retainWordRevisionSource(db, pin, compiled.graph);
  const ledger = new EditorialLearningLedger(db, undefined, (source) => {
    const row = db.prepare('SELECT relative_key FROM content_objects WHERE object_digest = ?').get(source.sourceDigest)!;
    const bytes = readFileSync(join(roots.dataRoot, 'objects', ...String(row.relative_key).split('/')));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(source.sourceDigest);
    const fresh = compileWordTrackedDocxBytes(bytes);
    if (fresh.kind !== 'ready') throw new Error('historical fixture source must still compile');
    expect(fresh.graphDigest).toBe(source.graphDigest);
    expect(wordTrackedSamples(bookId, fresh.graph, fresh.templates).some((sample) => sample.sampleId === source.sampleId &&
      wordTrackedSampleRecord(sample).digest === source.sampleDigest)).toBe(true);
  });
  const samples = wordTrackedSamples(bookId, compiled.graph, compiled.templates);
  const materials = samples.map((sample, index) => ({ templateKey: compiled.templates[index]!.templateKey,
    materialKey: `word-sample:${sample.sampleId}`,
    materialDigest: learningMaterialDigest(wordTrackedEditCandidate(sample, wordTrackedSampleRecord(sample).digest, recordedAt)) }));
  const controls = ledger.wordImportControls(bookId, materials);
  // This isolated relation fixture installs a Word map over the old baseline; fake legacy rows cannot accompany that arm.
  db.exec('DROP TRIGGER manuscript_block_sources_no_delete');
  db.prepare('DELETE FROM manuscript_block_sources WHERE revision_id = ?').run(String(original.resulting_revision_id));
  db.exec(IMPORT_RETENTION_TRIGGER_SQL.manuscript_block_sources_no_delete!);
  const bound = bindWordReadingToRevision(db, bookId, String(original.resulting_revision_id), sourceVersionId, compiled.readings.rejected);
  const choice: WordImportChoiceRecord = { schema: 'ai7.word-import-choice/1', sourceVersionId,
    parentSourcePinDigest: wordParentSourcePinRecord(pin).digest, originalDigest: compiled.sourceDigest, workingObjectDigest: null,
    importReviewId: String(original.review_digest), fidelityReviewId: String(original.fidelity_review_id), commitId,
    revisionId: String(original.resulting_revision_id), extractorIdentity: WORD_EXTRACTOR_IDENTITY, graphDigest: compiled.graphDigest,
    mode: 'suggestions', learnFromEdits: true, acceptedBaselineConfirmed: false,
    readings: { rejected: { digest: compiled.readings.rejected.readingDigest, blockCount: compiled.readings.rejected.blocks.length, usable: compiled.readings.rejected.usable },
      accepted: { digest: compiled.readings.accepted.readingDigest, blockCount: compiled.readings.accepted.blocks.length, usable: compiled.readings.accepted.usable } },
    mappingDigest: bound.mappingDigest, templateManifestDigest: compiled.templateManifestDigest, effectiveControls: controls };
  return { original, originalProvenance, sourceVersionId, commitId, recordedAt, ledger, samples, materials, controls, bound, choice };
}

// Definition/transaction proof only: these call the layer owner directly over genuine existing
// parents, before its global migration activation. They are not a migrated-store or public-intake proof.
describe('closed Word retention definitions (#1132)', () => {
  it('stores unsupported compatibility beside a genuine legacy draft and refuses to relabel a legacy preview as Word', async () => {
    const inputs: Array<{ draftId: string; result: NativeDocxIntakeParse }> = [];
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      for (const unsupported of [true, false]) {
        const path = join(roots.inputRoot, `word-staged-${unsupported}.docx`);
        await composeRevisedDocx(path, { source: ADMITTED_BASELINE_DOCX, title: 'Word 兼容性暂存', paragraphs: [
          { runs: [{ text: { block: 8, from: 0, to: 10 } }, { text: { block: 9, from: 0, to: 5 },
            revision: { kind: 'ins', author: '作者', date: '2026-10-25T00:00:00Z' } }] },
        ], ...(unsupported ? { footnoteRevision: { text: { block: 10, from: 0, to: 5 }, author: '作者', date: '2026-10-25T00:00:00Z' } } : {}) });
        const staged = stageHistoricalTrackedDocxFixture(store, roots.dataRoot, await store.stageSelectedManuscript(randomUUID(), path));
        const result = await parseNativeDocxIntake(path, `word-staged-${unsupported}.docx`, { legacy: () => undefined, wordPreview: () => undefined });
        inputs.push({ draftId: staged.draftId, result });
      }
      store.markCleanShutdown();
    } finally { store.close(); }
    withDatabase(false, (db) => {
      initializeWordImportRetentionSchema(db);
      db.exec('BEGIN IMMEDIATE');
      try {
        const unsupported = inputs[0]!;
        expect(unsupported.result.kind).toBe('legacy');
        const record = stageWordRevisionIntake(db, unsupported.draftId, unsupported.result);
        expect(record).toMatchObject({ compatibility: 'unsupported', previewReading: null });
        expect(stageWordRevisionIntake(db, unsupported.draftId, unsupported.result)).toEqual(record);
        expect(requireWordStagedIntake(db, unsupported.draftId, unsupported.result)).toEqual(record);
        const ready = inputs[1]!;
        expect(ready.result.kind).toBe('word');
        expect(() => stageWordRevisionIntake(db, ready.draftId, ready.result)).toThrow('正计数快照');
        expect(db.prepare('SELECT count(*) total FROM staged_word_revision_intakes').get()?.total).toBe(1);
        db.prepare('UPDATE staged_word_revision_intakes SET sha256 = ? WHERE draft_id = ?').run('f'.repeat(64), unsupported.draftId);
        expect(() => stageWordRevisionIntake(db, unsupported.draftId, unsupported.result)).toThrow('已经变化');
      } finally { db.exec('ROLLBACK'); }
    });
  }, 120_000);

  it('retains a real compiler graph beside its unchanged historical source pin and refuses drift', async () => {
    const { compiled, bookId } = await retainedWordParentFixture();
    withDatabase(false, (db) => {
      const source = db.prepare('SELECT source_version_id FROM source_versions WHERE book_id = ?').get(bookId);
      const sourceVersionId = String(source!.source_version_id);
      const original = db.prepare('SELECT rowid, * FROM source_versions WHERE source_version_id = ?').get(sourceVersionId);
      const provenance = db.prepare('SELECT rowid, * FROM source_provenance WHERE source_version_id = ?').all(sourceVersionId);
      const pin = readWordParentSourcePin(db, bookId, sourceVersionId);
      expect(pin.parserIdentity).toBe('ai7-docx-fflate-saxes/3');
      expect(pin.sourceDigest).toBe(compiled.sourceDigest);
      initializeWordImportRetentionSchema(db);
      expect(() => retainWordRevisionSource(db, pin, compiled.graph)).toThrow('一并提交');
      db.exec('BEGIN IMMEDIATE');
      try {
        const retained = retainWordRevisionSource(db, pin, compiled.graph);
        expect(retainWordRevisionSource(db, pin, compiled.graph)).toEqual(retained);
        expect(retained).toEqual({ parentSourcePinDigest: wordParentSourcePinRecord(pin).digest, graphDigest: compiled.graphDigest });
        expect(db.prepare('SELECT parent_parser_identity, compiler_identity FROM word_revision_sources').get())
          .toMatchObject({ parent_parser_identity: pin.parserIdentity, compiler_identity: WORD_DOCX_PARSER_IDENTITY });
        expect(() => requireWordRevisionSource(db, { ...pin, parserIdentity: WORD_DOCX_PARSER_IDENTITY }, compiled.graph)).toThrow('变化');
        expect(() => requireWordRevisionSource(db, pin, { ...compiled.graph, events: [] })).toThrow('Word');
        expect(() => readWordParentSourcePin(db, randomUUID(), sourceVersionId)).toThrow('Word');
        expect(() => wordParentSourcePinRecord({ ...pin, objectDigest: 'f'.repeat(64) })).toThrow('Word');
        expect(db.prepare('SELECT rowid, * FROM source_versions WHERE source_version_id = ?').get(sourceVersionId)).toEqual(original);
        expect(db.prepare('SELECT rowid, * FROM source_provenance WHERE source_version_id = ?').all(sourceVersionId)).toEqual(provenance);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      db.prepare('UPDATE source_versions SET content_digest = ? WHERE source_version_id = ?').run('e'.repeat(64), sourceVersionId);
      expect(() => requireWordParentSourcePin(db, pin)).toThrow('变化');
      db.prepare('UPDATE source_versions SET parser_identity = ? WHERE source_version_id = ?').run('unknown-parser/1', sourceVersionId);
      expect(() => readWordParentSourcePin(db, bookId, sourceVersionId)).toThrow('Word');
    });
  }, 120_000);

  it('captures only the distinct local Word signal over closed relation fixtures and keeps memory consumers closed', async () => {
    const { compiled, bookId, originalBytes } = await retainedWordParentFixture();
    withDatabase(false, (db) => {
      initializeWordImportRetentionSchema(db);
      db.exec('BEGIN IMMEDIATE');
      try {
        // This seeds only the new canonical relation fixture over genuine parents. It does not exercise
        // public Word import, selected-reading manuscript persistence, a migrated store, or a Journey.
        const { original, originalProvenance, sourceVersionId, commitId, recordedAt, ledger, samples, materials, controls, bound, choice } =
          wordChoiceFixture(db, bookId, compiled);
        const record = canonicalRecord(choice);
        const branchId = String(db.prepare('SELECT branch_id FROM branch_working_state WHERE base_revision_id = ?').get(choice.revisionId)!.branch_id);
        const markStore = new EditorialMarkStore(db);
        const sampleEntries = samples.map((sample, index) => ({ sample, templateKey: compiled.templates[index]!.templateKey }));
        const derive = (currentChoice: WordImportChoiceRecord, currentControls = controls) => wordLocalImportAdmissions({
          bookId, samples: sampleEntries, choice: currentChoice, choiceDigest: canonicalRecord(currentChoice).digest, currentControls, recordedAt });
        expect(derive({ ...choice, learnFromEdits: false })).toEqual([]);
        expect(() => wordLocalImportAdmissions({ bookId, samples: [], choice, choiceDigest: record.digest, currentControls: controls, recordedAt })).toThrow('清单');
        const admissions = derive(choice);
        expect(admissions).toHaveLength(samples.length);
        const cancelled = AbortSignal.abort(new Error('Word contract cancellation'));
        expect(() => wordLocalImportAdmissions({ bookId, samples: sampleEntries, choice, choiceDigest: record.digest,
          currentControls: controls, recordedAt, signal: cancelled })).toThrow('Word contract cancellation');
        const insertChoice = (selected: WordImportChoiceRecord) => {
          expect(retainWordRevisionImport(db, bookId, selected, recordedAt).digest).toBe(canonicalRecord(selected).digest);
        };
        const noCapture = (configure: () => void, learnFromEdits = true) => {
          db.exec('SAVEPOINT word_no_capture');
          try {
            configure();
            const mutedChoice = { ...choice, learnFromEdits, effectiveControls: ledger.wordImportControls(bookId, materials) };
            insertChoice(mutedChoice);
            retainWordManuscriptSourceSegments(db, bookId, mutedChoice, compiled.readings.rejected);
            expect(createWordImportedMarks(db, markStore, bookId, commitId, compiled, branchId)).toBe(compiled.readings.rejected.marks.length);
            expect(db.prepare('SELECT count(*) total FROM word_import_mark_sources WHERE commit_id = ?').get(commitId)?.total)
              .toBe(compiled.readings.rejected.marks.length);
            expect(ledger.retainWordImportSamples(bookId, commitId, compiled)).toEqual({ sources: [], signalIds: [] });
            expect(() => ledger.validateWordImportSamples(bookId, commitId, compiled)).not.toThrow();
            for (const table of ['word_tracked_edit_samples', 'word_tracked_edit_sample_imports', 'learning_signals']) {
              expect(db.prepare(`SELECT count(*) total FROM ${table}`).get()?.total).toBe(0);
            }
          } finally { db.exec('ROLLBACK TO word_no_capture; RELEASE word_no_capture'); }
        };
        noCapture(() => undefined, false);
        noCapture(() => ledger.change({ kind: 'switch', enabled: false, expectedEntries: 0 }));
        noCapture(() => ledger.change({ kind: 'book', bookId, excluded: true, expectedEntries: 0 }));
        insertChoice(choice);
        insertChoice(choice);
        expect(() => retainWordRevisionImport(db, bookId, { ...choice, learnFromEdits: false }, recordedAt)).toThrow('已提交');
        expect(() => requireWordManuscriptSourceSegments(db, bookId, choice, compiled.readings.rejected)).toThrow('不完整');
        expect(retainWordManuscriptSourceSegments(db, bookId, choice, compiled.readings.rejected).mappingDigest).toBe(bound.mappingDigest);
        expect(retainWordManuscriptSourceSegments(db, bookId, choice, compiled.readings.rejected).mappingDigest).toBe(bound.mappingDigest);
        expect(() => createWordImportedMarks(db, markStore, bookId, commitId, compiled, randomUUID())).toThrow('基线');
        const priorMarks = db.prepare('SELECT count(*) total FROM editorial_marks').get()!.total;
        db.exec(`SAVEPOINT word_mark_rollback;
          CREATE TRIGGER word_mark_source_failure BEFORE INSERT ON word_import_mark_sources
          BEGIN SELECT RAISE(ABORT, 'WORD_MARK_SOURCE_FAILURE'); END`);
        try {
          expect(() => createWordImportedMarks(db, markStore, bookId, commitId, compiled, branchId)).toThrow('WORD_MARK_SOURCE_FAILURE');
        } finally { db.exec('ROLLBACK TO word_mark_rollback; RELEASE word_mark_rollback'); }
        expect(db.prepare('SELECT count(*) total FROM editorial_marks').get()!.total).toBe(priorMarks);
        expect(db.prepare('SELECT count(*) total FROM word_import_mark_sources').get()!.total).toBe(0);
        const wordMarkCount = createWordImportedMarks(db, markStore, bookId, commitId, compiled, branchId);
        expect(wordMarkCount).toBe(compiled.readings.rejected.marks.length);
        expect(createWordImportedMarks(db, markStore, bookId, commitId, compiled, branchId)).toBe(wordMarkCount);
        expect(() => validateWordImportedMarkSources(db, bookId, commitId, compiled)).not.toThrow();
        expect(db.prepare('SELECT count(*) total FROM editorial_marks').get()!.total).toBe(Number(priorMarks) + wordMarkCount);
        const sourceMarkRows = db.prepare(`SELECT s.*, m.pinned_revision_id, m.book_id FROM word_import_mark_sources s
          JOIN editorial_marks m ON m.mark_id = s.mark_id WHERE s.commit_id = ? ORDER BY s.source_ordinal`).all(commitId);
        expect(sourceMarkRows).toHaveLength(wordMarkCount);
        expect(sourceMarkRows.every((row) => row.book_id === bookId && row.pinned_revision_id === choice.revisionId)).toBe(true);
        expect(JSON.parse(String(sourceMarkRows[0]!.canonical_json))).toMatchObject({ schema: 'ai7.word-import-mark-source/1',
          sourceVersionId, sourceDigest: compiled.sourceDigest, graphDigest: compiled.graphDigest, importCommitId: commitId,
          importChoiceDigest: record.digest, locator: { kind: 'revision', templateKey: compiled.templates[0]!.templateKey } });
        expect(() => bindWordReadingToRevision(db, randomUUID(), choice.revisionId, sourceVersionId, compiled.readings.rejected)).toThrow();
        expect(() => requireWordManuscriptSourceSegments(db, bookId, choice, compiled.readings.accepted)).toThrow('另一条阅读');
        const mapped = readWordManuscriptExportSource(db, bookId, choice.revisionId, sourceVersionId, originalBytes);
        expect(mapped.pins).toMatchObject({ importCommitId: commitId, mappingAncestorRevisionId: choice.revisionId,
          parentSourcePinDigest: choice.parentSourcePinDigest });
        const exportInput = { title: 'Word 对应契约', blocks: bound.blocks, marks: [], options: DEFAULT_MANUSCRIPT_EXPORT_OPTIONS, source: mapped.source };
        expect(renderDocxExport(exportInput, { emit: true }).bytes).not.toBeNull();
        expect(planWordManuscriptExport(exportInput, 'docx', { ...mapped.pins, revisionId: choice.revisionId,
          revisionDigest: String(db.prepare('SELECT revision_digest FROM manuscript_revisions WHERE revision_id = ?').get(choice.revisionId)!.revision_digest) }).binding.mode)
          .toBe('suggestions');
        expect(() => readWordManuscriptExportSource(db, randomUUID(), choice.revisionId, sourceVersionId, originalBytes)).toThrow();
        expect(() => readWordManuscriptExportSource(db, bookId, choice.revisionId, sourceVersionId, originalBytes.slice(1))).toThrow('字节');
        expect(() => ledger.retainWordImportSamples(bookId, commitId, compiled, cancelled)).toThrow('Word contract cancellation');
        expect(() => ledger.retainWordImportSamples(bookId, commitId, { ...compiled, templates: compiled.templates.slice(1) })).toThrow();
        expect(db.prepare('SELECT count(*) total FROM word_tracked_edit_samples').get()?.total).toBe(0);
        expect(db.prepare('SELECT count(*) total FROM word_tracked_edit_sample_imports').get()?.total).toBe(0);
        expect(db.prepare('SELECT count(*) total FROM learning_signals').get()?.total).toBe(0);
        db.exec(`SAVEPOINT word_capture_rollback;
          CREATE TRIGGER word_capture_failure BEFORE INSERT ON learning_signals
          BEGIN SELECT RAISE(ABORT, 'WORD_CAPTURE_FAILURE'); END`);
        try {
          expect(() => ledger.retainWordImportSamples(bookId, commitId, compiled)).toThrow('WORD_CAPTURE_FAILURE');
        } finally { db.exec('ROLLBACK TO word_capture_rollback; RELEASE word_capture_rollback'); }
        for (const table of ['word_tracked_edit_samples', 'word_tracked_edit_sample_imports', 'learning_signals']) {
          expect(db.prepare(`SELECT count(*) total FROM ${table}`).get()?.total).toBe(0);
        }
        const { sources, signalIds: signals } = ledger.retainWordImportSamples(bookId, commitId, compiled);
        expect(sources.map((source) => source.sampleId)).toEqual(admissions.map(({ sample }) => sample.sampleId));
        expect(db.prepare('SELECT count(*) total FROM word_tracked_edit_sample_imports WHERE commit_id = ?').get(commitId)?.total).toBe(admissions.length);
        expect(signals).toHaveLength(samples.length);
        expect(ledger.retainWordImportSamples(bookId, commitId, compiled)).toEqual({ sources, signalIds: signals });
        expect(ledger.captureWordSamples(sources)).toEqual(signals);
        expect(() => ledger.validateWordImportSamples(bookId, commitId, compiled)).not.toThrow();
        db.exec('SAVEPOINT word_manifest_missing');
        try {
          db.exec('DROP TRIGGER word_tracked_edit_sample_imports_no_delete');
          db.prepare('DELETE FROM word_tracked_edit_sample_imports WHERE sample_id = ? AND commit_id = ?').run(samples[0]!.sampleId, commitId);
          expect(() => ledger.validateWordImportSamples(bookId, commitId, compiled)).toThrow();
        } finally { db.exec('ROLLBACK TO word_manifest_missing; RELEASE word_manifest_missing'); }
        const inspect = () => ledger.inspect({ signalOffset: 0, itemOffset: 0 }, 'development-ci');
        const signal = inspect().signals[0]!;
        expect(signal).toMatchObject({ kind: 'word-tracked-edit', schema: 'ai7.word-import-learning-signal/1',
          currentEligibility: 'house', memoryCandidate: null, eligibility: { decisionId: null, basisVersion: 2 } });
        expect(ledger.automaticAdmissionFor(bookId, signal.source.materialKey, signal.source.materialDigest, 'development-ci'))
          .toEqual({ choice: 'house', sourceKeys: ledger.sourceKeys(bookId, [signal.source.materialKey]) });
        expect(Object.hasOwn(signal.source, 'decisionId')).toBe(false);
        expect(db.prepare('SELECT * FROM source_provenance WHERE provenance_id = ?').get(String(original.provenance_id))).toEqual(originalProvenance);
        expect(readWordParentSourcePin(db, bookId, sourceVersionId).parserIdentity).toBe('ai7-docx-fflate-saxes/3');
        const context = createWordSampleDetailContext(db, bookId, sourceVersionId, compiled);
        const firstSource = sources[0]!;
        const historicalImports = ledger.wordSampleImports(bookId, firstSource.sampleId, firstSource.sampleDigest);
        expect(Object.isFrozen(historicalImports[0]!.choice.effectiveControls.materials)).toBe(true);
        expect(() => { historicalImports[0]!.choice.mode = 'accepted-baseline'; }).toThrow();
        const detail = resolveWordSampleDetailSource(db, context, firstSource.sampleId, firstSource.sampleDigest, historicalImports);
        const detailDigest = wordSampleDetailStream(detail).detailDigest;
        const page = pageWordSampleDetail(detail, null);
        expect(page.sampleDigest).toBe(firstSource.sampleDigest);
        expect(page.items.length).toBeGreaterThan(0);
        expect(page.items.some((item) => item.kind === 'record' && item.record.type === 'import')).toBe(true);
        expect(wordSampleDetailContextCurrent(db, context)).toBe(true);
        expect(() => resolveWordSampleDetailSource(db, context, firstSource.sampleId, 'f'.repeat(64), historicalImports)).toThrow();
        expect(() => resolveWordSampleDetailSource(db, context, firstSource.sampleId, firstSource.sampleDigest, [])).toThrow();
        expect(() => ledger.sourceSnapshot(signal.signalId)).toThrow();
        expect(() => ledger.create({ clientMemoryId: randomUUID(), signalId: signal.signalId, title: '拒绝 Word 记忆', editorialDimension: '语言', confidence: 0.5 })).toThrow();
        expect(() => ledger.create({ schema: 'ai7.global-editorial-memory/2', actionId: randomUUID(), signalIds: [signal.signalId],
          applicability: { kind: 'house' }, title: '拒绝 Word 记忆', editorialDimension: '语言', confidence: 0.5 }, 'development-ci')).toThrow();
        expect(inspect().items).toEqual([]);
        ledger.change({ kind: 'book', bookId, excluded: true, expectedEntries: 0 });
        expect(() => ledger.validateWordImportSamples(bookId, commitId, compiled)).not.toThrow();
        expect(wordSampleDetailContextCurrent(db, context)).toBe(false);
        expect(() => resolveWordSampleDetailSource(db, context, firstSource.sampleId, firstSource.sampleDigest, historicalImports)).toThrow('缓存已变化');
        const excludedContext = createWordSampleDetailContext(db, bookId, sourceVersionId, compiled);
        const excludedDetail = resolveWordSampleDetailSource(db, excludedContext, firstSource.sampleId, firstSource.sampleDigest,
          ledger.wordSampleImports(bookId, firstSource.sampleId, firstSource.sampleDigest));
        expect(wordSampleDetailStream(excludedDetail).detailDigest).toBe(detailDigest);
        const bookExcluded = ledger.wordImportControls(bookId, materials);
        expect(() => derive(choice, bookExcluded)).toThrow('变化');
        expect(derive({ ...choice, effectiveControls: bookExcluded }, bookExcluded)).toEqual([]);
        expect(inspect().signals[0]!.currentEligibility).toBe('excluded');
        expect(ledger.automaticAdmissionFor(bookId, signal.source.materialKey, signal.source.materialDigest, 'development-ci')).toBeNull();
        expect(() => ledger.captureWordSamples(sources)).toThrow();
        ledger.change({ kind: 'book', bookId, excluded: false, expectedEntries: 1 });
        ledger.change({ kind: 'switch', enabled: false, expectedEntries: 2 });
        const globalOff = ledger.wordImportControls(bookId, materials);
        expect(derive({ ...choice, effectiveControls: globalOff }, globalOff)).toEqual([]);
        ledger.change({ kind: 'switch', enabled: true, expectedEntries: 3 });
        expect(inspect().signals).toHaveLength(samples.length);
        ledger.change({ kind: 'material', signalId: signal.signalId });
        const materialExcluded = ledger.wordImportControls(bookId, materials);
        expect(derive({ ...choice, effectiveControls: materialExcluded }, materialExcluded)).toEqual([]);
        expect(inspect().signals[0]!.currentEligibility).toBe('excluded');
        db.exec('DROP TRIGGER word_tracked_edit_sample_imports_no_update');
        db.prepare('UPDATE word_tracked_edit_sample_imports SET choice_digest = ?').run('f'.repeat(64));
        expect(() => ledger.wordSampleImports(bookId, firstSource.sampleId, firstSource.sampleDigest)).toThrow();
        expect(inspect).toThrow(); // Corruption never becomes an empty eligible page.
      } finally { db.exec('ROLLBACK'); }
    });
  }, 120_000);

  it('retains every member of a thousands-edit manifest through the production capture owner, with no duplicate retry rows', async () => {
    const { compiled, bookId } = await retainedWordParentFixture(2_001);
    expect(compiled.templates).toHaveLength(2_001);
    withDatabase(false, (db) => {
      initializeWordImportRetentionSchema(db);
      db.exec('BEGIN IMMEDIATE');
      try {
        const { choice, ledger, samples, recordedAt, commitId } = wordChoiceFixture(db, bookId, compiled);
        const choiceRecord = retainWordRevisionImport(db, bookId, choice, recordedAt);
        retainWordManuscriptSourceSegments(db, bookId, choice, compiled.readings.rejected);
        const expected = samples.map((sample) => ({ id: sample.sampleId, digest: wordTrackedSampleRecord(sample).digest }))
          .sort((a, b) => a.id.localeCompare(b.id));
        const captured = ledger.retainWordImportSamples(bookId, commitId, compiled);
        expect(captured.sources.map((source) => ({ id: source.sampleId, digest: source.sampleDigest })).sort((a, b) => a.id.localeCompare(b.id))).toEqual(expected);
        const storedSamples = db.prepare('SELECT sample_id, sha256 FROM word_tracked_edit_samples WHERE book_id = ? ORDER BY sample_id').all(bookId);
        expect(storedSamples.map((row) => ({ id: row.sample_id, digest: row.sha256 }))).toEqual(expected);
        const memberships = db.prepare(`SELECT sample_id, sample_digest, choice_digest, sha256, canonical_json
          FROM word_tracked_edit_sample_imports WHERE commit_id = ? ORDER BY sample_id`).all(commitId);
        expect(memberships.map((row) => ({ id: row.sample_id, digest: row.sample_digest }))).toEqual(expected);
        const admissions = new Map(captured.sources.map((source) => [source.sampleId, source.admissionDigest]));
        expect(memberships.every((row) => row.choice_digest === choiceRecord.digest && row.sha256 === admissions.get(String(row.sample_id)) &&
          canonicalRecord(JSON.parse(String(row.canonical_json))).digest === row.sha256)).toBe(true);
        const signals = db.prepare(`SELECT source_key FROM learning_signals WHERE book_id = ? ORDER BY source_key`).all(bookId);
        expect(signals.map((row) => row.source_key)).toEqual(expected.map((entry) => `word-sample:${entry.id}:${entry.digest}`));
        expect(captured.signalIds).toHaveLength(expected.length);
        expect(ledger.retainWordImportSamples(bookId, commitId, compiled)).toEqual(captured);
        expect(db.prepare('SELECT count(*) total FROM word_tracked_edit_samples').get()?.total).toBe(expected.length);
        expect(db.prepare('SELECT count(*) total FROM word_tracked_edit_sample_imports').get()?.total).toBe(expected.length);
        expect(db.prepare('SELECT count(*) total FROM learning_signals').get()?.total).toBe(expected.length);
      } finally { db.exec('ROLLBACK'); }
    });
  }, 180_000);

  it('adds the complete empty layer once while preserving existing source and retention records', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try { await importSample1Book(store, roots.codeRoot, 'Word 层保留校验'); store.markCleanShutdown(); } finally { store.close(); }
    withDatabase(false, (db) => {
      const tables = ['source_versions', 'source_provenance', 'manuscript_block_sources', 'import_fidelity_categories', 'import_fidelity_choices'];
      const prior = tables.map((table) => db.prepare(`SELECT rowid, * FROM ${table} ORDER BY rowid`).all());
      const version = db.prepare('PRAGMA user_version').get();
      dropEmptyWordRetentionLayer(db);
      initializeWordImportRetentionSchema(db);
      initializeWordImportRetentionSchema(db);
      validateWordImportRetentionSchema(db);
      expect(tables.map((table) => db.prepare(`SELECT rowid, * FROM ${table} ORDER BY rowid`).all())).toEqual(prior);
      expect(db.prepare('PRAGMA user_version').get()).toEqual(version);
      expect(Object.keys(WORD_IMPORT_RETENTION_SCHEMA_SQL).map((table) => db.prepare(`SELECT count(*) total FROM ${table}`).get()?.total))
        .toEqual(Array(7).fill(0));
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    });
  }, 120_000);

  it('refuses a partial layer without healing it or stamping a revision', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try { store.markCleanShutdown(); } finally { store.close(); }
    withDatabase(false, (db) => {
      dropEmptyWordRetentionLayer(db);
      db.exec('CREATE TABLE word_revision_sources (source_version_id TEXT PRIMARY KEY) STRICT');
      const schema = db.prepare('SELECT name, sql FROM sqlite_schema ORDER BY name').all();
      const version = db.prepare('PRAGMA user_version').get();
      expect(() => initializeWordImportRetentionSchema(db)).toThrow('Word');
      expect(db.prepare('SELECT name, sql FROM sqlite_schema ORDER BY name').all()).toEqual(schema);
      expect(db.prepare('PRAGMA user_version').get()).toEqual(version);
    });
  });

  it('rolls back all seven definitions when a trigger collision interrupts initialization', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try { store.markCleanShutdown(); } finally { store.close(); }
    withDatabase(false, (db) => {
      dropEmptyWordRetentionLayer(db);
      db.exec('CREATE TRIGGER word_revision_sources_no_update BEFORE UPDATE ON books BEGIN SELECT 1; END');
      const schema = db.prepare('SELECT name, sql FROM sqlite_schema ORDER BY name').all();
      const version = db.prepare('PRAGMA user_version').get();
      expect(() => initializeWordImportRetentionSchema(db)).toThrow();
      expect(db.prepare('SELECT name, sql FROM sqlite_schema ORDER BY name').all()).toEqual(schema);
      expect(db.prepare('PRAGMA user_version').get()).toEqual(version);
      expect(db.isTransaction).toBe(false);
    });
  });
});

describe('Word empty-layer migration through EditorialStore.open', () => {
  it.each([MODEL_REQUEST_ADMISSION_SCHEMA_VERSION, LATEST_SCHEMA_VERSION])('refuses an orphan Word source before any open mutation at reader %s', async (reader) => {
    const { compiled, bookId } = await retainedWordParentFixture();
    const before = withDatabase(false, (db) => {
      const sourceVersionId = String(db.prepare('SELECT source_version_id FROM source_versions WHERE book_id = ?').get(bookId)!.source_version_id);
      db.exec('BEGIN IMMEDIATE');
      try { retainWordRevisionSource(db, readWordParentSourcePin(db, bookId, sourceVersionId), compiled.graph); db.exec('COMMIT'); }
      catch (error) { db.exec('ROLLBACK'); throw error; }
      db.exec(`PRAGMA user_version = ${reader}`);
      return { sources: retainedSourceRows(db), word: db.prepare('SELECT * FROM word_revision_sources').all(),
        versions: db.prepare('SELECT * FROM store_versions ORDER BY ordinal').all() };
    });
    const marker = readFileSync(dataVersionMarkerPath(roots.dataRoot), 'utf8');
    await expect(EditorialStore.open(roots.dataRoot, roots.codeRoot)).rejects.toMatchObject({
      code: reader === MODEL_REQUEST_ADMISSION_SCHEMA_VERSION ? 'WORD_READER_STAMP_INVALID' : 'WORD_SOURCE_INVALID' });
    withDatabase(true, (db) => {
      expect(db.prepare('PRAGMA user_version').get()!.user_version).toBe(reader);
      expect(retainedSourceRows(db)).toEqual(before.sources);
      expect(db.prepare('SELECT * FROM word_revision_sources').all()).toEqual(before.word);
      expect(db.prepare('SELECT * FROM store_versions ORDER BY ordinal').all()).toEqual(before.versions);
    });
    expect(readFileSync(dataVersionMarkerPath(roots.dataRoot), 'utf8')).toBe(marker);
  });

  it.each([false, true])('migrates a reader-92 source store without backfill through two reopens (interrupted before stamp: %s)', async (interrupt) => {
    const original = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try { await importSample1Book(original, roots.codeRoot, 'Word 迁移保留'); original.markCleanShutdown(); } finally { original.close(); }
    const before = withDatabase(false, (db) => {
      const rows = retainedSourceRows(db);
      constructReader92Predecessor(db);
      expect(retainedSourceRows(db)).toEqual(rows);
      return rows;
    });
    const object = withDatabase(false, (db) => db.prepare('SELECT relative_key, object_digest FROM content_objects ORDER BY object_digest LIMIT 1').get()!);
    const objectPath = join(roots.dataRoot, 'objects', ...String(object.relative_key).split('/'));
    const objectDigest = (): string => createHash('sha256').update(readFileSync(objectPath)).digest('hex');
    expect(objectDigest()).toBe(object.object_digest);
    if (interrupt) {
      const execute = DatabaseSync.prototype.exec;
      let interrupted = false;
      const stamp = vi.spyOn(DatabaseSync.prototype, 'exec').mockImplementation(function (this: DatabaseSync, sql: string): void {
        if (!interrupted && sql.trim() === `PRAGMA user_version = ${LATEST_SCHEMA_VERSION}`) {
          interrupted = true;
          throw new Error('WORD_MIGRATION_BEFORE_STAMP');
        }
        execute.call(this, sql);
      });
      try { await expect(EditorialStore.open(roots.dataRoot, roots.codeRoot)).rejects.toThrow('WORD_MIGRATION_BEFORE_STAMP'); }
      finally { stamp.mockRestore(); }
      expect(interrupted).toBe(true);
      withDatabase(false, (db) => {
        expect(db.prepare('PRAGMA user_version').get()!.user_version).toBe(MODEL_REQUEST_ADMISSION_SCHEMA_VERSION);
        validateWordImportRetentionSchema(db);
        expect(retainedSourceRows(db)).toEqual(before);
      });
      expect(readDataVersionMarkerText(readFileSync(dataVersionMarkerPath(roots.dataRoot), 'utf8')).schemaRevision)
        .toBe(MODEL_REQUEST_ADMISSION_SCHEMA_VERSION);
    }
    for (let reopen = 0; reopen < 2; reopen += 1) {
      const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      try { migrated.markCleanShutdown(); } finally { migrated.close(); }
      withDatabase(false, (db) => {
        expect(db.prepare('PRAGMA user_version').get()!.user_version).toBe(LATEST_SCHEMA_VERSION);
        validateWordImportRetentionSchema(db);
        expect(retainedSourceRows(db)).toEqual(before);
        expect(WORD_IMPORT_RETENTION_RELATIONS_DROP_ORDER.map((table) => db.prepare(`SELECT count(*) total FROM ${table}`).get()!.total))
          .toEqual(Array(7).fill(0));
        expect(db.prepare('SELECT count(*) total FROM learning_signals').get()!.total).toBe(0);
      });
      expect(objectDigest()).toBe(object.object_digest);
    }
  }, 120_000);
});

/**
 * Plant revision 26 exactly as a build before ADR 0086 left it, over a store holding one imported sample1 Book: its
 * review is the eight-row one the frozen builder rebuilds under parser identity /1, degraded and accepted as it had to
 * be, and `import_fidelity_categories` holds revision 26's text. Returns the planted rows.
 */
function plantRevision26(): Row[] {
  return withDatabase(false, (database) => {
    database.exec('PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE;');
    const review = database.prepare('SELECT fidelity_review_id, source_version_id FROM manuscript_import_records').get() as Row;
    const reviewId = String(review.fidelity_review_id);
    database.prepare("UPDATE source_versions SET parser_identity = 'ai7-docx-fflate-saxes/1' WHERE source_version_id = ?").run(String(review.source_version_id));
    database.prepare("UPDATE source_provenance SET parser_identity = 'ai7-docx-fflate-saxes/1' WHERE source_version_id = ?").run(String(review.source_version_id));
    database.prepare('DELETE FROM import_fidelity_categories WHERE fidelity_review_id = ?').run(reviewId);
    for (const relation of [...PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER, ...REIMPORT_GROUP_RELATIONS_DROP_ORDER, ...CLARIFICATION_RELATIONS_DROP_ORDER, ...RUN_CHECKPOINT_RELATIONS_DROP_ORDER, ...DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER, ...EXPORT_LEDGER_RELATIONS_DROP_ORDER, ...IMPORTED_MARK_RELATIONS_DROP_ORDER, ...IMPORT_RETENTION_RELATIONS_DROP_ORDER]) database.exec(`DROP TABLE ${relation}`);
    database.exec('DROP TABLE import_fidelity_categories');
    database.exec(IMPORT_FIDELITY_CATEGORIES_REVISION_26_SQL);
    const insert = database.prepare(
      `INSERT INTO import_fidelity_categories(fidelity_review_id, category_key, display_label, item_count, status, detail, position)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    SAMPLE1_V1_REPORT.forEach((category, index) =>
      insert.run(reviewId, category.key, category.label, category.count, category.status, category.detail, index + 1));
    database.prepare("UPDATE import_fidelity_reviews SET outcome = 'degraded-import-no-round-trip' WHERE fidelity_review_id = ?").run(reviewId);
    const decisionId = randomUUID();
    database.prepare('INSERT INTO import_degradation_decisions(degradation_decision_id, fidelity_review_id, decision, created_at) VALUES (?, ?, ?, ?)')
      .run(decisionId, reviewId,
        '{"items":[{"categoryKey":"inline-styles","count":266,"label":"行内样式"},{"categoryKey":"sections","count":1,"label":"分节"}],' +
        '"schema":"ai7.import-degradation-decision/1","scope":"this-import-only","state":"accepted-complete-set"}',
        new Date().toISOString());
    database.prepare('UPDATE manuscript_import_records SET degradation_decision_id = ?').run(decisionId);
    execPre74Fixture(database, `PRAGMA user_version = ${PROPOSAL_CONFLICT_SCHEMA_VERSION}; COMMIT; PRAGMA foreign_keys = ON;`);
    downgradeKindCoupledRelations(database, ANALYSIS_LEDGER_REVISION_58_SQL);
    expect(importFidelityCategoriesShape(database)).toBe('revision-26');
    return database.prepare('SELECT rowid, * FROM import_fidelity_categories ORDER BY rowid').all() as Row[];
  });
}

function withDatabase<T>(readOnly: boolean, body: (database: DatabaseSync) => T): T {
  const database = new DatabaseSync(databasePath(), { readOnly });
  try {
    return body(database);
  } finally {
    database.close();
  }
}

async function composed(request: ComposedManuscriptRequest): Promise<{ path: string; parsed: ParsedDocx; blocks: ParsedDocxBlock[] }> {
  const path = join(roots.inputRoot, `${randomUUID()}.docx`);
  await composeManuscriptDocx(path, request);
  const blocks: ParsedDocxBlock[] = [];
  const parsed = await parseDocx(path, 'composed.docx', (block) => blocks.push(block));
  return { path, parsed, blocks };
}

async function importComposed(
  store: EditorialStore,
  path: string,
  disposition?: TextBoxDisposition,
): Promise<{ bookId: string; manuscriptId: string; branchId: string; revisionId: string; textBoxDisposition: TextBoxDisposition | null }> {
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  const target = { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value } as const;
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, target, false, disposition);
  expect(review.reviewDigest).not.toBeNull();
  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({
    draftId: staged.draftId,
    expectedDraftVersion: review.draftVersion,
    reviewDigest: review.reviewDigest!,
    commitId,
  });
  expect(await store.acknowledgeImportCompletion(commitId)).toEqual({ state: 'acknowledged' });
  return { ...commit, textBoxDisposition: review.textBoxDisposition };
}

/** Every block of the branch's working state, in order, read through the product's own window. */
function workingBlocks(store: EditorialStore, manuscriptId: string, branchId: string): ManuscriptBlockProjection[] {
  const blocks: ManuscriptBlockProjection[] = [];
  let cursor: string | null = null;
  do {
    const window = store.getManuscriptWindow(manuscriptId, branchId, cursor);
    for (const block of window.blocks) if (!blocks.some((known) => known.blockId === block.blockId)) blocks.push(block);
    cursor = window.nextCursor;
  } while (cursor !== null);
  return blocks;
}

function blockSources(revisionId: string): Row[] {
  return withDatabase(true, (database) => database.prepare(
    `SELECT s.block_id, v.position, v.digest, s.source_part, s.source_paragraph_index, s.box_ordinal,
            s.box_paragraph_ordinal, s.source_paragraph_digest
     FROM manuscript_block_sources s
     JOIN manuscript_block_versions v ON v.revision_id = s.revision_id AND v.block_id = s.block_id
     WHERE s.revision_id = ? ORDER BY v.position`,
  ).all(revisionId) as Row[]);
}

function textBoxChoices(): Row[] {
  return withDatabase(true, (database) => database.prepare('SELECT category_key, choice FROM import_fidelity_choices').all() as Row[]);
}

describe('import retention over the real store (ADR 0086)', () => {
  it('imports exact sample1 without a degradation decision and maps every block of r1 to its source paragraph', async () => {
    await requireExactSample1(roots.codeRoot);
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let revisionId: string;
    try {
      const book = await importSample1Book(store, roots.codeRoot, '保留导入');
      revisionId = book.revisionId;
      const record = store.getBookOverview(book.bookId).records.find((item) => item.kind === 'import-record');
      expect(record?.kind === 'import-record' && record.degradationDecision).toBeNull();
      expect(record?.kind === 'import-record' && record.fidelityCategories.filter((category) => category.count > 0)
        .map((category) => [category.key, category.status, category.statusLabel])).toEqual([
        ['inline-styles', 'retained', '完整保留（随文件保留）'],
        ['sections', 'retained', '完整保留（随文件保留）'],
      ]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    const sources = blockSources(revisionId);
    expect(sources).toHaveLength(SAMPLE1_BLOCKS);
    expect(sources.every((row) => row.source_part === 'body' && row.box_ordinal === null && row.source_paragraph_digest === row.digest)).toBe(true);
    // Document order: each block names a later paragraph than the one before it.
    expect(sources.every((row, index) => index === 0 || Number(row.source_paragraph_index) > Number(sources[index - 1]!.source_paragraph_index))).toBe(true);
    // sample1 has no text box, so its review records no choice.
    expect(textBoxChoices()).toEqual([]);
  }, 120_000);

  it('keeps a text box with the file by default: r1 is the body alone and the review records 保留为文本框', async () => {
    const { path, blocks } = await composed(TEXT_BOX_EXCERPT);
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let imported: Awaited<ReturnType<typeof importComposed>>;
    try {
      const staged = await store.stageSelectedManuscript(randomUUID(), path);
      const row = staged.fidelity.find((category) => category.key === 'text-boxes')!;
      expect([row.count, row.status]).toEqual([1, 'retained']);
      expect(row.detail.startsWith('保留为文本框：')).toBe(true);
      await store.abandonImportDraft(staged.draftId, staged.draftVersion);
      imported = await importComposed(store, path);
      expect(imported.textBoxDisposition).toBe('retain');
      expect(workingBlocks(store, imported.manuscriptId, imported.branchId).map((block) => block.digest))
        .toEqual(blocks.map((block) => block.digest));
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    expect(textBoxChoices()).toEqual([{ category_key: 'text-boxes', choice: 'retain' }]);
    expect(blockSources(imported.revisionId).map((row) => row.source_part)).toEqual(Array(6).fill('body'));
  }, 120_000);

  it('merges a text box on request: its paragraphs follow the paragraph that anchors it, and survive a reopen', async () => {
    const { path, blocks, parsed } = await composed(TEXT_BOX_EXCERPT);
    const [box] = parsed.textBoxes;
    expect(box?.paragraphs).toHaveLength(2);
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let imported: Awaited<ReturnType<typeof importComposed>>;
    const expectedOrder = [blocks[0]!.digest, blocks[1]!.digest, ...box!.paragraphs.map((paragraph) => paragraph.digest),
      ...blocks.slice(2).map((block) => block.digest)];
    try {
      imported = await importComposed(store, path, 'merge');
      expect(imported.textBoxDisposition).toBe('merge');
      expect(workingBlocks(store, imported.manuscriptId, imported.branchId).map((block) => block.digest)).toEqual(expectedOrder);
      const record = store.getBookOverview(imported.bookId).records.find((item) => item.kind === 'import-record');
      const row = record?.kind === 'import-record' ? record.fidelityCategories.find((category) => category.key === 'text-boxes') : undefined;
      expect(row?.detail.startsWith('并入正文：')).toBe(true);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    expect(textBoxChoices()).toEqual([{ category_key: 'text-boxes', choice: 'merge' }]);
    const sources = blockSources(imported.revisionId);
    expect(sources.map((row) => row.digest)).toEqual(expectedOrder);
    expect(sources.map((row) => [row.source_part, row.box_ordinal, row.box_paragraph_ordinal])).toEqual([
      ['body', null, null], ['body', null, null], ['text-box', 1, 1], ['text-box', 1, 2],
      ['body', null, null], ['body', null, null], ['body', null, null], ['body', null, null],
    ]);
    expect(sources.every((row, index) => index === 0 || Number(row.source_paragraph_index) > Number(sources[index - 1]!.source_paragraph_index))).toBe(true);

    // Every record reads back exactly after a reopen validates the whole store.
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(workingBlocks(reopened, imported.manuscriptId, imported.branchId).map((block) => block.digest)).toEqual(expectedOrder);
      expect(reopened.getBookOverview(imported.bookId).book.bookId).toBe(imported.bookId);
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
  }, 180_000);

  it('refuses to merge a file that has no text box', async () => {
    const { path } = await composed({ source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 4, title: '无文本框组稿' });
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const staged = await store.stageSelectedManuscript(randomUUID(), path);
      expect(() => store.prepareNewBookReview(staged.draftId, staged.draftVersion,
        { kind: 'new-book', choiceId: 'new-book', confirmedTitle: '无文本框组稿' }, false, 'merge'))
        .toThrow(expect.objectContaining({ code: 'TEXT_BOX_CHOICE_INVALID' }));
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 120_000);

  it('asks for the degradation decision for a field and a note, and records it with the review', async () => {
    const { path } = await composed({
      source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 5, title: '降级组稿',
      retention: { field: { block: 1 }, footnote: { block: 3, noteSourceBlock: 9 } },
    });
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const staged = await store.stageSelectedManuscript(randomUUID(), path);
      const target = { kind: 'new-book', choiceId: 'new-book', confirmedTitle: '降级组稿' } as const;
      const pending = store.prepareNewBookReview(staged.draftId, staged.draftVersion, target, false);
      expect(pending.reviewDigest).toBeNull();
      expect(pending.degradationDecision).toEqual({
        state: 'required-unselected',
        items: [
          { categoryKey: 'notes', label: '脚注与尾注', count: 1 },
          { categoryKey: 'fields', label: '域（目录等）', count: 1 },
        ],
      });
      const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, target, true);
      expect(review.degradationDecision.state).toBe('accepted-complete-set');
      const commitId = randomUUID();
      const commit = await store.commitNewBookImport({
        draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId,
      });
      const record = store.getBookOverview(commit.bookId).records.find((item) => item.kind === 'import-record');
      expect(record?.kind === 'import-record' && record.degradationDecision?.acceptedItems.map((item) => item.categoryKey))
        .toEqual(['notes', 'fields']);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 120_000);

  it('keeps a merge chosen on a review that must first accept its degradation', async () => {
    const { path, blocks } = await composed({
      ...TEXT_BOX_EXCERPT, title: '文本框与域组稿',
      retention: { ...TEXT_BOX_EXCERPT.retention, field: { block: 1 } },
    });
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const staged = await store.stageSelectedManuscript(randomUUID(), path);
      const target = { kind: 'new-book', choiceId: 'new-book', confirmedTitle: '文本框与域组稿' } as const;
      const pending = store.prepareNewBookReview(staged.draftId, staged.draftVersion, target, false, 'merge');
      // The unaccepted review already states the choice, so the renderer can repeat it with the acceptance.
      expect([pending.reviewDigest, pending.degradationDecision.state, pending.textBoxDisposition]).toEqual([null, 'required-unselected', 'merge']);
      const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, target, true, pending.textBoxDisposition!);
      expect([review.degradationDecision.state, review.textBoxDisposition]).toEqual(['accepted-complete-set', 'merge']);
      const commit = await store.commitNewBookImport({
        draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId: randomUUID(),
      });
      expect(workingBlocks(store, commit.manuscriptId, commit.branchId)).toHaveLength(blocks.length + 2);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    expect(textBoxChoices()).toEqual([{ category_key: 'text-boxes', choice: 'merge' }]);
  }, 120_000);

  it('maps every block of a reimported revision to the paragraph of the file it came from', async () => {
    const first = await composed({ source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 6, title: '重新导入组稿' });
    const second = await composed({ ...TEXT_BOX_EXCERPT, blocks: 7, title: '重新导入组稿' });
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let resultingRevisionId: string | null;
    try {
      const book = await importComposed(store, first.path);
      const staged = await store.stageSelectedManuscript(randomUUID(), second.path);
      const started = store.createManuscriptReimportPreparationWork(staged.draftId, staged.draftVersion, {
        kind: 'existing-book', bookId: book.bookId, relationship: 'reimport', lineage: { kind: 'unconfirmed' }, reuseSourceVersionId: null,
      });
      let prepared = store.advanceManuscriptReimportPreparationWork(started.workId);
      while (!prepared.done) prepared = store.advanceManuscriptReimportPreparationWork(started.workId);
      let review = prepared.review!;
      // The one appended block is a row the editor resolves (Issue #412: 改写与新增, the one verb it admits); nothing is preselected.
      const unresolved: string[] = [];
      let cursor: number | null = null;
      do {
        const page = store.getReimportMappingPage(review.draftId, review.draftVersion, cursor);
        unresolved.push(...page.items.filter((item) => item.verb === null).map((item) => item.groupId));
        expect(page.items.map((item) => item.verbs)).toEqual(page.items.map(() => ['rewrite']));
        cursor = page.nextCursor;
      } while (cursor !== null);
      expect(unresolved).toHaveLength(1);
      for (const groupId of unresolved) {
        const resolution = store.createReimportResolutionWork(review.draftId, review.draftVersion, groupId, 'rewrite');
        let progress = store.advanceReimportResolutionWork(resolution.workId);
        while (!progress.done) progress = store.advanceReimportResolutionWork(resolution.workId);
        review = progress.review!;
      }
      expect(review.commitReady).toBe(true);
      // A reimport offers no text-box choice: the new file's box stays with it.
      expect(review.fidelity.find((category) => category.key === 'text-boxes')?.detail.startsWith('保留为文本框：')).toBe(true);
      const commit = await store.createManuscriptReimportCommitWork({
        draftId: review.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest, commitId: randomUUID(),
      });
      let result = commit.result;
      while (result === null) {
        // The commit re-reads the file in the background: give its I/O a turn between steps.
        await new Promise((resolve) => setTimeout(resolve, 5));
        const progress = await store.advanceManuscriptReimportCommitWork(commit.workId!);
        result = progress.result;
      }
      expect(result.resultKind).toBe('changed');
      resultingRevisionId = result.resultingRevisionId;
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    const sources = blockSources(resultingRevisionId!);
    expect(sources.map((row) => row.digest)).toEqual(second.blocks.map((block) => block.digest));
    expect(sources.map((row) => Number(row.source_paragraph_index))).toEqual(second.blocks.map((block) => block.sourceParagraphIndex));
    expect(textBoxChoices()).toEqual([{ category_key: 'text-boxes', choice: 'retain' }]);
  }, 180_000);
});

describe('the startup validation J-01 proves (Issue #584)', () => {
  it('refuses a store whose reimport proof the tamper control altered, as the validator and not as the control', async () => {
    const first = await composed({ source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 6, title: '篡改证明组稿' });
    const second = await composed({ source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 7, title: '篡改证明组稿' });
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importComposed(store, first.path);
      const staged = await store.stageSelectedManuscript(randomUUID(), second.path);
      const started = store.createManuscriptReimportPreparationWork(staged.draftId, staged.draftVersion, {
        kind: 'existing-book', bookId: book.bookId, relationship: 'reimport', lineage: { kind: 'unconfirmed' }, reuseSourceVersionId: null,
      });
      let prepared = store.advanceManuscriptReimportPreparationWork(started.workId);
      while (!prepared.done) prepared = store.advanceManuscriptReimportPreparationWork(started.workId);
      let review = prepared.review!;
      let cursor: number | null = null;
      do {
        const page = store.getReimportMappingPage(review.draftId, review.draftVersion, cursor);
        for (const item of page.items.filter((entry) => entry.verb === null)) {
          const resolution = store.createReimportResolutionWork(review.draftId, review.draftVersion, item.groupId, 'rewrite');
          let progress = store.advanceReimportResolutionWork(resolution.workId);
          while (!progress.done) progress = store.advanceReimportResolutionWork(resolution.workId);
          review = progress.review!;
        }
        cursor = page.nextCursor;
      } while (cursor !== null);
      const commit = await store.createManuscriptReimportCommitWork({
        draftId: review.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest, commitId: randomUUID(),
      });
      let result = commit.result;
      while (result === null) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        result = (await store.advanceManuscriptReimportCommitWork(commit.workId!)).result;
      }
      expect(result.resultKind).toBe('changed');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    // The control alters one mapping that has staged text, and the store is then refused by what validates it — never by
    // the control's own E2E_CONTROL_INVALID, nor by a statement that could not be prepared.
    const opened = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
      induceUnprovableReconciliation: false,
      persistLegacyReviewedDraft: false,
      induceReimportProofTamper: true,
      induceAbandonObjectRemovalFailure: false,
      interruptAfterAbandonObjectRemoval: false,
      baselineAnalysisRoute: null,
    }).then((store) => {
      store.close();
      return null;
    }, (error: unknown) => error);
    expect([opened instanceof Error ? opened.name : typeof opened, (opened as { code?: unknown } | null)?.code, opened instanceof Error ? opened.message : null])
      .toEqual(['BoundedStoreError', 'SCHEMA_INVALID', '稿件重新导入块摘要无效。']);
  }, 180_000);
});

describe('schema revision 27 over the real store', () => {
  it('migrates a revision-26 store holding a legacy eight-row review, with every fidelity row byte for byte', async () => {
    await requireExactSample1(roots.codeRoot);
    let bookId: string;
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      bookId = (await importSample1Book(store, roots.codeRoot, '修订版 27 迁移')).bookId;
      store.markCleanShutdown();
    } finally {
      store.close();
    }

    // Plant revision 26 exactly as a build before ADR 0086 left it: the review is the eight-row one the
    // frozen builder rebuilds under parser identity /1, degraded and accepted as it had to be, and
    // `import_fidelity_categories` holds revision 26's text.
    const before = plantRevision26();
    expect(before).toHaveLength(8);

    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      // The legacy review reads back under the identity it was recorded with: eight rows, degraded, accepted.
      const record = migrated.getBookOverview(bookId).records.find((item) => item.kind === 'import-record');
      expect(record?.kind === 'import-record' && record.fidelityCategories).toEqual(SAMPLE1_V1_REPORT);
      expect(record?.kind === 'import-record' && record.degradationDecision?.acceptedItems.map((item) => item.categoryKey))
        .toEqual(['inline-styles', 'sections']);
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
    withDatabase(true, (database) => {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(LATEST_SCHEMA_VERSION);
      expect(importFidelityCategoriesShape(database)).toBe('current');
      expect(database.prepare('SELECT rowid, * FROM import_fidelity_categories ORDER BY rowid').all()).toEqual(before);
      for (const relation of [...IMPORT_RETENTION_RELATIONS_DROP_ORDER, ...IMPORTED_MARK_RELATIONS_DROP_ORDER, ...EXPORT_LEDGER_RELATIONS_DROP_ORDER, ...MIGRATION_EMPTY_RELATIONS, ...REIMPORT_GROUP_RELATIONS_DROP_ORDER, ...CLARIFICATION_RELATIONS_DROP_ORDER, ...RUN_CHECKPOINT_RELATIONS_DROP_ORDER, ...DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER]) {
        expect(database.prepare(`SELECT count(*) total FROM ${relation}`).get()).toEqual({ total: 0 });
      }
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    });
  }, 180_000);

  it('names the parser change when a Book an earlier parser read takes its unchanged file again, at the choice (Issue #532)', async () => {
    await requireExactSample1(roots.codeRoot);
    let bookId: string;
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      bookId = (await importSample1Book(store, roots.codeRoot, '旧读取方式')).bookId;
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    plantRevision26();
    const sourceVersionId = withDatabase(true, (database) =>
      String((database.prepare('SELECT source_version_id FROM source_versions').get() as Row).source_version_id));
    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const refused = (operation: () => unknown): [string, string] | null => {
        try {
          operation();
        } catch (error) {
          if (error instanceof StoreError) return [error.code, error.message];
          throw error;
        }
        return null;
      };
      // The unchanged file, staged under this build's parser: the Book holds its exact Source Version, read under /1. Taken
      // again as a reimport, the choice itself says why not, before any review is prepared.
      const again = await migrated.stageSelectedManuscript(randomUUID(), sample1Path(roots.codeRoot));
      expect(refused(() => {
        const started = migrated.createManuscriptReimportPreparationWork(again.draftId, again.draftVersion, {
          kind: 'existing-book', bookId, relationship: 'reimport', lineage: { kind: 'unconfirmed' }, reuseSourceVersionId: sourceVersionId,
        });
        let progress = migrated.advanceManuscriptReimportPreparationWork(started.workId);
        while (!progress.done) progress = migrated.advanceManuscriptReimportPreparationWork(started.workId);
      })).toEqual(['SOURCE_VERSION_PARSER_CHANGED', SOURCE_VERSION_PARSER_CHANGED_MESSAGE]);
      // As source material for the Book, the same.
      const asSource = await migrated.stageSelectedManuscript(randomUUID(), sample1Path(roots.codeRoot));
      expect(refused(() => migrated.prepareSourceImportReview(asSource.draftId, asSource.draftVersion, {
        kind: 'existing-book', bookId, relationship: 'source-only', reuseSourceVersionId: sourceVersionId,
      }))).toEqual(['SOURCE_VERSION_PARSER_CHANGED', SOURCE_VERSION_PARSER_CHANGED_MESSAGE]);
      // The way on the words name: the file comes in as a new Book.
      const renewed = await importSample1Book(migrated, roots.codeRoot, '重新导入为新书');
      expect(renewed.bookId).not.toBe(bookId);
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
  }, 180_000);

  it('does not bring back ready a reimport review over a Source Version an earlier parser read, and says why when it is prepared again (Issue #580)', async () => {
    await requireExactSample1(roots.codeRoot);
    let draftId: string;
    let draftVersion: number;
    let bookId: string;
    let sourceVersionId: string;
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      bookId = (await importSample1Book(store, roots.codeRoot, '旧读取方式')).bookId;
      sourceVersionId = withDatabase(true, (database) => String((database.prepare('SELECT source_version_id FROM source_versions').get() as Row).source_version_id));
      // The unchanged file taken again as a reimport that reuses its exact Source Version: a review ready under this parser.
      const again = await store.stageSelectedManuscript(randomUUID(), sample1Path(roots.codeRoot));
      const started = store.createManuscriptReimportPreparationWork(again.draftId, again.draftVersion, {
        kind: 'existing-book', bookId, relationship: 'reimport', lineage: { kind: 'unconfirmed' }, reuseSourceVersionId: sourceVersionId,
      });
      let prepared = store.advanceManuscriptReimportPreparationWork(started.workId);
      while (!prepared.done) prepared = store.advanceManuscriptReimportPreparationWork(started.workId);
      draftId = prepared.review!.draftId;
      draftVersion = prepared.review!.draftVersion;
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    // The Source Version as an earlier parser left it. sample1 has no comments or revisions, so its /2 and /3 reports are one.
    withDatabase(false, (database) => {
      database.prepare("UPDATE source_versions SET parser_identity = 'ai7-docx-fflate-saxes/2' WHERE source_version_id = ?").run(sourceVersionId);
      database.prepare("UPDATE source_provenance SET parser_identity = 'ai7-docx-fflate-saxes/2' WHERE source_version_id = ?").run(sourceVersionId);
    });
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const continued = await reopened.continueImportDraft(draftId!, draftVersion!);
      expect(continued.state === 'target-review-required' && continued.reviewInvalidated).toBe(true);
      const staged = continued.state === 'target-review-required' ? continued.staged : null;
      const refused = ((): [string, string] | null => {
        try {
          const started = reopened.createManuscriptReimportPreparationWork(staged!.draftId, staged!.draftVersion, {
            kind: 'existing-book', bookId: bookId!, relationship: 'reimport', lineage: { kind: 'unconfirmed' }, reuseSourceVersionId: sourceVersionId!,
          });
          let progress = reopened.advanceManuscriptReimportPreparationWork(started.workId);
          while (!progress.done) progress = reopened.advanceManuscriptReimportPreparationWork(started.workId);
        } catch (error) {
          if (error instanceof StoreError) return [error.code, error.message];
          throw error;
        }
        return null;
      })();
      expect(refused).toEqual(['SOURCE_VERSION_PARSER_CHANGED', SOURCE_VERSION_PARSER_CHANGED_MESSAGE]);
      expect(SOURCE_VERSION_PARSER_CHANGED_MESSAGE.endsWith('可以把它作为新建图书导入。')).toBe(true);
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
  }, 180_000);

  it('finds a Book an earlier parser read by its content when the same content comes in another file (Issue #532)', async () => {
    await requireExactSample1(roots.codeRoot);
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      await importSample1Book(store, roots.codeRoot, '旧读取方式');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    plantRevision26();
    const [sourceVersionId, sourceDigest] = withDatabase(true, (database) => {
      const row = database.prepare('SELECT source_version_id, source_digest FROM source_versions').get() as Row;
      return [String(row.source_version_id), String(row.source_digest)];
    });
    // sample1's own parts in another container: other bytes, the same body, so the same content and structure.
    const twin = join(roots.inputRoot, 'sample1-另存.docx');
    writeFileSync(twin, zipSync(unzipSync(readFileSync(sample1Path(roots.codeRoot))), { mtime: fixedArchiveTime() }));
    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const staged = await migrated.stageSelectedManuscript(randomUUID(), twin);
      expect(staged.source.sourceSha256).not.toBe(sourceDigest);
      // Read under /1 and under this build's parser, the content and structure agree: the Book is found.
      expect(staged.identityFindings.map((finding) => [finding.sourceVersionId, finding.identityClass])).toEqual([
        [sourceVersionId, { kind: 'parsed-content-structure', label: '发现相同内容' }],
      ]);
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
  }, 180_000);
});
