import { createHash } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import type { ManuscriptBlockProjection, TextBoxDisposition } from '../shared/protocol.js';
import { MAX_FRAME_BYTES } from '../shared/protocol.js';
import { DOCX_PARSER_IDENTITY, DOCX_PARSER_IDENTITY_V1, DOCX_PARSER_IDENTITY_V2,
  WORD_DOCX_PARSER_IDENTITY, type ParsedTextBox, type ParsedDocx, type ParsedDocxBlock,
  type NativeDocxIntakeParse, type WordTrackedCompilation } from './docx.js';
import type { ParsedImportedMark } from './docx-marks.js';
import { LOCAL_LEARNING_POLICY_BASIS } from './learning-eligibility.js';
import { canonicalJson as wordCanonicalJson, sha256Hex, DIGEST_PATTERN, UUID_PATTERN, hasExactKeys, isRecord } from './analysis/canonical.js';

/** Frozen local contracts for Issue #1132; the existing open, intake and IPC owners activate them. */
export const WORD_INTAKE_PROFILE = 'ai7.word-tracked-intake-profile/1' as const;
export const WORD_SOURCE_SCHEMA = 'ai7.word-revision-source/1' as const;
export const WORD_EXTRACTOR_IDENTITY = 'ai7-word-tracked-extractor/1' as const;
export type WordReadingKind = 'rejected' | 'accepted';
export type WordImportMode = 'suggestions' | 'accepted-baseline';
export type WordOperationKind = 'insert' | 'delete' | 'replace' | 'move' | 'paragraph-boundary';
export type WordEventKind = 'ins' | 'del' | 'moveFrom' | 'moveTo' |
  'moveFromRangeStart' | 'moveFromRangeEnd' | 'moveToRangeStart' | 'moveToRangeEnd' |
  'commentRangeStart' | 'commentRangeEnd' | 'commentReference';

export interface WordSourceLocation {
  part: string;
  paragraphIndex: number;
  atomOrdinal: number;
  codeUnitOffset: number;
}

/** Exact decoded-atom slices; a paragraph boundary is a typed token, never original-text whitespace. */
export type WordSourceFragment =
  | { kind: 'text'; part: string; paragraphIndex: number; atomOrdinal: number;
      fromCodeUnit: number; toCodeUnit: number; codeUnits: number; sha256: string }
  | { kind: 'paragraph-boundary'; part: string; paragraphIndex: number; atomOrdinal: number; sha256: string };

export interface WordSourceEvent {
  eventId: string;
  part: string;
  elementOrdinal: number;
  kind: WordEventKind;
  context: 'run' | 'paragraph-boundary' | 'range' | 'comment';
  rawId: string | null;
  rawAuthor: string | null;
  rawDate: string | null;
  rangeName: string | null;
  parentEventIds: string[];
  location: WordSourceLocation;
  container: string;
  linkedEventIds: string[];
  disposition: 'visible-transition' | 'no-visible-transition' | 'range' | 'comment';
}

export interface WordSourceAtom {
  kind: 'text' | 'paragraph-boundary';
  part: string;
  paragraphIndex: number;
  atomOrdinal: number;
  elementOrdinal: number;
  codeUnits: number;
  sha256: string;
  eventMembership: string[];
  rejected: boolean;
  accepted: boolean;
  /** A retained non-text payload separates mechanically adjacent hunks. */
  hunkBoundaryBefore: boolean;
}

export interface WordSourceParagraph {
  part: string;
  paragraphIndex: number;
  container: string;
  sourcePart: 'body' | 'text-box';
  boxOrdinal: number | null;
  anchorParagraphIndex: number | null;
  kind: 'title' | 'heading' | 'paragraph';
  level: number | null;
  atomOrdinals: number[];
  boundaryAtomOrdinal: number;
  nonTextBoundary: boolean;
  sectionBoundary: boolean;
}

export interface WordSourceComment {
  rawId: string;
  rawAuthor: string | null;
  rawDate: string | null;
  bodyCodeUnits: number;
  bodySha256: string;
  parentId: string | null;
  resolved: boolean;
  markerEventIds: string[];
}

export interface WordRevisionGraph {
  schema: typeof WORD_SOURCE_SCHEMA;
  sourceDigest: string;
  parserIdentity: string;
  extractorIdentity: typeof WORD_EXTRACTOR_IDENTITY;
  profile: typeof WORD_INTAKE_PROFILE;
  events: WordSourceEvent[];
  atoms: WordSourceAtom[];
  paragraphs: WordSourceParagraph[];
  comments: WordSourceComment[];
}

export interface WordSampleTemplate {
  templateKey: string;
  operationKind: WordOperationKind;
  eventMembership: string[];
  before: WordSourceFragment[];
  after: WordSourceFragment[];
  sourceLocation: WordSourceLocation | null;
  destinationLocation: WordSourceLocation | null;
}

export interface WordTrackedEditSample extends Omit<WordSampleTemplate, 'templateKey'> {
  sampleId: string;
  bookId: string;
  sourceDigest: string;
  extractorIdentity: typeof WORD_EXTRACTOR_IDENTITY;
  graphDigest: string;
}

/** A whole normalization group, including every atom participating in NFC or whitespace contraction. */
export interface WordNormalizationGroup {
  ordinal: number;
  fragments: WordSourceFragment[];
  fromGrapheme: number;
  toGrapheme: number;
  normalizedText: string;
}

export interface WordReadingBlock {
  blockId: string;
  position: number;
  kind: 'title' | 'heading' | 'paragraph';
  level: number | null;
  text: string;
  digest: string;
  graphemeLength: number;
  sourceParagraphIndices: number[];
  groups: WordNormalizationGroup[];
}

export interface WordSourceSegment {
  blockId: string;
  segmentOrdinal: number;
  groupOrdinal: number;
  fragment: WordSourceFragment;
  fromGrapheme: number;
  toGrapheme: number;
  normalizedSha256: string;
}

export interface WordBlockBinding {
  sourceBlockId: string;
  blockId: string;
}

/** Bind compiler locations to actual Book-owned block identities, without changing source-reading identity. */
export function bindWordReadingBlocks(reading: WordCompiledReading, bindings: ReadonlyArray<WordBlockBinding>): {
  blocks: WordReadingBlock[]; segments: WordSourceSegment[]; mappingDigest: string;
} {
  requireRetention(reading.usable && bindings.length === reading.blocks.length &&
    new Set(bindings.map((binding) => binding.blockId)).size === bindings.length &&
    bindings.every((binding, index) => isRecord(binding) && hasExactKeys(binding, ['sourceBlockId', 'blockId']) &&
      binding.sourceBlockId === reading.blocks[index]!.blockId && /^blk_[0-9a-f]{24}$/u.test(binding.blockId)),
  'WORD_MAPPING_INVALID', 'Word 来源块与实际稿件块的对应不完整。');
  const ids = new Map(bindings.map((binding) => [binding.sourceBlockId, binding.blockId]));
  const blocks = reading.blocks.map((block) => ({ ...block, blockId: ids.get(block.blockId)! }));
  const segments = reading.segments.map((segment) => {
    const blockId = ids.get(segment.blockId);
    requireRetention(blockId !== undefined, 'WORD_MAPPING_INVALID', 'Word 来源片段没有实际稿件块。');
    return { ...segment, blockId };
  });
  return { blocks, segments, mappingDigest: sha256Hex(wordCanonicalJson(segments)) };
}

/** The persisted baseline, rather than an invented legacy row, determines every Book-owned block identity. */
export function bindWordReadingToRevision(db: DatabaseSync, bookId: string, revisionId: string, sourceVersionId: string,
  reading: WordCompiledReading): ReturnType<typeof bindWordReadingBlocks> & { blockBindings: WordBlockBinding[] } {
  requireRetention([bookId, revisionId, sourceVersionId].every((id) => UUID_PATTERN.test(id)), 'WORD_MAPPING_INVALID', 'Word 稿件对应标识无效。');
  const revision = db.prepare(`SELECT mr.manuscript_id FROM manuscript_revisions mr
    JOIN manuscripts m ON m.manuscript_id = mr.manuscript_id
    JOIN source_versions sv ON sv.source_version_id = mr.source_version_id AND sv.book_id = m.book_id
    WHERE mr.revision_id = ? AND m.book_id = ? AND sv.source_version_id = ?`).get(revisionId, bookId, sourceVersionId);
  requireRetention(revision !== undefined, 'WORD_MAPPING_INVALID', 'Word 稿件修订版不属于所选图书或来源。');
  const rows = db.prepare(`SELECT v.*, b.manuscript_id block_manuscript_id FROM manuscript_block_versions v
    LEFT JOIN manuscript_blocks b ON b.block_id = v.block_id WHERE v.revision_id = ? ORDER BY v.position`).all(revisionId);
  requireRetention(rows.length === reading.blocks.length && rows.every((row, index) => {
    const block = reading.blocks[index]!;
    return row.block_manuscript_id === revision.manuscript_id && row.position === block.position && row.kind === block.kind && row.level === block.level &&
      row.text === block.text && row.digest === block.digest && row.grapheme_length === block.graphemeLength;
  }), 'WORD_MAPPING_INVALID', 'Word 实际稿件基线与明确选择的完整阅读不一致。');
  const blockBindings = rows.map((row, index) => ({ sourceBlockId: reading.blocks[index]!.blockId, blockId: text(row.block_id) }));
  return { blockBindings, ...bindWordReadingBlocks(reading, blockBindings) };
}

/** Exact source-linked rows for one Word import; missing, reordered or foreign rows never become legacy mapping. */
export function requireWordManuscriptSourceSegments(db: DatabaseSync, bookId: string, choice: WordImportChoiceRecord, reading: WordCompiledReading):
  ReturnType<typeof bindWordReadingToRevision> {
  validateWordImportChoiceRecord(choice);
  const selected = choice.mode === 'suggestions' ? 'rejected' : 'accepted';
  requireRetention(reading.reading === selected && reading.readingDigest === choice.readings[selected].digest,
    'WORD_MAPPING_INVALID', 'Word 稿件对应使用了另一条阅读。');
  const bound = bindWordReadingToRevision(db, bookId, choice.revisionId, choice.sourceVersionId, reading);
  requireRetention(db.prepare('SELECT 1 FROM manuscript_block_sources WHERE revision_id = ? LIMIT 1').get(choice.revisionId) === undefined,
    'WORD_MAPPING_INVALID', 'Word 片段对应不能同时冒充历史段落对应。');
  requireRetention(bound.mappingDigest === choice.mappingDigest, 'WORD_MAPPING_INVALID', 'Word 实际稿件对应摘要与导入选择不一致。');
  const parent = readWordParentSourcePin(db, bookId, choice.sourceVersionId);
  requireRetention(parent.sourceDigest === choice.originalDigest && wordParentSourcePinRecord(parent).digest === choice.parentSourcePinDigest,
    'WORD_MAPPING_INVALID', 'Word 稿件对应的原始来源固定记录已经变化。');
  const imported = db.prepare(`SELECT wi.*, ws.book_id source_book_id, ws.graph_digest, ws.parent_source_pin_digest
    FROM word_revision_imports wi JOIN word_revision_sources ws ON ws.source_version_id = wi.source_version_id WHERE wi.commit_id = ?`).get(choice.commitId);
  const choiceJson = wordCanonicalJson(choice);
  requireRetention(imported && imported.book_id === bookId && imported.source_book_id === bookId && imported.source_version_id === choice.sourceVersionId &&
    imported.revision_id === choice.revisionId && imported.fidelity_review_id === choice.fidelityReviewId && imported.mode === choice.mode &&
    imported.graph_digest === choice.graphDigest && imported.parent_source_pin_digest === choice.parentSourcePinDigest &&
    imported.canonical_json === choiceJson && imported.sha256 === sha256Hex(choiceJson),
  'WORD_MAPPING_INVALID', 'Word 稿件对应与已提交的来源或选择不一致。');
  const rows = db.prepare(`SELECT s.* FROM word_manuscript_source_segments s
    LEFT JOIN manuscript_block_versions v ON v.revision_id = s.revision_id AND v.block_id = s.block_id
    WHERE s.revision_id = ? ORDER BY v.position, s.segment_ordinal`).all(choice.revisionId);
  requireRetention(rows.length === bound.segments.length && rows.every((row, index) => {
    const segment = bound.segments[index]!;
    const json = wordCanonicalJson(segment);
    return row.block_id === segment.blockId && row.segment_ordinal === segment.segmentOrdinal &&
      row.source_version_id === choice.sourceVersionId && row.commit_id === choice.commitId && row.canonical_json === json && row.sha256 === sha256Hex(json);
  }), 'WORD_MAPPING_INVALID', 'Word 有序来源片段不完整或已经变化。');
  return bound;
}

/** Parent commit/choice rows already exist inside the same import transaction. */
export function retainWordManuscriptSourceSegments(db: DatabaseSync, bookId: string, choice: WordImportChoiceRecord,
  reading: WordCompiledReading, signal?: AbortSignal): ReturnType<typeof bindWordReadingToRevision> {
  signal?.throwIfAborted();
  requireRetention(db.isTransaction, 'WORD_MAPPING_INVALID', 'Word 来源对应必须与稿件原子提交。');
  const bound = bindWordReadingToRevision(db, bookId, choice.revisionId, choice.sourceVersionId, reading);
  requireRetention(bound.mappingDigest === choice.mappingDigest && reading.reading === (choice.mode === 'suggestions' ? 'rejected' : 'accepted') &&
    reading.readingDigest === choice.readings[reading.reading].digest, 'WORD_MAPPING_INVALID', 'Word 来源对应与所选阅读不一致。');
  if (db.prepare('SELECT 1 FROM word_manuscript_source_segments WHERE revision_id = ? LIMIT 1').get(choice.revisionId) === undefined) {
    const insert = db.prepare(`INSERT INTO word_manuscript_source_segments(revision_id, block_id, segment_ordinal, source_version_id,
      commit_id, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const segment of bound.segments) {
      signal?.throwIfAborted();
      const json = wordCanonicalJson(segment);
      insert.run(choice.revisionId, segment.blockId, segment.segmentOrdinal, choice.sourceVersionId, choice.commitId, json, sha256Hex(json));
    }
  }
  return requireWordManuscriptSourceSegments(db, bookId, choice, reading);
}

export interface WordCompiledReading {
  reading: WordReadingKind;
  textBoxes: 'retain' | 'merge';
  usable: boolean;
  blocks: WordReadingBlock[];
  segments: WordSourceSegment[];
  contentDigest: string;
  structureDigest: string;
  mappingDigest: string;
  readingDigest: string;
  characterCount: number;
  commentMarks: WordSourceMark[];
  marks: WordSourceMark[];
  refusals: WordIncompatibility[];
}

export interface WordSourceMark {
  mark: ParsedImportedMark;
  eventMembership: string[];
  templateKey: string | null;
  commentId: string | null;
  fragments: WordSourceFragment[];
}

export interface WordImportMarkSource {
  schema: 'ai7.word-import-mark-source/1';
  markId: string;
  sourceOrdinal: number;
  sourceVersionId: string;
  sourceDigest: string;
  graphDigest: string;
  importCommitId: string;
  importChoiceDigest: string;
  plannedMarkDigest: string;
  locator: { kind: 'revision'; templateKey: string } | { kind: 'comment'; commentId: string };
  eventMembership: string[];
  fragments: WordSourceFragment[];
}

/** Source evidence survives learning opt-out and later edits to the ordinary Editorial Mark. */
export function wordImportMarkSourceRecord(choice: WordImportChoiceRecord, source: WordSourceMark, markId: string): {
  value: WordImportMarkSource; json: string; digest: string;
} {
  const choiceDigest = wordImportChoiceDigest(choice);
  requireRetention(UUID_PATTERN.test(markId) && Number.isSafeInteger(source.mark.ordinal) && source.mark.ordinal > 0 &&
    source.eventMembership.length > 0 && source.eventMembership.every((id) => DIGEST_PATTERN.test(id)) && source.fragments.length > 0 &&
    (source.templateKey !== null && DIGEST_PATTERN.test(source.templateKey) && source.commentId === null ||
      source.templateKey === null && source.commentId !== null && source.mark.origin === 'comment'),
  'WORD_MARK_SOURCE_INVALID', 'Word 标记缺少明确的原始操作或批注定位。');
  const locator: WordImportMarkSource['locator'] = source.templateKey !== null
    ? { kind: 'revision', templateKey: source.templateKey }
    : { kind: 'comment', commentId: source.commentId! };
  const value: WordImportMarkSource = { schema: 'ai7.word-import-mark-source/1', markId, sourceOrdinal: source.mark.ordinal,
    sourceVersionId: choice.sourceVersionId, sourceDigest: choice.originalDigest, graphDigest: choice.graphDigest,
    importCommitId: choice.commitId, importChoiceDigest: choiceDigest, plannedMarkDigest: sha256Hex(wordCanonicalJson(source.mark)),
    locator, eventMembership: source.eventMembership, fragments: source.fragments };
  const json = wordCanonicalJson(value);
  return { value, json, digest: sha256Hex(json) };
}

export type WordIncompatibilityCode = 'table-revision' | 'custom-xml-or-math-revision' |
  'story-or-text-box-revision' | 'incompatible-paragraph-join' | 'invalid-move-graph' |
  'unrepresentable-comment' | 'unusable-reading' | 'resource-limit';

export interface WordIncompatibility {
  code: WordIncompatibilityCode;
  part: string;
  elementOrdinal: number;
  paragraphIndex: number | null;
}

export interface WordIntakeInventory {
  schema: 'ai7.word-revision-inventory/1';
  sourceDigest: string;
  profile: typeof WORD_INTAKE_PROFILE;
  activating: boolean;
  eventCount: number;
  storyParts: string[];
  locations: WordIncompatibility[];
}

export type WordLegacyStagedBlock = ParsedDocxBlock & { stagedBlockId: string; startOffset: number };
type WordStagedReadingPin = { digest: string; blockCount: number; characterCount: number; usable: boolean; refusals: WordIncompatibility[] };
export type WordStagedIntake = {
  schema: 'ai7.word-staged-intake/1';
  draftId: string;
  sourceDigest: string;
  sourceBytes: number;
  compilerIdentity: typeof WORD_DOCX_PARSER_IDENTITY;
  inventory: WordIntakeInventory;
  inventoryDigest: string;
} & (
  | { compatibility: 'unsupported'; previewReading: null }
  | { compatibility: 'ready'; previewReading: WordReadingKind; graph: WordRevisionGraph; graphDigest: string;
      readings: Record<WordReadingKind, WordStagedReadingPin>; templates: WordSampleTemplate[]; templateManifestDigest: string;
      legacy: { kind: 'ready'; parsed: ParsedDocx; blocks: WordLegacyStagedBlock[] } |
        { kind: 'unavailable'; code: 'DOCX_REJECTED'; reason: string } }
);

/** Durable staging records the honest preview and the separate actual historical-reader capability. */
export function wordStagedIntakeRecord(draftId: string, result: NativeDocxIntakeParse): {
  value: WordStagedIntake; json: string; digest: string;
} | null {
  requireRetention(UUID_PATTERN.test(draftId), 'WORD_STAGING_INVALID', 'Word 导入草稿标识无效。');
  const compiled = result.word;
  if (compiled === null) return null;
  requireRetention(compiled.sourceDigest === result.parsed.sourceDigest && compiled.archiveBytes === result.parsed.archiveBytes &&
    compiled.inventory.sourceDigest === compiled.sourceDigest && compiled.inventory.schema === 'ai7.word-revision-inventory/1' &&
    compiled.inventory.profile === WORD_INTAKE_PROFILE && compiled.inventory.activating &&
    sha256Hex(wordCanonicalJson(compiled.inventory)) === compiled.inventoryDigest,
  'WORD_STAGING_INVALID', 'Word 兼容性清单与原始文件不一致。');
  const common = { schema: 'ai7.word-staged-intake/1' as const, draftId, sourceDigest: compiled.sourceDigest, sourceBytes: compiled.archiveBytes,
    compilerIdentity: WORD_DOCX_PARSER_IDENTITY, inventory: compiled.inventory, inventoryDigest: compiled.inventoryDigest };
  let value: WordStagedIntake;
  if (result.kind === 'legacy') value = { ...common, compatibility: 'unsupported', previewReading: null };
  else {
    const word = result.word;
    const preview = word.readings[word.previewReading];
    requireRetention(word.previewReading === (word.readings.rejected.usable ? 'rejected' : 'accepted') && preview.usable && preview.blocks.length > 0 &&
      result.parsed.blockCount === preview.blocks.length && result.parsed.characterCount === preview.characterCount &&
      result.parsed.contentDigest === preview.contentDigest && result.parsed.structureDigest === preview.structureDigest &&
      word.graph.schema === WORD_SOURCE_SCHEMA && word.graph.sourceDigest === word.sourceDigest && word.graph.parserIdentity === WORD_DOCX_PARSER_IDENTITY &&
      word.graph.extractorIdentity === WORD_EXTRACTOR_IDENTITY && sha256Hex(wordCanonicalJson(word.graph)) === word.graphDigest &&
      sha256Hex(wordCanonicalJson({ schema: 'ai7.word-sample-template-manifest/1', sourceDigest: word.sourceDigest,
        extractorIdentity: WORD_EXTRACTOR_IDENTITY, templates: word.templates })) === word.templateManifestDigest,
    'WORD_STAGING_INVALID', 'Word 暂存预览没有对应完整可用的阅读。');
    const pin = (reading: WordCompiledReading): WordStagedReadingPin => ({ digest: reading.readingDigest, blockCount: reading.blocks.length,
      characterCount: reading.characterCount, usable: reading.usable, refusals: reading.refusals });
    let legacy: Extract<WordStagedIntake, { compatibility: 'ready' }>['legacy'];
    if (result.legacy.kind === 'unavailable') legacy = result.legacy;
    else {
      let startOffset = 0;
      const blocks = result.legacy.blocks.map((block) => {
        const stagedBlockId = `blk_${sha256Hex(`${draftId}\u0000${block.position}\u0000${block.digest}`).slice(0, 24)}`;
        const staged = { ...block, stagedBlockId, startOffset };
        startOffset += block.graphemeLength;
        return staged;
      });
      requireRetention(result.legacy.parsed.sourceDigest === word.sourceDigest && result.legacy.parsed.archiveBytes === word.archiveBytes &&
        blocks.length === result.legacy.parsed.blockCount && startOffset === result.legacy.parsed.characterCount,
      'WORD_STAGING_INVALID', 'Word 历史读法暂存不完整。');
      legacy = { kind: 'ready', parsed: result.legacy.parsed, blocks };
    }
    value = { ...common, compatibility: 'ready', previewReading: word.previewReading, graph: word.graph, graphDigest: word.graphDigest,
      readings: { rejected: pin(word.readings.rejected), accepted: pin(word.readings.accepted) }, templates: word.templates,
      templateManifestDigest: word.templateManifestDigest, legacy };
  }
  const json = wordCanonicalJson(value);
  return { value, json, digest: sha256Hex(json) };
}

/** Recompile from verified original bytes before this comparison; JSON equality alone is not source proof. */
export function requireWordStagedIntake(db: DatabaseSync, draftId: string, result: NativeDocxIntakeParse): WordStagedIntake | null {
  const expected = wordStagedIntakeRecord(draftId, result);
  const row = db.prepare('SELECT * FROM staged_word_revision_intakes WHERE draft_id = ?').get(draftId);
  if (expected === null) {
    requireRetention(row === undefined, 'WORD_STAGING_INVALID', '普通文件不应携带 Word 修订暂存记录。');
    return null;
  }
  requireRetention(row !== undefined && row.source_digest === expected.value.sourceDigest && row.compiler_identity === expected.value.compilerIdentity &&
    row.inventory_digest === expected.value.inventoryDigest && row.compatibility === expected.value.compatibility && row.preview_reading === expected.value.previewReading &&
    row.canonical_json === expected.json && row.sha256 === expected.digest,
  'WORD_STAGING_INVALID', 'Word 暂存的原始清单、预览或历史读法已经变化。');
  return expected.value;
}

/** For promotion after its positive-count snapshot is present, inside the same transaction. */
export function stageWordRevisionIntake(db: DatabaseSync, draftId: string, result: NativeDocxIntakeParse): WordStagedIntake | null {
  requireRetention(db.isTransaction, 'WORD_STAGING_INVALID', 'Word 暂存必须原子提交。');
  const record = wordStagedIntakeRecord(draftId, result);
  if (record === null) return requireWordStagedIntake(db, draftId, result);
  const parent = db.prepare(`SELECT s.*, d.object_digest, co.byte_length FROM staged_import_snapshots s
    JOIN import_drafts d ON d.draft_id = s.draft_id JOIN content_objects co ON co.object_digest = d.object_digest WHERE s.draft_id = ?`).get(draftId);
  requireRetention(parent && parent.parser_identity === result.parsed.parserIdentity && parent.source_digest === record.value.sourceDigest &&
    parent.object_digest === record.value.sourceDigest && parent.byte_length === record.value.sourceBytes &&
    parent.content_digest === result.parsed.contentDigest && parent.structure_digest === result.parsed.structureDigest &&
    parent.block_count === result.parsed.blockCount && parent.character_count === result.parsed.characterCount && result.parsed.blockCount > 0 &&
    parent.fidelity_json === wordCanonicalJson(result.parsed.fidelity) && parent.title_suggestion === result.parsed.titleSuggestion.value &&
    parent.title_source === result.parsed.titleSuggestion.sourceLabel,
  'WORD_STAGING_INVALID', 'Word 暂存与实际正计数快照不一致。');
  if (db.prepare('SELECT draft_id FROM staged_word_revision_intakes WHERE draft_id = ?').get(draftId) === undefined) {
    db.prepare(`INSERT INTO staged_word_revision_intakes(draft_id, source_digest, compiler_identity, inventory_digest, compatibility,
      preview_reading, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(draftId, record.value.sourceDigest,
      record.value.compilerIdentity, record.value.inventoryDigest, record.value.compatibility, record.value.previewReading, record.json, record.digest);
  }
  return requireWordStagedIntake(db, draftId, result);
}

export interface WordTrackedChoiceInput {
  mode: WordImportMode;
  learnFromEdits: boolean;
  acceptedBaselineConfirmed: boolean;
}

/** References historical control facts; this module neither selects controls nor overrides current exclusions. */
export type WordControlReference = { kind: 'entry'; entryId: string; sha256: string } |
  { kind: 'default'; basis: typeof LOCAL_LEARNING_POLICY_BASIS };
export interface WordMaterialStandingSnapshot {
  choice: 'book' | 'house' | 'excluded' | 'deferred';
  decisionId: string | null;
  decisionDigest: string | null;
  basisVersion: number;
}
export interface WordImportControlsSnapshot {
  global: { enabled: boolean; reference: WordControlReference };
  book: { excluded: boolean; reference: WordControlReference };
  materials: Array<{ templateKey: string; materialDigest: string; standing: WordMaterialStandingSnapshot }>;
}

/** Review has no new Book identity yet; only an existing Book can have material-specific standing. */
export interface WordPreparedIntake {
  schema: 'ai7.word-import-preparation/1';
  draftId: string;
  draftVersion: number;
  choice: WordTrackedChoiceInput;
  originalDigest: string;
  sourceBytes: number;
  inventoryDigest: string;
  graphDigest: string;
  extractorIdentity: typeof WORD_EXTRACTOR_IDENTITY;
  readings: Record<WordReadingKind, { digest: string; blockCount: number; usable: boolean }>;
  mappingDigest: string;
  templateManifestDigest: string;
  textBoxDisposition: TextBoxDisposition;
  target:
    | { kind: 'new-book'; controls: Pick<WordImportControlsSnapshot, 'global' | 'book'> }
    | { kind: 'existing-book'; bookId: string; controls: WordImportControlsSnapshot; parentSourcePin: WordParentSourcePin | null };
}

const WORD_PREPARATION_KEYS = ['schema', 'draftId', 'draftVersion', 'choice', 'originalDigest', 'sourceBytes', 'inventoryDigest',
  'graphDigest', 'extractorIdentity', 'readings', 'mappingDigest', 'templateManifestDigest', 'textBoxDisposition', 'target'] as const;

/** Only the explicit visible choice is projected before the full preparation is freshly reconstructed. */
export function wordPreparedSelection(db: DatabaseSync, draftId: string): { choice: WordTrackedChoiceInput; textBoxDisposition: TextBoxDisposition } | null {
  const row = db.prepare('SELECT reviewed_json, reviewed_sha256 FROM staged_word_revision_intakes WHERE draft_id = ?').get(draftId);
  if (row === undefined || row.reviewed_json === null && row.reviewed_sha256 === null) return null;
  requireRetention(typeof row.reviewed_json === 'string' && sha256Hex(row.reviewed_json) === row.reviewed_sha256,
    'WORD_PREPARATION_INVALID', 'Word 导入准备记录摘要无效。');
  let value: unknown;
  try { value = JSON.parse(row.reviewed_json); } catch { throw new ImportRetentionError('WORD_PREPARATION_INVALID', 'Word 导入准备无法读取。'); }
  requireRetention(isRecord(value) && hasExactKeys(value, WORD_PREPARATION_KEYS) && value.schema === 'ai7.word-import-preparation/1' &&
    value.draftId === draftId && wordCanonicalJson(value) === row.reviewed_json &&
    (value.textBoxDisposition === 'retain' || value.textBoxDisposition === 'merge'),
  'WORD_PREPARATION_INVALID', 'Word 导入准备身份或规范记录无效。');
  return { choice: validateWordChoice(value.choice), textBoxDisposition: value.textBoxDisposition };
}

export function wordPreparedChoice(db: DatabaseSync, draftId: string): WordTrackedChoiceInput | null {
  return wordPreparedSelection(db, draftId)?.choice ?? null;
}

export function recordWordPreparedIntake(db: DatabaseSync, prepared: WordPreparedIntake): void {
  requireRetention(db.isTransaction && isRecord(prepared) && hasExactKeys(prepared, WORD_PREPARATION_KEYS), 'WORD_PREPARATION_INVALID', 'Word 导入准备必须原子保存。');
  validateWordChoice(prepared.choice);
  const json = wordCanonicalJson(prepared);
  requireRetention(db.prepare(`UPDATE staged_word_revision_intakes SET reviewed_json = ?, reviewed_sha256 = ?
    WHERE draft_id = ? AND compatibility = 'ready'`).run(json, sha256Hex(json), prepared.draftId).changes === 1,
  'WORD_PREPARATION_INVALID', 'Word 导入准备缺少相应的原始暂存。');
}

/** Reconstructed source/selection/control/map pins, never payload equality alone, prove a restarted preparation. */
export function requireWordPreparedIntake(db: DatabaseSync, prepared: WordPreparedIntake): void {
  wordPreparedChoice(db, prepared.draftId);
  const row = db.prepare('SELECT reviewed_json, reviewed_sha256 FROM staged_word_revision_intakes WHERE draft_id = ?').get(prepared.draftId);
  const json = wordCanonicalJson(prepared);
  requireRetention(row && row.reviewed_json === json && row.reviewed_sha256 === sha256Hex(json),
    'WORD_PREPARATION_INVALID', 'Word 导入准备的来源、选择、对应或学习设置已经变化，请重新审阅。');
}

/** The immutable original is independent of every reading derived by the Word compiler. */
export interface WordParentSourcePin {
  schema: 'ai7.word-parent-source-pin/1';
  sourceVersionId: string;
  bookId: string;
  objectDigest: string;
  sourceDigest: string;
  sourceBytes: number;
  format: 'DOCX';
  parserIdentity: string;
  contentDigest: string;
  structureDigest: string;
  workingObjectDigest: null;
  converterIdentity: null;
  displayName: string;
  createdAt: string;
}

/**
 * Freeze the existing row and object identity without reparsing it under a different parser. The
 * caller must first validate historical records through their own reader and verify original bytes.
 */
export function readWordParentSourcePin(db: DatabaseSync, bookId: string, sourceVersionId: string): WordParentSourcePin {
  requireRetention(UUID_PATTERN.test(bookId) && UUID_PATTERN.test(sourceVersionId), 'WORD_SOURCE_INVALID', 'Word 原始来源标识无效。');
  const rows = db.prepare(`SELECT sv.*, co.byte_length FROM source_versions sv
    JOIN content_objects co ON co.object_digest = sv.object_digest
    WHERE sv.source_version_id = ? AND sv.book_id = ?`).all(sourceVersionId, bookId);
  requireRetention(rows.length === 1, 'WORD_SOURCE_INVALID', 'Word 原始来源或留存对象不完整。');
  const row = rows[0]!;
  requireRetention(row.format === 'DOCX' && row.working_object_digest === null && row.converter_identity === null,
    'WORD_SOURCE_INVALID', 'Word 原始来源不是未转换的 DOCX。');
  const pin: WordParentSourcePin = { schema: 'ai7.word-parent-source-pin/1', sourceVersionId, bookId,
    objectDigest: text(row.object_digest), sourceDigest: text(row.source_digest), sourceBytes: integer(row.byte_length),
    format: 'DOCX', parserIdentity: text(row.parser_identity), contentDigest: text(row.content_digest),
    structureDigest: text(row.structure_digest), workingObjectDigest: null, converterIdentity: null,
    displayName: text(row.display_name), createdAt: text(row.created_at) };
  wordParentSourcePinRecord(pin);
  const matches = db.prepare('SELECT source_version_id FROM source_versions WHERE book_id = ? AND source_digest = ?')
    .all(bookId, pin.sourceDigest);
  requireRetention(matches.length === 1 && matches[0]!.source_version_id === sourceVersionId,
    'WORD_SOURCE_INVALID', 'Word 原始来源身份不唯一。');
  return pin;
}

export function wordParentSourcePinRecord(pin: WordParentSourcePin): { json: string; digest: string } {
  requireRetention(isRecord(pin) && hasExactKeys(pin, ['schema', 'sourceVersionId', 'bookId', 'objectDigest', 'sourceDigest', 'sourceBytes', 'format',
    'parserIdentity', 'contentDigest', 'structureDigest', 'workingObjectDigest', 'converterIdentity', 'displayName', 'createdAt']) &&
    pin.schema === 'ai7.word-parent-source-pin/1' && UUID_PATTERN.test(pin.sourceVersionId) && UUID_PATTERN.test(pin.bookId) &&
    [pin.objectDigest, pin.sourceDigest, pin.contentDigest, pin.structureDigest].every((digest) => DIGEST_PATTERN.test(digest)) &&
    pin.objectDigest === pin.sourceDigest && pin.format === 'DOCX' && Number.isSafeInteger(pin.sourceBytes) && pin.sourceBytes > 0 &&
    [DOCX_PARSER_IDENTITY_V1, DOCX_PARSER_IDENTITY_V2, DOCX_PARSER_IDENTITY, WORD_DOCX_PARSER_IDENTITY].some((identity) => identity === pin.parserIdentity) &&
    pin.workingObjectDigest === null && pin.converterIdentity === null && pin.displayName.length > 0 && pin.displayName.isWellFormed() &&
    Number.isFinite(Date.parse(pin.createdAt)), 'WORD_SOURCE_INVALID', 'Word 原始来源固定记录无效。');
  const json = wordCanonicalJson(pin);
  return { json, digest: sha256Hex(json) };
}

/** Pin equality never substitutes the successor compiler for the historical parent parser. */
export function requireWordParentSourcePin(db: DatabaseSync, pin: WordParentSourcePin): { json: string; digest: string } {
  const expected = wordParentSourcePinRecord(pin);
  const actual = wordParentSourcePinRecord(readWordParentSourcePin(db, pin.bookId, pin.sourceVersionId));
  requireRetention(actual.json === expected.json, 'WORD_SOURCE_CHANGED', 'Word 原始来源在确认后已变化，请重新审阅。');
  return expected;
}

/** Compare retained evidence with a fresh compilation of its verified original; never trust graph JSON alone. */
export function requireWordRevisionSource(db: DatabaseSync, parent: WordParentSourcePin, graph: WordRevisionGraph): {
  parentSourcePinDigest: string; graphDigest: string;
} {
  const pin = requireWordParentSourcePin(db, parent);
  const graphJson = wordCanonicalJson(graph);
  const graphDigest = sha256Hex(graphJson);
  requireRetention(graph.schema === WORD_SOURCE_SCHEMA && graph.profile === WORD_INTAKE_PROFILE &&
    graph.sourceDigest === parent.sourceDigest && graph.parserIdentity === WORD_DOCX_PARSER_IDENTITY &&
    graph.extractorIdentity === WORD_EXTRACTOR_IDENTITY, 'WORD_SOURCE_INVALID', 'Word 衍生图与原始来源不一致。');
  const row = db.prepare('SELECT * FROM word_revision_sources WHERE source_version_id = ?').get(parent.sourceVersionId);
  requireRetention(row !== undefined && row.book_id === parent.bookId && row.object_digest === parent.objectDigest &&
    row.parent_parser_identity === parent.parserIdentity && row.parent_source_pin_json === pin.json && row.parent_source_pin_digest === pin.digest &&
    row.compiler_identity === graph.parserIdentity && row.extractor_identity === graph.extractorIdentity &&
    row.graph_json === graphJson && row.graph_digest === graphDigest,
  'WORD_SOURCE_INVALID', 'Word 衍生来源的原始固定记录或编译图不一致。');
  return { parentSourcePinDigest: pin.digest, graphDigest };
}

/** Called inside the import transaction, after historical-reader and original-byte validation. */
export function retainWordRevisionSource(db: DatabaseSync, parent: WordParentSourcePin, graph: WordRevisionGraph): {
  parentSourcePinDigest: string; graphDigest: string;
} {
  requireRetention(db.isTransaction, 'WORD_SOURCE_INVALID', 'Word 来源必须与导入一并提交。');
  const pin = requireWordParentSourcePin(db, parent);
  requireRetention(graph.schema === WORD_SOURCE_SCHEMA && graph.profile === WORD_INTAKE_PROFILE &&
    graph.sourceDigest === parent.sourceDigest && graph.parserIdentity === WORD_DOCX_PARSER_IDENTITY &&
    graph.extractorIdentity === WORD_EXTRACTOR_IDENTITY, 'WORD_SOURCE_INVALID', 'Word 衍生图与原始来源不一致。');
  const existing = db.prepare('SELECT source_version_id FROM word_revision_sources WHERE source_version_id = ?').get(parent.sourceVersionId);
  if (existing === undefined) {
    const graphJson = wordCanonicalJson(graph);
    db.prepare(`INSERT INTO word_revision_sources(source_version_id, book_id, object_digest,
      parent_parser_identity, parent_source_pin_json, parent_source_pin_digest, compiler_identity, extractor_identity, graph_json, graph_digest)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(parent.sourceVersionId, parent.bookId, parent.objectDigest,
      parent.parserIdentity, pin.json, pin.digest, graph.parserIdentity, graph.extractorIdentity, graphJson, sha256Hex(graphJson));
  }
  return requireWordRevisionSource(db, parent, graph);
}

export interface WordImportChoiceRecord extends WordTrackedChoiceInput {
  schema: 'ai7.word-import-choice/1';
  sourceVersionId: string;
  parentSourcePinDigest: string;
  originalDigest: string;
  workingObjectDigest: string | null;
  importReviewId: string;
  fidelityReviewId: string;
  commitId: string;
  revisionId: string;
  extractorIdentity: typeof WORD_EXTRACTOR_IDENTITY;
  graphDigest: string;
  readings: Record<WordReadingKind, { digest: string; blockCount: number; usable: boolean }>;
  mappingDigest: string;
  templateManifestDigest: string;
  effectiveControls: WordImportControlsSnapshot;
}

function wordControlReference(value: unknown): boolean {
  return isRecord(value) && (value.kind === 'default'
    ? hasExactKeys(value, ['kind', 'basis']) && wordCanonicalJson(value.basis) === wordCanonicalJson(LOCAL_LEARNING_POLICY_BASIS)
    : value.kind === 'entry' && hasExactKeys(value, ['kind', 'entryId', 'sha256']) &&
      typeof value.entryId === 'string' && value.entryId.length > 0 && value.entryId.isWellFormed() &&
      typeof value.sha256 === 'string' && DIGEST_PATTERN.test(value.sha256));
}

function wordStanding(value: unknown): boolean {
  return isRecord(value) && hasExactKeys(value, ['choice', 'decisionId', 'decisionDigest', 'basisVersion']) &&
    ['book', 'house', 'excluded', 'deferred'].includes(String(value.choice)) && Number.isSafeInteger(value.basisVersion) && Number(value.basisVersion) > 0 &&
    (value.decisionId === null && value.decisionDigest === null && value.choice === 'house' && value.basisVersion === 2 ||
      typeof value.decisionId === 'string' && UUID_PATTERN.test(value.decisionId) &&
      typeof value.decisionDigest === 'string' && DIGEST_PATTERN.test(value.decisionDigest));
}

/** Structural validation is shared by operational export and local learning; it does not grant admission. */
export function validateWordImportChoiceRecord(value: unknown): asserts value is WordImportChoiceRecord {
  requireRetention(isRecord(value) && hasExactKeys(value, ['schema', 'sourceVersionId', 'parentSourcePinDigest', 'originalDigest', 'workingObjectDigest',
    'importReviewId', 'fidelityReviewId', 'commitId', 'revisionId', 'extractorIdentity', 'graphDigest', 'readings', 'mappingDigest',
    'templateManifestDigest', 'effectiveControls', 'mode', 'learnFromEdits', 'acceptedBaselineConfirmed']), 'WORD_CHOICE_INVALID', 'Word 导入选择记录字段无效。');
  const selection = validateWordChoice({ mode: value.mode, learnFromEdits: value.learnFromEdits, acceptedBaselineConfirmed: value.acceptedBaselineConfirmed });
  requireRetention(value.schema === 'ai7.word-import-choice/1' && value.extractorIdentity === WORD_EXTRACTOR_IDENTITY && value.workingObjectDigest === null &&
    [value.sourceVersionId, value.fidelityReviewId, value.commitId, value.revisionId].every((id) => typeof id === 'string' && UUID_PATTERN.test(id)) &&
    [value.parentSourcePinDigest, value.originalDigest, value.importReviewId, value.graphDigest, value.mappingDigest, value.templateManifestDigest]
      .every((digest) => typeof digest === 'string' && DIGEST_PATTERN.test(digest)), 'WORD_CHOICE_INVALID', 'Word 导入选择的固定标识无效。');
  const controls = value.effectiveControls;
  requireRetention(isRecord(controls) && hasExactKeys(controls, ['global', 'book', 'materials']) &&
    isRecord(controls.global) && hasExactKeys(controls.global, ['enabled', 'reference']) && typeof controls.global.enabled === 'boolean' &&
    isRecord(controls.book) && hasExactKeys(controls.book, ['excluded', 'reference']) && typeof controls.book.excluded === 'boolean' &&
    wordControlReference(controls.global.reference) && wordControlReference(controls.book.reference) && Array.isArray(controls.materials),
  'WORD_CHOICE_INVALID', 'Word 导入选择的学习控制记录无效。');
  const keys = new Set<string>();
  for (const material of controls.materials) {
    requireRetention(isRecord(material) && hasExactKeys(material, ['templateKey', 'materialDigest', 'standing']) &&
      typeof material.templateKey === 'string' && DIGEST_PATTERN.test(material.templateKey) && !keys.has(material.templateKey) &&
      typeof material.materialDigest === 'string' && DIGEST_PATTERN.test(material.materialDigest) && wordStanding(material.standing),
    'WORD_CHOICE_INVALID', 'Word 修改样本准入快照无效。');
    keys.add(material.templateKey);
  }
  requireRetention(isRecord(value.readings) && hasExactKeys(value.readings, ['rejected', 'accepted']), 'WORD_CHOICE_INVALID', 'Word 两条阅读的固定记录无效。');
  for (const reading of [value.readings.rejected, value.readings.accepted]) requireRetention(isRecord(reading) &&
    hasExactKeys(reading, ['digest', 'blockCount', 'usable']) && typeof reading.digest === 'string' && DIGEST_PATTERN.test(reading.digest) &&
    typeof reading.blockCount === 'number' && Number.isSafeInteger(reading.blockCount) && reading.blockCount >= 0 &&
    typeof reading.usable === 'boolean' && (!reading.usable || reading.blockCount > 0), 'WORD_CHOICE_INVALID', 'Word 阅读的计数或摘要无效。');
  const selected = value.readings[selection.mode === 'suggestions' ? 'rejected' : 'accepted'];
  requireRetention(isRecord(selected) && selected.usable === true, 'WORD_CHOICE_INVALID', '所选 Word 阅读不可用。');
}

const WORD_CHOICE_DIGESTS = new WeakMap<WordImportChoiceRecord, string>();

/** Imported choices are immutable shared evidence; prove/hash their whole control vector once, not once per sample. */
export function wordImportChoiceDigest(choice: WordImportChoiceRecord): string {
  const known = WORD_CHOICE_DIGESTS.get(choice);
  if (known !== undefined) return known;
  validateWordImportChoiceRecord(choice);
  const digest = sha256Hex(wordCanonicalJson(choice));
  const pending: unknown[] = [choice];
  const seen = new WeakSet<object>();
  while (pending.length > 0) {
    const value = pending.pop();
    if (value === null || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    for (const child of Object.values(value)) pending.push(child);
    Object.freeze(value);
  }
  WORD_CHOICE_DIGESTS.set(choice, digest);
  return digest;
}

/** Operational choice readback also works when learning was off and no sample/admission exists. */
export function readWordImportChoiceRecord(db: DatabaseSync, bookId: string, commitId: string): {
  choice: WordImportChoiceRecord; digest: string; createdAt: string;
} {
  requireRetention(UUID_PATTERN.test(bookId) && UUID_PATTERN.test(commitId), 'WORD_CHOICE_INVALID', 'Word 导入来源标识无效。');
  const row = db.prepare(`SELECT wi.*, ic.operation_kind, ic.review_digest, ic.committed_at, mir.imported_at,
    mir.book_id original_book_id, mir.source_version_id original_source_id, mir.resulting_revision_id original_revision_id,
    mir.fidelity_review_id original_fidelity_id, fr.book_id fidelity_book_id, fr.source_version_id fidelity_source_id,
    sp.source_version_id provenance_source_id, sp.parser_identity derivation_parser, sp.acquisition_path, sp.locality,
    sp.recorded_at provenance_at, sp.sanitized_identity provenance_name, d.display_name draft_name,
    d.object_digest draft_object_digest, d.source_format draft_format, d.working_object_digest draft_working_object,
    m.book_id revision_book_id, mr.source_version_id revision_source_id
    FROM word_revision_imports wi JOIN import_commits ic ON ic.commit_id = wi.commit_id
    JOIN import_drafts d ON d.draft_id = ic.draft_id
    JOIN manuscript_import_records mir ON mir.commit_id = wi.commit_id
    JOIN source_provenance sp ON sp.provenance_id = mir.provenance_id
    JOIN import_fidelity_reviews fr ON fr.fidelity_review_id = wi.fidelity_review_id
    JOIN manuscript_revisions mr ON mr.revision_id = wi.revision_id
    JOIN manuscripts m ON m.manuscript_id = mr.manuscript_id WHERE wi.commit_id = ?`).get(commitId);
  requireRetention(row && row.book_id === bookId && row.original_book_id === bookId && row.fidelity_book_id === bookId && row.revision_book_id === bookId,
    'WORD_CHOICE_INVALID', 'Word 导入的图书、确认或修订版来源不完整。');
  const json = text(row.canonical_json);
  requireRetention(sha256Hex(json) === row.sha256, 'WORD_CHOICE_INVALID', 'Word 导入选择的摘要无效。');
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new ImportRetentionError('WORD_CHOICE_INVALID', 'Word 导入选择无法读取。'); }
  validateWordImportChoiceRecord(value);
  const choice = value;
  const parent = readWordParentSourcePin(db, bookId, choice.sourceVersionId);
  const pin = wordParentSourcePinRecord(parent);
  const source = db.prepare(`SELECT book_id, object_digest, parent_parser_identity, parent_source_pin_json, parent_source_pin_digest,
    compiler_identity, extractor_identity, graph_digest FROM word_revision_sources WHERE source_version_id = ?`).get(choice.sourceVersionId);
  requireRetention(source && source.book_id === bookId && source.object_digest === parent.objectDigest && source.parent_parser_identity === parent.parserIdentity &&
    source.parent_source_pin_json === pin.json && source.parent_source_pin_digest === pin.digest &&
    source.compiler_identity === WORD_DOCX_PARSER_IDENTITY && source.extractor_identity === choice.extractorIdentity && source.graph_digest === choice.graphDigest &&
    choice.parentSourcePinDigest === pin.digest && choice.originalDigest === parent.sourceDigest,
  'WORD_CHOICE_INVALID', 'Word 导入选择与原始来源或衍生图不一致。');
  requireRetention(wordCanonicalJson(choice) === json && choice.commitId === commitId && choice.sourceVersionId === row.source_version_id &&
    row.original_source_id === choice.sourceVersionId && row.fidelity_source_id === choice.sourceVersionId && row.revision_source_id === choice.sourceVersionId &&
    row.provenance_source_id === choice.sourceVersionId && row.derivation_parser === WORD_DOCX_PARSER_IDENTITY &&
    row.acquisition_path === 'native-file-picker' && row.locality === 'local-provider-free' && row.provenance_at === row.created_at &&
    row.provenance_name === row.draft_name && row.draft_object_digest === choice.originalDigest && row.draft_format === 'DOCX' && row.draft_working_object === null &&
    choice.revisionId === row.revision_id && row.original_revision_id === choice.revisionId && choice.fidelityReviewId === row.fidelity_review_id &&
    row.original_fidelity_id === choice.fidelityReviewId && choice.importReviewId === row.review_digest && choice.mode === row.mode &&
    row.operation_kind === 'manuscript-import' && row.created_at === row.committed_at && row.created_at === row.imported_at,
  'WORD_CHOICE_INVALID', 'Word 导入选择与实际来源、确认、提交或修订版不一致。');
  const createdAt = text(row.created_at);
  requireRetention(Number.isFinite(Date.parse(createdAt)), 'WORD_CHOICE_INVALID', 'Word 导入时间无效。');
  return { choice, digest: wordImportChoiceDigest(choice), createdAt };
}

/** The import has already written its real parent commit, fidelity, provenance and baseline in this transaction. */
export function retainWordRevisionImport(db: DatabaseSync, bookId: string, choice: WordImportChoiceRecord, createdAt: string):
  ReturnType<typeof readWordImportChoiceRecord> {
  requireRetention(db.isTransaction && UUID_PATTERN.test(bookId) && Number.isFinite(Date.parse(createdAt)),
    'WORD_CHOICE_INVALID', 'Word 导入选择必须与实际导入原子提交。');
  validateWordImportChoiceRecord(choice);
  const json = wordCanonicalJson(choice);
  const digest = sha256Hex(json);
  const existing = db.prepare('SELECT canonical_json, sha256, created_at FROM word_revision_imports WHERE commit_id = ?').get(choice.commitId);
  if (existing === undefined) {
    db.prepare(`INSERT INTO word_revision_imports(commit_id, source_version_id, book_id, fidelity_review_id, revision_id, mode, canonical_json, sha256, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(choice.commitId, choice.sourceVersionId, bookId, choice.fidelityReviewId,
      choice.revisionId, choice.mode, json, digest, createdAt);
  } else requireRetention(existing.canonical_json === json && existing.sha256 === digest && existing.created_at === createdAt,
    'WORD_CHOICE_INVALID', 'Word 导入选择与已提交记录不一致。');
  return readWordImportChoiceRecord(db, bookId, choice.commitId);
}
export interface WordLocalImportAdmission {
  schema: 'ai7.word-local-import-admission/1';
  sampleId: string;
  sampleDigest: string;
  importChoiceDigest: string;
  basis: typeof LOCAL_LEARNING_POLICY_BASIS;
  reviewedLearnFromEdits: true;
  global: { enabled: true; reference: WordControlReference };
  book: { excluded: false; reference: WordControlReference };
  standing: WordMaterialStandingSnapshot & { choice: 'book' | 'house' };
}

export type WordSampleDetailSection = 'before' | 'after' | 'events' | 'imports';
export type WordSampleDetailField = 'text' | 'rawId' | 'rawAuthor' | 'rawDate' | 'rangeName' | 'record';
export interface WordSampleCursor {
  schema: 'ai7.word-sample-cursor/1';
  sampleDigest: string;
  detailDigest: string;
  section: WordSampleDetailSection;
  entryOrdinal: number;
  field: WordSampleDetailField;
  codeUnitOffset: number;
}

/** Scalar records stay closed and small; every potentially long source field is a separate text entry. */
export type WordSampleDetailRecord =
  | { type: 'fragment'; fragment: WordSourceFragment }
  | { type: 'event'; eventId: string; kind: WordEventKind; context: WordSourceEvent['context'];
      part: string; elementOrdinal: number; location: WordSourceLocation; disposition: WordSourceEvent['disposition'];
      parentCount: number; rangeLinkCount: number }
  | { type: 'event-link'; eventId: string; relation: 'parent' | 'range'; linkedEventId: string; ordinal: number }
  | { type: 'import'; commitId: string; mode: WordImportMode; sourceVersionId: string; sourceDigest: string;
      parentSourcePinDigest: string;
      importReviewId: string; fidelityReviewId: string; revisionId: string; choiceDigest: string; admissionDigest: string;
      workingObjectDigest: string | null; compilerIdentity: string; extractorIdentity: typeof WORD_EXTRACTOR_IDENTITY;
      graphDigest: string; readings: WordImportChoiceRecord['readings']; mappingDigest: string; templateManifestDigest: string;
      learnFromEdits: boolean; acceptedBaselineConfirmed: boolean }
  | { type: 'import-admission'; commitId: string; basis: WordLocalImportAdmission };

export type WordSampleDetailEntry = {
  section: WordSampleDetailSection;
  entryOrdinal: number;
  sourceOrdinal: number;
  childOrdinal: number | null;
} & (
  | { kind: 'text'; field: Exclude<WordSampleDetailField, 'record'>; text: string | null;
      sha256: string | null; fragment: WordSourceFragment | null }
  | { kind: 'record'; field: 'record'; record: WordSampleDetailRecord }
);

export type WordSampleDetailItem = Omit<Extract<WordSampleDetailEntry, { kind: 'text' }>, 'text'> & {
  text: string | null; startCodeUnit: number; endCodeUnit: number; totalCodeUnits: number; complete: boolean;
} | (Extract<WordSampleDetailEntry, { kind: 'record' }> & { complete: true });

export interface WordSampleDetailPage {
  bookId: string;
  sampleId: string;
  sampleDigest: string;
  detailDigest: string;
  sourceVersionId: string;
  sourceDigest: string;
  operationKind: WordOperationKind;
  sectionCounts: Record<WordSampleDetailSection, number>;
  items: WordSampleDetailItem[];
  nextCursor: WordSampleCursor | null;
}

export interface WordSampleDetailSource {
  sourceVersionId: string;
  graph: WordRevisionGraph;
  graphDigest: string;
  decodedAtoms: ReadonlyMap<number, string>;
  /** Built once with the retained source, shared across samples/pages; no graph copy per sample. */
  eventIndex: ReadonlyMap<string, WordSourceEvent>;
  sample: WordTrackedEditSample;
  sampleDigest: string;
  imports: ReadonlyArray<{ choice: WordImportChoiceRecord; choiceDigest: string;
    admission: WordLocalImportAdmission; admissionDigest: string }>;
}

export interface WordSampleDetailContext {
  bookId: string;
  sourceVersionId: string;
  parentPinDigest: string;
  generation: string;
  graph: WordRevisionGraph;
  graphDigest: string;
  decodedAtoms: ReadonlyMap<number, string>;
  eventIndex: ReadonlyMap<string, WordSourceEvent>;
  samples: ReadonlyMap<string, { sample: WordTrackedEditSample; templateKey: string }>;
}

/** A cache never hides writes made through this connection, another connection, or a changed schema. */
function wordDetailGeneration(db: DatabaseSync): string {
  return wordCanonicalJson({ data: db.prepare('PRAGMA data_version').get(), schema: db.prepare('PRAGMA schema_version').get(),
    changes: db.prepare('SELECT total_changes() changes').get() });
}

export function wordSampleDetailContextCurrent(db: DatabaseSync, context: WordSampleDetailContext): boolean {
  return context.generation === wordDetailGeneration(db);
}

/** The caller verifies historical source records and original-object availability/bytes before compilation. */
export function createWordSampleDetailContext(db: DatabaseSync, bookId: string, sourceVersionId: string,
  compiled: Extract<WordTrackedCompilation, { kind: 'ready' }>): WordSampleDetailContext {
  const generation = wordDetailGeneration(db);
  const parent = readWordParentSourcePin(db, bookId, sourceVersionId);
  requireRetention(parent.sourceDigest === compiled.sourceDigest && parent.sourceBytes === compiled.archiveBytes,
    'WORD_SOURCE_INVALID', 'Word 详情的原始对象与已验证编译结果不一致。');
  const pins = requireWordRevisionSource(db, parent, compiled.graph);
  requireRetention(pins.graphDigest === compiled.graphDigest, 'WORD_SOURCE_INVALID', 'Word 详情来源图摘要无效。');
  const samples = wordTrackedSamples(bookId, compiled.graph, compiled.templates);
  const context: WordSampleDetailContext = { bookId, sourceVersionId, parentPinDigest: pins.parentSourcePinDigest, generation,
    graph: compiled.graph, graphDigest: compiled.graphDigest, decodedAtoms: compiled.decodedAtoms,
    eventIndex: new Map(compiled.graph.events.map((event) => [event.eventId, event])),
    samples: new Map(samples.map((sample, index) => [sample.sampleId, { sample, templateKey: compiled.templates[index]!.templateKey }])) };
  requireRetention(context.samples.size === samples.length && wordSampleDetailContextCurrent(db, context),
    'WORD_DETAIL_CONTEXT_CHANGED', 'Word 详情来源在读取期间已变化。');
  return context;
}

/** Actual compiler templates, exact stored rows and already-validated historical import memberships meet here. */
export function resolveWordSampleDetailSource(db: DatabaseSync, context: WordSampleDetailContext, sampleId: string, sampleDigest: string,
  imports: WordSampleDetailSource['imports']): WordSampleDetailSource {
  requireRetention(wordSampleDetailContextCurrent(db, context), 'WORD_DETAIL_CONTEXT_CHANGED', 'Word 详情缓存已变化，请重新读取来源。');
  const found = context.samples.get(sampleId);
  const row = db.prepare('SELECT * FROM word_tracked_edit_samples WHERE sample_id = ? AND book_id = ?').get(sampleId, context.bookId);
  requireRetention(found !== undefined && row !== undefined && row.source_version_id === context.sourceVersionId && row.sha256 === sampleDigest &&
    row.template_key === found.templateKey,
    'WORD_SAMPLE_INVALID', 'Word 修改样本不属于所选图书或来源。');
  const sample = found.sample;
  const expected = wordTrackedSampleRecord(sample);
  const memberships = db.prepare(`SELECT wi.sha256 choice_digest, si.sha256 admission_digest FROM word_tracked_edit_sample_imports si
    LEFT JOIN word_revision_imports wi ON wi.commit_id = si.commit_id WHERE si.sample_id = ? ORDER BY wi.created_at, si.commit_id`).all(sampleId);
  requireRetention(expected.digest === sampleDigest && row.canonical_json === expected.json && imports.length > 0 && imports.length === memberships.length &&
    imports.every(({ choice, choiceDigest, admissionDigest }, index) => choice.sourceVersionId === context.sourceVersionId &&
      choice.parentSourcePinDigest === context.parentPinDigest && choice.originalDigest === context.graph.sourceDigest && choice.graphDigest === context.graphDigest &&
      choiceDigest === memberships[index]!.choice_digest && admissionDigest === memberships[index]!.admission_digest),
  'WORD_SAMPLE_INVALID', 'Word 修改样本或导入来源与实际编译清单不一致。');
  requireRetention(wordSampleDetailContextCurrent(db, context), 'WORD_DETAIL_CONTEXT_CHANGED', 'Word 详情来源在读取期间已变化。');
  return { sourceVersionId: context.sourceVersionId, graph: context.graph, graphDigest: context.graphDigest,
    decodedAtoms: context.decodedAtoms, eventIndex: context.eventIndex, sample, sampleDigest, imports };
}

/** Resolve a pinned exact fragment, never a normalized manuscript excerpt. */
export function wordSourceFragmentText(graph: WordRevisionGraph, decoded: ReadonlyMap<number, string>, fragment: WordSourceFragment): string | null {
  const atom = graph.atoms[fragment.atomOrdinal];
  requireRetention(atom !== undefined && atom.atomOrdinal === fragment.atomOrdinal && atom.kind === fragment.kind &&
    atom.part === fragment.part && atom.paragraphIndex === fragment.paragraphIndex,
  'WORD_SOURCE_CORRUPT', 'Word 修改样本的原始片段位置无效。');
  if (fragment.kind === 'paragraph-boundary') {
    requireRetention(fragment.sha256 === atom.sha256, 'WORD_SOURCE_CORRUPT', 'Word 修改样本的段落边界已变化。');
    return null;
  }
  const text = decoded.get(atom.atomOrdinal);
  requireRetention(text !== undefined && text.isWellFormed() && text.length === atom.codeUnits && sha256Hex(text) === atom.sha256,
    'WORD_SOURCE_CORRUPT', 'Word 修改样本的原始文字已变化。');
  const boundary = (offset: number): boolean => Number.isSafeInteger(offset) && offset >= 0 && offset <= text.length &&
    !(offset > 0 && offset < text.length && /[\uD800-\uDBFF]/u.test(text[offset - 1]!) && /[\uDC00-\uDFFF]/u.test(text[offset]!));
  requireRetention(boundary(fragment.fromCodeUnit) && boundary(fragment.toCodeUnit) && fragment.fromCodeUnit <= fragment.toCodeUnit &&
    fragment.codeUnits === fragment.toCodeUnit - fragment.fromCodeUnit, 'WORD_SOURCE_CORRUPT', 'Word 修改样本的文字边界无效。');
  const result = text.slice(fragment.fromCodeUnit, fragment.toCodeUnit);
  requireRetention(sha256Hex(result) === fragment.sha256, 'WORD_SOURCE_CORRUPT', 'Word 修改样本的原始文字摘要不一致。');
  return result;
}

export interface WordSampleDetailStream {
  sampleDigest: string;
  detailDigest: string;
  sourceVersionId: string;
  sectionCounts: Record<WordSampleDetailSection, number>;
  entryAt(section: WordSampleDetailSection, ordinal: number): WordSampleDetailEntry | null;
  fieldAt(section: WordSampleDetailSection, ordinal: number): WordSampleDetailField;
}

/** Source-backed flat ordinals: counts/indexes inspect references, while fields resolve on demand. */
export function wordSampleDetailStream(source: WordSampleDetailSource): WordSampleDetailStream {
  requireRetention(source.graphDigest === source.sample.graphDigest && source.graph.sourceDigest === source.sample.sourceDigest &&
    wordTrackedSampleRecord(source.sample).digest === source.sampleDigest,
  'WORD_SOURCE_CORRUPT', 'Word 修改样本的来源身份不一致。');
  const eventOf = (ordinal: number): WordSourceEvent => {
    const id = source.sample.eventMembership[ordinal];
    const event = id === undefined ? undefined : source.eventIndex.get(id);
    requireRetention(event !== undefined && event.eventId === id, 'WORD_SOURCE_CORRUPT', 'Word 修改样本的原始事件缺失。');
    return event;
  };
  const eventSize = (event: WordSourceEvent): number => 5 + event.parentEventIds.length + event.linkedEventIds.length;
  let eventCount = 0;
  for (let ordinal = 0; ordinal < source.sample.eventMembership.length; ordinal += 1) eventCount += eventSize(eventOf(ordinal));
  const sectionCounts = { before: source.sample.before.length, after: source.sample.after.length,
    events: eventCount, imports: source.imports.length * 2 };
  source.imports.forEach(({ choice, choiceDigest, admission, admissionDigest }) => {
    requireRetention(choice.sourceVersionId === source.sourceVersionId && DIGEST_PATTERN.test(choice.parentSourcePinDigest) && choice.originalDigest === source.sample.sourceDigest &&
      choice.graphDigest === source.graphDigest && admission.sampleId === source.sample.sampleId &&
      admission.sampleDigest === source.sampleDigest && admission.importChoiceDigest === choiceDigest &&
      wordImportChoiceDigest(choice) === choiceDigest && sha256Hex(wordCanonicalJson(admission)) === admissionDigest,
    'WORD_SOURCE_CORRUPT', 'Word 修改样本的导入或准入身份不一致。');
  });
  let currentEvent: { event: WordSourceEvent; sourceOrdinal: number; start: number; end: number } | null = null;
  const locateEvent = (ordinal: number, remember: boolean) => {
    let sourceOrdinal = currentEvent !== null && ordinal >= currentEvent.start ? currentEvent.sourceOrdinal : 0;
    let start = currentEvent !== null && ordinal >= currentEvent.start ? currentEvent.start : 0;
    for (; sourceOrdinal < source.sample.eventMembership.length; sourceOrdinal += 1) {
      const event = eventOf(sourceOrdinal);
      const end = start + eventSize(event);
      if (ordinal < end) {
        const found = { event, sourceOrdinal, start, end };
        if (remember) currentEvent = found;
        return found;
      }
      start = end;
    }
    throw new ImportRetentionError('WORD_SOURCE_CORRUPT', 'Word 修改样本的事件详情位置无效。');
  };
  const fields = ['rawId', 'rawAuthor', 'rawDate', 'rangeName'] as const;
  const record = (section: WordSampleDetailSection, entryOrdinal: number, sourceOrdinal: number,
    value: WordSampleDetailRecord, childOrdinal: number | null = null): WordSampleDetailEntry =>
    ({ section, entryOrdinal, sourceOrdinal, childOrdinal, kind: 'record', field: 'record', record: value });
  return { sampleDigest: source.sampleDigest, sourceVersionId: source.sourceVersionId,
    detailDigest: wordSampleDetailDigest(source.sampleDigest, source.graphDigest, source.sourceVersionId, source.imports), sectionCounts,
    fieldAt(section, ordinal) {
      if (section === 'before' || section === 'after') return source.sample[section][ordinal]?.kind === 'text' ? 'text' : 'record';
      if (section === 'imports') return 'record';
      const found = locateEvent(ordinal, false);
      const relative = ordinal - found.start;
      return relative > 0 && relative < 5 ? fields[relative - 1]! : 'record';
    },
    entryAt(section, ordinal) {
      if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= sectionCounts[section]) return null;
      if (section === 'before' || section === 'after') {
        const fragment = source.sample[section][ordinal]!;
        const text = wordSourceFragmentText(source.graph, source.decodedAtoms, fragment);
        return text === null ? record(section, ordinal, ordinal, { type: 'fragment', fragment })
          : { section, entryOrdinal: ordinal, sourceOrdinal: ordinal, childOrdinal: null,
              kind: 'text', field: 'text', text, sha256: fragment.sha256, fragment };
      }
      if (section === 'imports') {
        const sourceOrdinal = Math.floor(ordinal / 2);
        const { choice, choiceDigest, admission, admissionDigest } = source.imports[sourceOrdinal]!;
        return record(section, ordinal, sourceOrdinal, ordinal % 2 === 1
          ? { type: 'import-admission', commitId: choice.commitId, basis: admission }
          : { type: 'import', commitId: choice.commitId, mode: choice.mode, sourceVersionId: choice.sourceVersionId,
              parentSourcePinDigest: choice.parentSourcePinDigest,
              sourceDigest: choice.originalDigest, fidelityReviewId: choice.fidelityReviewId, importReviewId: choice.importReviewId,
              revisionId: choice.revisionId, choiceDigest, admissionDigest, workingObjectDigest: choice.workingObjectDigest,
              compilerIdentity: source.graph.parserIdentity, extractorIdentity: choice.extractorIdentity, graphDigest: choice.graphDigest,
              readings: choice.readings, mappingDigest: choice.mappingDigest, templateManifestDigest: choice.templateManifestDigest,
              learnFromEdits: choice.learnFromEdits, acceptedBaselineConfirmed: choice.acceptedBaselineConfirmed });
      }
      const { event, sourceOrdinal, start } = locateEvent(ordinal, true);
      const relative = ordinal - start;
      if (relative === 0) return record(section, ordinal, sourceOrdinal, { type: 'event', eventId: event.eventId,
        kind: event.kind, context: event.context, part: event.part, elementOrdinal: event.elementOrdinal,
        location: event.location, disposition: event.disposition, parentCount: event.parentEventIds.length, rangeLinkCount: event.linkedEventIds.length });
      if (relative < 5) {
        const field = fields[relative - 1]!;
        const text = event[field];
        return { section, entryOrdinal: ordinal, sourceOrdinal, childOrdinal: null, kind: 'text', field,
          text, sha256: text === null ? null : sha256Hex(text), fragment: null };
      }
      const link = relative - 5;
      const relation = link < event.parentEventIds.length ? 'parent' : 'range';
      const childOrdinal = relation === 'parent' ? link : link - event.parentEventIds.length;
      const linkedEventId = (relation === 'parent' ? event.parentEventIds : event.linkedEventIds)[childOrdinal]!;
      requireRetention(source.eventIndex.has(linkedEventId), 'WORD_SOURCE_CORRUPT', 'Word 修改样本的父事件或移动关联缺失。');
      return record(section, ordinal, sourceOrdinal, { type: 'event-link', eventId: event.eventId, relation,
        linkedEventId, ordinal: childOrdinal }, childOrdinal);
    },
  };
}

/** Forty entries and an encoded whole-frame bound; a grapheme need never fit in one chunk. */
export function pageWordSampleDetail(source: WordSampleDetailSource, after: unknown,
  budget = MAX_FRAME_BYTES - 8192, stream: WordSampleDetailStream = wordSampleDetailStream(source)): WordSampleDetailPage {
  requireRetention(Number.isSafeInteger(budget) && budget > 0 && budget <= MAX_FRAME_BYTES - 8192,
    'WORD_SAMPLE_INVALID', 'Word 修改样本详情的传输边界无效。');
  const sectionOrder = ['before', 'after', 'events', 'imports'] as const;
  const detailDigest = wordSampleDetailDigest(source.sampleDigest, source.graphDigest, source.sourceVersionId, source.imports);
  requireRetention(stream.sampleDigest === source.sampleDigest && stream.detailDigest === detailDigest && stream.sourceVersionId === source.sourceVersionId,
    'WORD_SOURCE_CORRUPT', 'Word 修改样本的详情读取器身份已变化。');
  const identity = { sampleDigest: source.sampleDigest, detailDigest };
  const afterCursor = validateWordSampleCursor(after, identity, stream.entryAt);
  const total = sectionOrder.reduce((sum, section) => sum + stream.sectionCounts[section], 0);
  const position = (index: number): { section: WordSampleDetailSection; entryOrdinal: number } | null => {
    for (const section of sectionOrder) {
      if (index < stream.sectionCounts[section]) return { section, entryOrdinal: index };
      index -= stream.sectionCounts[section];
    }
    return null;
  };
  let index = 0;
  if (afterCursor !== null) {
    for (const section of sectionOrder) {
      if (section === afterCursor.section) break;
      index += stream.sectionCounts[section];
    }
    index += afterCursor.entryOrdinal;
  }
  let offset = afterCursor?.codeUnitOffset ?? 0;
  const page: WordSampleDetailPage = { bookId: source.sample.bookId, sampleId: source.sample.sampleId, ...identity,
    sourceVersionId: source.sourceVersionId, sourceDigest: source.sample.sourceDigest, operationKind: source.sample.operationKind,
    sectionCounts: { ...stream.sectionCounts },
    items: [], nextCursor: null };
  const cursor = (at: number, codeUnitOffset: number): WordSampleCursor | null => {
    const next = position(at);
    return next === null ? null : { schema: 'ai7.word-sample-cursor/1', ...identity, ...next,
      field: stream.fieldAt(next.section, next.entryOrdinal), codeUnitOffset };
  };
  const fits = (item: WordSampleDetailItem, next: WordSampleCursor | null): boolean =>
    Buffer.byteLength(JSON.stringify({ ...page, items: [...page.items, item], nextCursor: next }), 'utf8') <= budget;
  while (index < total && page.items.length < 40) {
    const at = position(index)!;
    const entry = stream.entryAt(at.section, at.entryOrdinal);
    requireRetention(entry !== null, 'WORD_SOURCE_CORRUPT', 'Word 修改样本的详情条目缺失。');
    if (entry.kind === 'record') {
      const item = { ...entry, complete: true as const };
      if (!fits(item, cursor(index + 1, 0))) break;
      page.items.push(item); index += 1; offset = 0; continue;
    }
    const field = entry.text;
    const itemAt = (end: number): WordSampleDetailItem => ({ ...entry, text: field?.slice(offset, end) ?? null,
      startCodeUnit: offset, endCodeUnit: end, totalCodeUnits: field?.length ?? 0, complete: end === (field?.length ?? 0) });
    if (field === null || offset === field.length) {
      const item = itemAt(offset);
      if (!fits(item, cursor(index + 1, 0))) break;
      page.items.push(item); index += 1; offset = 0; continue;
    }
    // Encoded JSON needs at least one byte per well-formed UTF-16 code unit. Never
    // allocate/encode a full tail that cannot fit even before its envelope is added.
    if (field.length - offset <= budget) {
      const full = itemAt(field.length);
      if (fits(full, cursor(index + 1, 0))) {
        page.items.push(full); index += 1; offset = 0; continue;
      }
    }
    const floorBoundary = (end: number): number => end > offset && end < field.length &&
      /[\uD800-\uDBFF]/u.test(field[end - 1]!) && /[\uDC00-\uDFFF]/u.test(field[end]!) ? end - 1 : end;
    let low = offset;
    // A complete field has a different continuation envelope and was checked separately.
    let high = floorBoundary(Math.min(field.length - 1, offset + budget));
    while (low < high) {
      let end = floorBoundary(low + Math.ceil((high - low) / 2));
      if (end === low) end += field.codePointAt(low)! > 0xffff ? 2 : 1;
      if (fits(itemAt(end), cursor(index, end))) low = end;
      else high = floorBoundary(end - 1);
    }
    if (low === offset) break;
    page.items.push(itemAt(low));
    offset = low;
    break;
  }
  page.nextCursor = cursor(index, offset);
  requireRetention(page.items.length > 0 || page.nextCursor === null, 'WORD_SOURCE_CORRUPT', 'Word 修改样本详情的一个字符或结构记录无法放入传输边界。');
  requireRetention(Buffer.byteLength(JSON.stringify(page), 'utf8') <= budget, 'WORD_SOURCE_CORRUPT', 'Word 修改样本详情超出完整传输边界。');
  return page;
}

/** Membership is deliberately absent from sample identity and explicitly present in detail-stream identity. */
export function wordSampleDetailDigest(sampleDigest: string, graphDigest: string, sourceVersionId: string,
  imports: readonly { choiceDigest: string; admissionDigest: string }[]): string {
  requireRetention(DIGEST_PATTERN.test(sampleDigest) && DIGEST_PATTERN.test(graphDigest) && UUID_PATTERN.test(sourceVersionId) &&
    imports.every((entry) => DIGEST_PATTERN.test(entry.choiceDigest) && DIGEST_PATTERN.test(entry.admissionDigest)),
  'WORD_SAMPLE_INVALID', 'Word 修改样本的详情身份无效。');
  return sha256Hex(wordCanonicalJson({ schema: 'ai7.word-sample-detail/1', sampleDigest, graphDigest, sourceVersionId, imports }));
}

/** UTF-16 cursor identity is separate from a Manuscript grapheme anchor, including inside a combining cluster. */
export function validateWordSampleCursor(value: unknown, identity: { sampleDigest: string; detailDigest: string },
  entryAt: (section: WordSampleDetailSection, ordinal: number) => WordSampleDetailEntry | null): WordSampleCursor | null {
  if (value === null) return null;
  requireRetention(isRecord(value) && hasExactKeys(value, ['schema', 'sampleDigest', 'detailDigest', 'section', 'entryOrdinal', 'field', 'codeUnitOffset']) &&
    value.schema === 'ai7.word-sample-cursor/1' && value.sampleDigest === identity.sampleDigest && value.detailDigest === identity.detailDigest,
  'WORD_SAMPLE_CURSOR_INVALID', 'Word 修改样本详情的继续位置或身份无效。');
  const { section, entryOrdinal, field, codeUnitOffset } = value;
  requireRetention((section === 'before' || section === 'after' || section === 'events' || section === 'imports') &&
    typeof entryOrdinal === 'number' && Number.isSafeInteger(entryOrdinal) && entryOrdinal >= 0 &&
    (field === 'text' || field === 'rawId' || field === 'rawAuthor' || field === 'rawDate' || field === 'rangeName' || field === 'record') &&
    typeof codeUnitOffset === 'number' && Number.isSafeInteger(codeUnitOffset) && codeUnitOffset >= 0,
  'WORD_SAMPLE_CURSOR_INVALID', 'Word 修改样本详情的段落、字段或偏移无效。');
  const entry = entryAt(section, entryOrdinal);
  requireRetention(entry !== null && entry.section === section && entry.entryOrdinal === entryOrdinal && entry.field === field,
    'WORD_SAMPLE_CURSOR_INVALID', 'Word 修改样本详情没有这一项或字段。');
  if (entry.kind === 'record' || entry.text === null) requireRetention(codeUnitOffset === 0, 'WORD_SAMPLE_CURSOR_INVALID', '结构记录或空值不能带有文字偏移。');
  else {
    const text = entry.text;
    requireRetention(codeUnitOffset <= text.length && !(codeUnitOffset > 0 && codeUnitOffset < text.length &&
      /[\uD800-\uDBFF]/u.test(text[codeUnitOffset - 1]!) && /[\uDC00-\uDFFF]/u.test(text[codeUnitOffset]!)),
    'WORD_SAMPLE_CURSOR_INVALID', 'Word 修改样本详情的偏移切开了 Unicode 字符。');
  }
  return { schema: 'ai7.word-sample-cursor/1', ...identity, section, entryOrdinal, field, codeUnitOffset };
}

/** The source-only key deliberately excludes mode, Book, commit, normalized block IDs and timestamps. */
export function wordTemplateKey(sourceDigest: string, template: Omit<WordSampleTemplate, 'templateKey'>): string {
  return sha256Hex(wordCanonicalJson({ schema: 'ai7.word-sample-key/1', sourceDigest,
    extractorIdentity: WORD_EXTRACTOR_IDENTITY, ...template }));
}

export function wordTrackedSample(bookId: string, graph: WordRevisionGraph, template: WordSampleTemplate): WordTrackedEditSample {
  return wordTrackedSamples(bookId, graph, [template])[0]!;
}

export function wordTrackedSampleRecord(sample: WordTrackedEditSample): { json: string; digest: string } {
  const json = wordCanonicalJson({ schema: 'ai7.word-tracked-edit-sample/1', ...sample });
  return { json, digest: sha256Hex(json) };
}

/** A whole admitted batch shares one graph digest; sample construction never rehashes the document per edit. */
export function wordTrackedSamples(bookId: string, graph: WordRevisionGraph, templates: readonly WordSampleTemplate[]): WordTrackedEditSample[] {
  requireRetention(UUID_PATTERN.test(bookId), 'WORD_SAMPLE_INVALID', 'Word 修改样本的图书标识无效。');
  const graphDigest = sha256Hex(wordCanonicalJson(graph));
  return templates.map((template) => {
    const { templateKey, ...content } = template;
    requireRetention(templateKey === wordTemplateKey(graph.sourceDigest, content), 'WORD_SAMPLE_INVALID', 'Word 修改样本与原始操作不一致。');
    requireRetention(content.before.length + content.after.length > 0, 'WORD_SAMPLE_INVALID', 'Word 修改样本没有文字或段落边界。');
    return { sampleId: `wts_${sha256Hex(wordCanonicalJson({ schema: 'ai7.word-sample-id/1', bookId, templateKey }))}`,
      bookId, sourceDigest: graph.sourceDigest, extractorIdentity: WORD_EXTRACTOR_IDENTITY,
      graphDigest, ...content };
  });
}

export function validateWordChoice(value: unknown): WordTrackedChoiceInput {
  requireRetention(value !== null && typeof value === 'object' && !Array.isArray(value), 'WORD_CHOICE_INVALID', '请选择 Word 修订的导入方式。');
  const choice = Object.getOwnPropertyDescriptors(value);
  requireRetention(Object.keys(choice).sort().join(',') === 'acceptedBaselineConfirmed,learnFromEdits,mode' &&
    Object.values(choice).every((entry) => 'value' in entry), 'WORD_CHOICE_INVALID', 'Word 修订导入选择无效。');
  const mode: unknown = choice.mode?.value;
  const learnFromEdits: unknown = choice.learnFromEdits?.value;
  const acceptedBaselineConfirmed: unknown = choice.acceptedBaselineConfirmed?.value;
  requireRetention((mode === 'suggestions' || mode === 'accepted-baseline') && typeof learnFromEdits === 'boolean' &&
    typeof acceptedBaselineConfirmed === 'boolean' && acceptedBaselineConfirmed === (mode === 'accepted-baseline'),
  'WORD_CHOICE_INVALID', '直接并入正文须明确确认；修订建议不能携带定稿确认。');
  return { mode, learnFromEdits, acceptedBaselineConfirmed };
}

/**
 * Import retention (Issue #410, plan slice S61; ADR 0086): what schema revision 27 records so that a
 * DOCX's content can stay with its Source Version and be restored from the original on export.
 *
 * - `import_fidelity_categories` widens to the ten classes (`position` 1 to 10) and the `retained`
 *   status. A store that revision 26 or earlier created is rebuilt to the widened text with every row
 *   copied byte for byte, rowid included (`widenImportFidelityCategories`); revision 26's text is kept
 *   only to recognise such a store (`IMPORT_FIDELITY_CATEGORIES_REVISION_26_SQL`).
 * - `import_fidelity_choices`: the one choice a review makes for its text boxes — `retain` (保留为文本框,
 *   the default) or `merge` (并入正文) — written with the review at commit (ADR 0086 §2).
 * - `staged_import_block_sources` and `staged_import_text_box_paragraphs`: which `w:p` of the staged
 *   file each staged block came from, and the paragraphs of its text boxes, so the choice can be made at
 *   review without reading the file again. They belong to the staged snapshot and go with it.
 * - `manuscript_block_sources`: written at commit for the Revision an import or reimport creates — which
 *   source paragraph every block came from (a body paragraph, or a paragraph of a merged text box) and
 *   the digest it had there, so an unedited block can be restored from its source paragraph (ADR 0086 §3).
 *
 * Nothing existing moves (ADR 0079 §1.1): the rebuild changes no row, and the four relations are added.
 * `EditorialStore.open` runs `initializeImportRetentionSchema` before the version is stamped; it is
 * shape-detected, so it does its work once.
 */

type SqlRow = Record<string, SQLOutputValue>;

/** `import_fidelity_categories` exactly as revisions 10 to 26 carried it: eight positions, three statuses. */
export const IMPORT_FIDELITY_CATEGORIES_REVISION_26_SQL = `CREATE TABLE import_fidelity_categories (
    fidelity_review_id TEXT NOT NULL REFERENCES import_fidelity_reviews(fidelity_review_id),
    category_key TEXT NOT NULL,
    display_label TEXT NOT NULL,
    item_count INTEGER NOT NULL CHECK(item_count >= 0),
    status TEXT NOT NULL CHECK(status IN ('preserved', 'degraded', 'unsupported')),
    detail TEXT NOT NULL,
    position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 8),
    PRIMARY KEY(fidelity_review_id, category_key),
    UNIQUE(fidelity_review_id, position)
  ) STRICT`;

/**
 * The widened relation of revision 27: a review parsed under `ai7-docx-fflate-saxes/2` has ten classes
 * and may say `retained`; one recorded under `/1` keeps its eight rows as they were.
 */
export const IMPORT_FIDELITY_CATEGORIES_SQL = `CREATE TABLE import_fidelity_categories (
  fidelity_review_id TEXT NOT NULL REFERENCES import_fidelity_reviews(fidelity_review_id),
  category_key TEXT NOT NULL,
  display_label TEXT NOT NULL,
  item_count INTEGER NOT NULL CHECK(item_count >= 0),
  status TEXT NOT NULL CHECK(status IN ('preserved', 'retained', 'degraded', 'unsupported')),
  detail TEXT NOT NULL,
  position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 10),
  PRIMARY KEY(fidelity_review_id, category_key),
  UNIQUE(fidelity_review_id, position)
) STRICT`;

/** The four relations revision 27 adds, in an order that creates every relation after the one it names. */
export const IMPORT_RETENTION_SCHEMA_SQL = {
  import_fidelity_choices: `CREATE TABLE import_fidelity_choices (
  fidelity_review_id TEXT NOT NULL REFERENCES import_fidelity_reviews(fidelity_review_id),
  category_key TEXT NOT NULL CHECK(category_key = 'text-boxes'),
  choice TEXT NOT NULL CHECK(choice IN ('retain', 'merge')),
  created_at TEXT NOT NULL,
  PRIMARY KEY(fidelity_review_id, category_key)
) STRICT`,
  staged_import_block_sources: `CREATE TABLE staged_import_block_sources (
  draft_id TEXT NOT NULL REFERENCES staged_import_snapshots(draft_id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK(position > 0),
  source_paragraph_index INTEGER NOT NULL CHECK(source_paragraph_index >= 0),
  PRIMARY KEY(draft_id, position),
  UNIQUE(draft_id, source_paragraph_index)
) STRICT`,
  staged_import_text_box_paragraphs: `CREATE TABLE staged_import_text_box_paragraphs (
  draft_id TEXT NOT NULL REFERENCES staged_import_snapshots(draft_id) ON DELETE CASCADE,
  box_ordinal INTEGER NOT NULL CHECK(box_ordinal > 0),
  box_paragraph_ordinal INTEGER NOT NULL CHECK(box_paragraph_ordinal > 0),
  anchor_paragraph_index INTEGER NOT NULL CHECK(anchor_paragraph_index >= 0),
  source_paragraph_index INTEGER NOT NULL CHECK(source_paragraph_index > anchor_paragraph_index),
  kind TEXT NOT NULL CHECK(kind IN ('title', 'heading', 'paragraph')),
  level INTEGER,
  text TEXT NOT NULL,
  digest TEXT NOT NULL CHECK(length(digest) = 64),
  grapheme_length INTEGER NOT NULL CHECK(grapheme_length > 0),
  PRIMARY KEY(draft_id, box_ordinal, box_paragraph_ordinal),
  UNIQUE(draft_id, source_paragraph_index)
) STRICT`,
  manuscript_block_sources: `CREATE TABLE manuscript_block_sources (
  revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
  block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
  source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
  source_part TEXT NOT NULL CHECK(source_part IN ('body', 'text-box')),
  source_paragraph_index INTEGER NOT NULL CHECK(source_paragraph_index >= 0),
  box_ordinal INTEGER CHECK(box_ordinal IS NULL OR box_ordinal > 0),
  box_paragraph_ordinal INTEGER CHECK(box_paragraph_ordinal IS NULL OR box_paragraph_ordinal > 0),
  source_paragraph_digest TEXT NOT NULL CHECK(length(source_paragraph_digest) = 64),
  created_at TEXT NOT NULL,
  PRIMARY KEY(revision_id, block_id),
  UNIQUE(revision_id, source_paragraph_index),
  CHECK((source_part = 'body') = (box_ordinal IS NULL)),
  CHECK((box_ordinal IS NULL) = (box_paragraph_ordinal IS NULL))
) STRICT`,
} as const;

/** The choice and the mapping are records of a committed import: appended once, never rewritten. */
export const IMPORT_RETENTION_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  (['import_fidelity_choices', 'manuscript_block_sources'] as const).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'IMPORT_RETENTION_RECORD_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'IMPORT_RETENTION_RECORD_IMMUTABLE');
    END`],
  ]),
);

/** The foreign keys of the four relations, in the exact-schema validator's own spelling. */
export const IMPORT_RETENTION_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  import_fidelity_choices: ['fidelity_review_id>import_fidelity_reviews.fidelity_review_id:NO ACTION/NO ACTION/NONE'],
  staged_import_block_sources: ['draft_id>staged_import_snapshots.draft_id:NO ACTION/CASCADE/NONE'],
  staged_import_text_box_paragraphs: ['draft_id>staged_import_snapshots.draft_id:NO ACTION/CASCADE/NONE'],
  manuscript_block_sources: [
    'block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
    'revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'source_version_id>source_versions.source_version_id:NO ACTION/NO ACTION/NONE',
  ],
};

/** Issue #1132's closed Word layer; the historical revision-27 relations keep their exact SQL. */
export const WORD_IMPORT_RETENTION_SCHEMA_SQL = {
  staged_word_revision_intakes: `CREATE TABLE staged_word_revision_intakes (
  draft_id TEXT PRIMARY KEY REFERENCES staged_import_snapshots(draft_id) ON DELETE CASCADE,
  source_digest TEXT NOT NULL CHECK(length(source_digest) = 64),
  compiler_identity TEXT NOT NULL,
  inventory_digest TEXT NOT NULL CHECK(length(inventory_digest) = 64),
  compatibility TEXT NOT NULL CHECK(compatibility IN ('ready', 'unsupported')),
  preview_reading TEXT CHECK(preview_reading IN ('rejected', 'accepted')),
  canonical_json TEXT NOT NULL CHECK(json_valid(canonical_json)),
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  reviewed_json TEXT CHECK(reviewed_json IS NULL OR json_valid(reviewed_json)),
  reviewed_sha256 TEXT CHECK(reviewed_sha256 IS NULL OR length(reviewed_sha256) = 64),
  CHECK((reviewed_json IS NULL) = (reviewed_sha256 IS NULL)),
  CHECK(compatibility <> 'ready' OR preview_reading IS NOT NULL)
) STRICT`,
  word_revision_sources: `CREATE TABLE word_revision_sources (
  source_version_id TEXT PRIMARY KEY REFERENCES source_versions(source_version_id),
  book_id TEXT NOT NULL REFERENCES books(book_id),
  object_digest TEXT NOT NULL REFERENCES content_objects(object_digest),
  parent_parser_identity TEXT NOT NULL,
  parent_source_pin_json TEXT NOT NULL CHECK(json_valid(parent_source_pin_json)),
  parent_source_pin_digest TEXT NOT NULL CHECK(length(parent_source_pin_digest) = 64),
  compiler_identity TEXT NOT NULL,
  extractor_identity TEXT NOT NULL,
  graph_json TEXT NOT NULL CHECK(json_valid(graph_json)),
  graph_digest TEXT NOT NULL CHECK(length(graph_digest) = 64)
) STRICT`,
  word_revision_imports: `CREATE TABLE word_revision_imports (
  commit_id TEXT PRIMARY KEY REFERENCES import_commits(commit_id),
  source_version_id TEXT NOT NULL REFERENCES word_revision_sources(source_version_id),
  book_id TEXT NOT NULL REFERENCES books(book_id),
  fidelity_review_id TEXT NOT NULL REFERENCES import_fidelity_reviews(fidelity_review_id),
  revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
  mode TEXT NOT NULL CHECK(mode IN ('suggestions', 'accepted-baseline')),
  canonical_json TEXT NOT NULL CHECK(json_valid(canonical_json)),
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  created_at TEXT NOT NULL,
  UNIQUE(revision_id)
) STRICT`,
  word_manuscript_source_segments: `CREATE TABLE word_manuscript_source_segments (
  revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
  block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
  segment_ordinal INTEGER NOT NULL CHECK(segment_ordinal > 0),
  source_version_id TEXT NOT NULL REFERENCES word_revision_sources(source_version_id),
  commit_id TEXT NOT NULL REFERENCES word_revision_imports(commit_id),
  canonical_json TEXT NOT NULL CHECK(json_valid(canonical_json)),
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  PRIMARY KEY(revision_id, block_id, segment_ordinal)
) STRICT`,
  word_tracked_edit_samples: `CREATE TABLE word_tracked_edit_samples (
  sample_id TEXT PRIMARY KEY CHECK(length(sample_id) = 68 AND substr(sample_id, 1, 4) = 'wts_'),
  book_id TEXT NOT NULL REFERENCES books(book_id),
  source_version_id TEXT NOT NULL REFERENCES word_revision_sources(source_version_id),
  template_key TEXT NOT NULL CHECK(length(template_key) = 64),
  canonical_json TEXT NOT NULL CHECK(json_valid(canonical_json)),
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  UNIQUE(book_id, source_version_id, template_key)
) STRICT`,
  word_tracked_edit_sample_imports: `CREATE TABLE word_tracked_edit_sample_imports (
  sample_id TEXT NOT NULL REFERENCES word_tracked_edit_samples(sample_id),
  commit_id TEXT NOT NULL REFERENCES word_revision_imports(commit_id),
  sample_digest TEXT NOT NULL CHECK(length(sample_digest) = 64),
  choice_digest TEXT NOT NULL CHECK(length(choice_digest) = 64),
  canonical_json TEXT NOT NULL CHECK(json_valid(canonical_json)),
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  captured_at TEXT NOT NULL,
  PRIMARY KEY(sample_id, commit_id)
) STRICT`,
  word_import_mark_sources: `CREATE TABLE word_import_mark_sources (
  commit_id TEXT NOT NULL REFERENCES word_revision_imports(commit_id),
  mark_id TEXT NOT NULL REFERENCES editorial_marks(mark_id),
  source_ordinal INTEGER NOT NULL CHECK(source_ordinal > 0),
  canonical_json TEXT NOT NULL CHECK(json_valid(canonical_json)),
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  PRIMARY KEY(commit_id, mark_id, source_ordinal)
) STRICT`,
} as const;

export const WORD_IMPORT_RETENTION_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(WORD_IMPORT_RETENTION_SCHEMA_SQL).filter((table) => table !== 'staged_word_revision_intakes').flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update BEFORE UPDATE ON ${table}
    BEGIN SELECT RAISE(ABORT, 'WORD_IMPORT_RECORD_IMMUTABLE'); END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete BEFORE DELETE ON ${table}
    BEGIN SELECT RAISE(ABORT, 'WORD_IMPORT_RECORD_IMMUTABLE'); END`],
  ]),
);

export const WORD_IMPORT_RETENTION_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  staged_word_revision_intakes: ['draft_id>staged_import_snapshots.draft_id:NO ACTION/CASCADE/NONE'],
  word_revision_sources: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'object_digest>content_objects.object_digest:NO ACTION/NO ACTION/NONE',
    'source_version_id>source_versions.source_version_id:NO ACTION/NO ACTION/NONE',
  ],
  word_revision_imports: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'commit_id>import_commits.commit_id:NO ACTION/NO ACTION/NONE',
    'fidelity_review_id>import_fidelity_reviews.fidelity_review_id:NO ACTION/NO ACTION/NONE',
    'revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'source_version_id>word_revision_sources.source_version_id:NO ACTION/NO ACTION/NONE',
  ],
  word_manuscript_source_segments: [
    'block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
    'commit_id>word_revision_imports.commit_id:NO ACTION/NO ACTION/NONE',
    'revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'source_version_id>word_revision_sources.source_version_id:NO ACTION/NO ACTION/NONE',
  ],
  word_tracked_edit_samples: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'source_version_id>word_revision_sources.source_version_id:NO ACTION/NO ACTION/NONE',
  ],
  word_tracked_edit_sample_imports: [
    'commit_id>word_revision_imports.commit_id:NO ACTION/NO ACTION/NONE',
    'sample_id>word_tracked_edit_samples.sample_id:NO ACTION/NO ACTION/NONE',
  ],
  word_import_mark_sources: [
    'commit_id>word_revision_imports.commit_id:NO ACTION/NO ACTION/NONE',
    'mark_id>editorial_marks.mark_id:NO ACTION/NO ACTION/NONE',
  ],
};

/** Refuse a partial or altered layer instead of healing a damaged schema around existing records. */
export function validateWordImportRetentionSchema(db: DatabaseSync): void {
  for (const [name, expected] of Object.entries({ ...WORD_IMPORT_RETENTION_SCHEMA_SQL, ...WORD_IMPORT_RETENTION_TRIGGER_SQL })) {
    const row = db.prepare('SELECT sql FROM sqlite_schema WHERE name = ?').get(name);
    requireRetention(row !== undefined && typeof row.sql === 'string' && canonicalTableSql(row.sql) === canonicalTableSql(expected),
      'SCHEMA_UNSUPPORTED', 'Word 修订导入层结构不完整或不兼容。');
  }
  for (const [name, expected] of Object.entries(WORD_IMPORT_RETENTION_FOREIGN_KEYS)) {
    const actual = db.prepare('SELECT * FROM pragma_foreign_key_list(?)').all(name).map((row) =>
      `${text(row.from)}>${text(row.table)}.${text(row.to)}:${text(row.on_update)}/${text(row.on_delete)}/${text(row.match)}`).sort();
    requireRetention(JSON.stringify(actual) === JSON.stringify([...expected].sort()), 'SCHEMA_UNSUPPORTED', 'Word 修订导入层引用结构无效。');
  }
}

/** Physical-stamp proof before backup/initialization: a predecessor can carry only an empty complete layer. */
export function validateWordImportRetentionVersion(db: DatabaseSync, allowsWordRecords: boolean): void {
  const tables = Object.keys(WORD_IMPORT_RETENTION_SCHEMA_SQL);
  const present = tables.filter((name) => db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(name) !== undefined);
  if (!allowsWordRecords && present.length === 0) return;
  validateWordImportRetentionSchema(db);
  requireRetention(allowsWordRecords || tables.every((table) => db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get() === undefined),
    'WORD_READER_STAMP_INVALID', 'Word 修订记录与数据库的原始版本标记不一致。');
}

/** Every committed row is reached by one actual source/import closure; no orphan is silently skipped by a join. */
export function validateWordImportRetentionClosure(db: DatabaseSync): void {
  validateWordImportRetentionSchema(db);
  const invalid = db.prepare(`SELECT 1 FROM word_revision_sources s
    LEFT JOIN source_versions p ON p.source_version_id = s.source_version_id
    WHERE p.source_version_id IS NULL OR p.book_id <> s.book_id OR p.object_digest <> s.object_digest
      OR NOT EXISTS (SELECT 1 FROM word_revision_imports i WHERE i.source_version_id = s.source_version_id)
    UNION ALL SELECT 1 FROM word_revision_imports i LEFT JOIN word_revision_sources s ON s.source_version_id = i.source_version_id
    WHERE s.source_version_id IS NULL OR s.book_id <> i.book_id
    UNION ALL SELECT 1 FROM word_manuscript_source_segments s LEFT JOIN word_revision_imports i ON i.commit_id = s.commit_id
    WHERE i.commit_id IS NULL OR s.revision_id <> i.revision_id OR s.source_version_id <> i.source_version_id
    UNION ALL SELECT 1 FROM word_tracked_edit_samples s LEFT JOIN word_revision_sources p ON p.source_version_id = s.source_version_id
    WHERE p.source_version_id IS NULL OR p.book_id <> s.book_id
      OR NOT EXISTS (SELECT 1 FROM word_tracked_edit_sample_imports i WHERE i.sample_id = s.sample_id)
    UNION ALL SELECT 1 FROM word_tracked_edit_sample_imports si
    LEFT JOIN word_tracked_edit_samples s ON s.sample_id = si.sample_id LEFT JOIN word_revision_imports i ON i.commit_id = si.commit_id
    WHERE s.sample_id IS NULL OR i.commit_id IS NULL OR s.book_id <> i.book_id OR s.source_version_id <> i.source_version_id
    UNION ALL SELECT 1 FROM word_import_mark_sources s LEFT JOIN word_revision_imports i ON i.commit_id = s.commit_id
    WHERE i.commit_id IS NULL LIMIT 1`).get();
  requireRetention(invalid === undefined, 'WORD_SOURCE_INVALID', 'Word 修订来源、导入、片段或样本存在不完整或跨图书的引用。');
}

/** Separate from revision 27: existing retention tables never cause the new layer to be skipped. */
export function initializeWordImportRetentionSchema(db: DatabaseSync): void {
  const existing = Object.keys(WORD_IMPORT_RETENTION_SCHEMA_SQL).filter((name) =>
    db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(name) !== undefined);
  if (existing.length > 0) {
    validateWordImportRetentionSchema(db);
    return;
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(WORD_IMPORT_RETENTION_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(WORD_IMPORT_RETENTION_TRIGGER_SQL)) db.exec(sql);
    validateWordImportRetentionSchema(db);
    requireRetention(db.prepare('PRAGMA foreign_key_check').all().length === 0, 'SCHEMA_MIGRATION_FAILED', 'Word 修订导入层引用校验失败。');
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Word import retention schema rollback failed.');
    }
    throw error;
  }
}

export class ImportRetentionError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ImportRetentionError';
  }
}

function requireRetention(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new ImportRetentionError(code, message);
}

function integer(value: SQLOutputValue | undefined): number {
  requireRetention(typeof value === 'number' && Number.isSafeInteger(value), 'STORE_CORRUPT', '导入保留记录数字无效。');
  return value;
}

function text(value: SQLOutputValue | undefined): string {
  requireRetention(typeof value === 'string' && value.isWellFormed(), 'STORE_CORRUPT', '导入保留记录文本无效。');
  return value;
}

/** A relation's text as the exact-schema validator compares it: no identifier quoting, no whitespace, no case. */
function canonicalTableSql(sql: string): string {
  return sql.replace(/["`[\]]/gu, '').replace(/\s+/gu, '').toLowerCase();
}

/**
 * Which of its two texts `import_fidelity_categories` holds: revision 26's, or revision 27's widened
 * one. No other text was ever created, so any other is refused.
 */
export function importFidelityCategoriesShape(db: DatabaseSync): 'revision-26' | 'current' {
  const row = db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'import_fidelity_categories'").get() as SqlRow | undefined;
  const sql = row === undefined ? '' : canonicalTableSql(text(row.sql));
  if (sql === canonicalTableSql(IMPORT_FIDELITY_CATEGORIES_SQL)) return 'current';
  requireRetention(sql === canonicalTableSql(IMPORT_FIDELITY_CATEGORIES_REVISION_26_SQL), 'SCHEMA_MIGRATION_FAILED', '导入保真分类表结构不兼容。');
  return 'revision-26';
}

/**
 * Revision 26 → 27 for `import_fidelity_categories`: rebuilt from its widened text with every row
 * copied byte for byte, rowid included, in rowid order, and every index or trigger on it re-armed from
 * its own text (revision 26 created none; the indexes behind its keys come back with the table). It runs
 * in the caller's transaction with foreign keys off; the caller checks every reference before it commits.
 */
export function widenImportFidelityCategories(db: DatabaseSync): void {
  requireRetention(
    db.isTransaction && integer((db.prepare('PRAGMA foreign_keys').get() as SqlRow).foreign_keys) === 0,
    'SCHEMA_MIGRATION_FAILED',
    '导入保真分类表只能在停用引用校验的事务中重建。',
  );
  const columnsOf = (): string => (db.prepare("SELECT name FROM pragma_table_info('import_fidelity_categories') ORDER BY cid").all() as SqlRow[])
    .map((row) => text(row.name)).join(', ');
  const rows = (): number => integer((db.prepare('SELECT count(*) total FROM import_fidelity_categories').get() as SqlRow).total);
  const columns = columnsOf();
  const before = rows();
  const attached = (db.prepare(
    "SELECT sql FROM sqlite_schema WHERE tbl_name = 'import_fidelity_categories' AND type IN ('index', 'trigger') AND sql IS NOT NULL ORDER BY type, name",
  ).all() as SqlRow[]).map((row) => text(row.sql));
  db.exec('CREATE TEMP TABLE migrate_import_fidelity_categories AS SELECT rowid AS migrate_rowid, * FROM import_fidelity_categories');
  db.exec('DROP TABLE import_fidelity_categories');
  db.exec(IMPORT_FIDELITY_CATEGORIES_SQL);
  requireRetention(columnsOf() === columns, 'SCHEMA_MIGRATION_FAILED', '导入保真分类表迁移前后的列不一致。');
  db.exec(`INSERT INTO import_fidelity_categories(rowid, ${columns})
    SELECT migrate_rowid, ${columns} FROM temp.migrate_import_fidelity_categories ORDER BY migrate_rowid`);
  db.exec('DROP TABLE temp.migrate_import_fidelity_categories');
  for (const sql of attached) db.exec(sql);
  requireRetention(rows() === before, 'SCHEMA_MIGRATION_FAILED', '导入保真分类表迁移未保留全部记录。');
}

/**
 * Revision 27, once per store and in one transaction: `import_fidelity_categories` is rebuilt while it
 * holds revision 26's exact text, with foreign keys off around the transaction; then the four relations
 * are created, and every reference is checked before anything commits. Shape-detected: once
 * `import_fidelity_choices` exists this has been done.
 */
export function initializeImportRetentionSchema(db: DatabaseSync): void {
  const existing = db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'import_fidelity_choices'").get();
  if (existing !== undefined) return;
  const widen = importFidelityCategoriesShape(db) === 'revision-26';
  const foreignKeys = (): number => integer((db.prepare('PRAGMA foreign_keys').get() as SqlRow).foreign_keys);
  const restoreForeignKeys = widen && foreignKeys() === 1;
  if (widen) {
    db.exec('PRAGMA foreign_keys = OFF');
    requireRetention(foreignKeys() === 0, 'SCHEMA_MIGRATION_FAILED', '无法暂时停用引用校验以迁移数据库。');
  }
  try {
    db.exec('BEGIN IMMEDIATE');
    try {
      if (widen) widenImportFidelityCategories(db);
      for (const sql of Object.values(IMPORT_RETENTION_SCHEMA_SQL)) db.exec(sql);
      for (const sql of Object.values(IMPORT_RETENTION_TRIGGER_SQL)) db.exec(sql);
      requireRetention(db.prepare('PRAGMA foreign_key_check').all().length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库引用校验失败。');
      db.exec('COMMIT');
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], 'Import retention schema rollback failed.');
      }
      throw error;
    }
  } finally {
    if (restoreForeignKeys) {
      db.exec('PRAGMA foreign_keys = ON');
      requireRetention(foreignKeys() === 1, 'SCHEMA_MIGRATION_FAILED', '无法恢复引用校验。');
    }
  }
}

/** One paragraph of a staged text box, as `staged_import_text_box_paragraphs` holds it. */
export interface StagedTextBoxParagraph {
  boxOrdinal: number;
  boxParagraphOrdinal: number;
  anchorParagraphIndex: number;
  sourceParagraphIndex: number;
  kind: ManuscriptBlockProjection['kind'];
  level: number | null;
  text: string;
  digest: string;
  graphemeLength: number;
}

/** The staged sources of one parse: the source paragraph of every block, in block order, and every box. */
export interface StagedImportSources {
  blockSourceIndexes: ReadonlyArray<number>;
  textBoxes: ReadonlyArray<ParsedTextBox>;
}

function flattenTextBoxes(textBoxes: ReadonlyArray<ParsedTextBox>): StagedTextBoxParagraph[] {
  return textBoxes.flatMap((box) => box.paragraphs.map((paragraph) => ({
    boxOrdinal: box.boxOrdinal,
    boxParagraphOrdinal: paragraph.boxParagraphOrdinal,
    anchorParagraphIndex: box.anchorParagraphIndex,
    sourceParagraphIndex: paragraph.sourceParagraphIndex,
    kind: paragraph.kind,
    level: paragraph.level,
    text: paragraph.text,
    digest: paragraph.digest,
    graphemeLength: paragraph.graphemeLength,
  })));
}

/**
 * Stage the sources of a parse beside the staged blocks it produced, in the caller's transaction. The
 * source indexes are the blocks' own, one per staged position; the text-box paragraphs are every
 * non-empty paragraph of every box.
 */
export function stageImportSources(db: DatabaseSync, draftId: string, sources: StagedImportSources): void {
  const insertBlock = db.prepare(
    'INSERT INTO staged_import_block_sources(draft_id, position, source_paragraph_index) VALUES (?, ?, ?)',
  );
  sources.blockSourceIndexes.forEach((index, offset) => insertBlock.run(draftId, offset + 1, index));
  const insertParagraph = db.prepare(
    `INSERT INTO staged_import_text_box_paragraphs(
       draft_id, box_ordinal, box_paragraph_ordinal, anchor_paragraph_index, source_paragraph_index,
       kind, level, text, digest, grapheme_length
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const paragraph of flattenTextBoxes(sources.textBoxes)) {
    insertParagraph.run(
      draftId, paragraph.boxOrdinal, paragraph.boxParagraphOrdinal, paragraph.anchorParagraphIndex,
      paragraph.sourceParagraphIndex, paragraph.kind, paragraph.level, paragraph.text, paragraph.digest,
      paragraph.graphemeLength,
    );
  }
}

/** The source paragraph of every staged block of a draft, in position order. */
export function stagedBlockSourceIndexes(db: DatabaseSync, draftId: string): number[] {
  const rows = db.prepare(
    'SELECT position, source_paragraph_index FROM staged_import_block_sources WHERE draft_id = ? ORDER BY position',
  ).all(draftId) as SqlRow[];
  return rows.map((row, index) => {
    requireRetention(integer(row.position) === index + 1, 'SNAPSHOT_INCOMPLETE', '暂存内容块来源段落不连续。');
    return integer(row.source_paragraph_index);
  });
}

/**
 * A block's digest, exactly as the parser writes it: the canonical JSON of its kind, level and text, whose
 * keys are already in canonical order.
 */
function blockDigest(kind: ManuscriptBlockProjection['kind'], level: number | null, value: string): string {
  return createHash('sha256').update(JSON.stringify({ kind, level, text: value })).digest('hex');
}

/** Every staged text-box paragraph of a draft, in document order. */
export function stagedTextBoxParagraphs(db: DatabaseSync, draftId: string): StagedTextBoxParagraph[] {
  const rows = db.prepare(
    `SELECT box_ordinal, box_paragraph_ordinal, anchor_paragraph_index, source_paragraph_index,
            kind, level, text, digest, grapheme_length
     FROM staged_import_text_box_paragraphs WHERE draft_id = ? ORDER BY source_paragraph_index`,
  ).all(draftId) as SqlRow[];
  return rows.map((row) => {
    const kind = text(row.kind) as ManuscriptBlockProjection['kind'];
    const level = row.level === null ? null : integer(row.level);
    const paragraph = {
      boxOrdinal: integer(row.box_ordinal),
      boxParagraphOrdinal: integer(row.box_paragraph_ordinal),
      anchorParagraphIndex: integer(row.anchor_paragraph_index),
      sourceParagraphIndex: integer(row.source_paragraph_index),
      kind,
      level,
      text: text(row.text),
      digest: text(row.digest),
      graphemeLength: integer(row.grapheme_length),
    };
    requireRetention(
      ((kind === 'title' && level === 1) || (kind === 'heading' && level !== null && level >= 1 && level <= 6) ||
        (kind === 'paragraph' && level === null)) &&
        blockDigest(kind, level, paragraph.text) === paragraph.digest,
      'SNAPSHOT_INCOMPLETE',
      '暂存文本框段落的结构、文字或摘要无法证明。',
    );
    return paragraph;
  });
}

/**
 * Whether a fresh parse of the staged file reproduces the staged sources exactly: the same source index
 * for every block, and the same text-box paragraphs, field for field.
 */
export function stagedImportSourcesMatch(db: DatabaseSync, draftId: string, sources: StagedImportSources): boolean {
  const staged = stagedBlockSourceIndexes(db, draftId);
  if (staged.length !== sources.blockSourceIndexes.length || staged.some((index, offset) => index !== sources.blockSourceIndexes[offset])) {
    return false;
  }
  const expected = flattenTextBoxes(sources.textBoxes).sort((left, right) => left.sourceParagraphIndex - right.sourceParagraphIndex);
  const actual = stagedTextBoxParagraphs(db, draftId);
  return actual.length === expected.length && actual.every((paragraph, index) => {
    const other = expected[index]!;
    return paragraph.boxOrdinal === other.boxOrdinal && paragraph.boxParagraphOrdinal === other.boxParagraphOrdinal &&
      paragraph.anchorParagraphIndex === other.anchorParagraphIndex &&
      paragraph.sourceParagraphIndex === other.sourceParagraphIndex && paragraph.kind === other.kind &&
      paragraph.level === other.level && paragraph.text === other.text && paragraph.digest === other.digest &&
      paragraph.graphemeLength === other.graphemeLength;
  });
}

/** The text-box choice a committed review recorded, or null when it recorded none. */
export function recordedTextBoxChoice(db: DatabaseSync, fidelityReviewId: string): TextBoxDisposition | null {
  const rows = db.prepare(
    "SELECT choice FROM import_fidelity_choices WHERE fidelity_review_id = ? AND category_key = 'text-boxes'",
  ).all(fidelityReviewId) as SqlRow[];
  if (rows.length === 0) return null;
  const choice = text(rows[0]!.choice);
  requireRetention(choice === 'retain' || choice === 'merge', 'STORE_CORRUPT', '文本框选择记录无效。');
  return choice;
}

/** Record a committed review's text-box choice, in the caller's transaction. */
export function recordTextBoxChoice(db: DatabaseSync, fidelityReviewId: string, choice: TextBoxDisposition, createdAt: string): void {
  db.prepare(
    "INSERT INTO import_fidelity_choices(fidelity_review_id, category_key, choice, created_at) VALUES (?, 'text-boxes', ?, ?)",
  ).run(fidelityReviewId, choice, createdAt);
}
