import { createHash } from 'node:crypto';
import { extname, isAbsolute, posix } from 'node:path';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import {
  MAX_BLOCK_CODE_UNITS,
  MAX_REIMPORT_RECORD_ITEMS,
  REIMPORT_GROUP_VERB_LABELS,
  acceptedSourceImportRetainedBoundaryLabels,
  fidelityStatusLabel,
  sourceImportRetainedBoundaryLabel,
  type BookHistoryCursor,
  type BookRecordPresentation,
  type BookSummaryCursor,
  type BookSummaryFilter,
  type BookSummaryPageProjection,
  type BookWorkOverviewProjection,
  type EditorialMarkKind,
  type FidelityCategoryProjection,
  type ImportDegradationDecisionReviewProjection,
  type ImportIdentityFindingProjection,
  type ImportStructureChoice,
  type ImportTargetSelection,
  type ManuscriptBlockProjection,
  type ManuscriptConversionProjection,
  type ManuscriptImportCommitProjection,
  type ManuscriptReimportCommitProjection,
  type ManuscriptReimportTargetSelection,
  type ManuscriptWindowProjection,
  type NewBookImportTargetChoiceId,
  type OriginalFileAccessProjection,
  type ReimportGroupVerb,
  type ReviewBeforeImportProjection,
  type ReviewBeforeSourceImportProjection,
  type SourceFormat,
  type SourceImportCommitProjection,
  type SourceImportRetainedBoundaryLabel,
  type SourceImportTargetSelection,
  type StagedImportProjection
} from '../shared/protocol.js';
import {
  type ReimportCheckpointBinding
} from './bounded-manuscript.js';
import {
  WORD_DOCX_PARSER_IDENTITY,
  buildFidelityReport,
  deriveImportFidelityPlan,
  withTextBoxDisposition,
  type FidelityConversionIdentity,
  type ImportFidelityPlan,
  type NativeDocxIntakeParse,
  type ParsedDocx,
  type ParsedWordDocx,
  type TextBoxDisposition,
  type WordTrackedCompilation
} from './docx.js';
import {
  readWordImportChoiceRecord,
  recordedTextBoxChoice,
  requireWordPreparedIntake,
  wordPreparedChoice,
  wordPreparedSelection,
  type StagedImportSources,
  type WordCompiledReading,
  type WordPreparedIntake
} from './import-retention.js';
import {
  editableImport,
  manuscriptObjectExtension
} from './manuscript-format.js';
import {
  recordedStructureChoice,
  reviewStructureField,
  stagedStructureField
} from './manuscript/import-structure.js';
import { type BuiltInWorkflowProfile } from './native-workflow-profile.js';
import {
  one,
  parseStoredJson
} from './store-operation-support.js';
import {
  DIGEST_PATTERN,
  StoreError,
  UUID_PATTERN,
  asNumber,
  asString,
  canonicalJson,
  requireStore,
  sha256,
  type SqlRow
} from './store-records.js';
import { type ConversionLoss } from './text-manuscript.js';

/**
 * What a Review Before Import says it will create and what it will not (ADR 0086 §3; Issue #411), moved out of `store.ts`
 * (Issue #1205, F-25) unchanged: the records an import makes, in the order the review lists them, and its named non-effects.
 */

const BASE_RECORDS_TO_CREATE = [
  '图书与稳定标识',
  '图书编辑维度集（8 项）',
  '源材料版本与来源记录',
  '导入保真审阅',
  '主稿件',
  '稿件分支',
  '稿件修订版 r1 与有序稳定内容块',
  // ADR 0086 §3: which source paragraph each block of r1 came from, so an unedited block can be
  // restored from it on export.
  '来源段落对应',
  '工作流程实例与精确方案版本绑定',
  '稿件导入记录',
] as const;
const NON_EFFECTS = [
  '不创建书系或书系成员关系',
  '不创建编辑学习准入决定',
  '不授予或执行模型提供方传输',
  '不创建发稿版本',
  '不创建公开发布许可或公开发布事实',
  '不导出、不发送、不交付、不发布',
  // ADR 0086 §3: the original stays whole with the Source Version; import reads it and changes nothing.
  '不修改所选原文件',
] as const;
const CLEAN_IMPORT_NON_EFFECT = '符合当前范围的导入不创建导入降级决定';
/** What an import that converts a file's comments and tracked changes also creates (Issue #411, D4). */
export function importedMarksRecord(count: number): string {
  return `来自文件作者的批注与修改建议 ${count} 条`;
}

export function recordsToCreate(
  plan: ImportFidelityPlan,
  targetKind: 'new-book' | 'existing-book' = 'new-book',
  word?: { reusedSourceVersionId: string | null; eligibleSamples: number },
): ReadonlyArray<string> {
  let base: ReadonlyArray<string> = targetKind === 'existing-book' ? BASE_RECORDS_TO_CREATE.slice(2) : BASE_RECORDS_TO_CREATE;
  if (word !== undefined) {
    // A Word intake maps blocks through its own source segments, never the one-paragraph rows, and may reuse
    // the exact same-byte Source Version this empty Book already retains instead of creating one.
    base = base.flatMap((record) => record === '源材料版本与来源记录' && word.reusedSourceVersionId !== null
      ? [`沿用本书已保留的同一来源版本 ${word.reusedSourceVersionId}（不新建来源版本）`]
      : record === '来源段落对应'
        ? ['Word 修订来源、导入选择与稿件来源片段对应',
          ...(word.eligibleSamples > 0 ? [`Word 修改样本、导入准入与本机学习信号 ${word.eligibleSamples} 条`] : [])]
        : [record]);
  }
  // The marks stand on r1's blocks, so they follow the block-source mapping.
  const sourcesIndex = base.indexOf(word === undefined ? '来源段落对应' : 'Word 修订来源、导入选择与稿件来源片段对应');
  const records = plan.importedMarks === 0
    ? base
    : [...base.slice(0, sourcesIndex + 1), importedMarksRecord(plan.importedMarks), ...base.slice(sourcesIndex + 1)];
  if (plan.degradations.length === 0) return records;
  const fidelityIndex = records.indexOf('导入保真审阅');
  return [...records.slice(0, fidelityIndex + 1), '导入降级决定', ...records.slice(fidelityIndex + 1)];
}

export function nonEffects(plan: ImportFidelityPlan): ReadonlyArray<string> {
  return plan.degradations.length === 0 ? [...NON_EFFECTS, CLEAN_IMPORT_NON_EFFECT] : NON_EFFECTS;
}

export interface ImportReviewRecordsHost {
  readonly authority: DatabaseSync;
  readWordIntake: (snapshot: DraftSnapshot) => { native: NativeDocxIntakeParse; original: Uint8Array; } | null;
  retentionCall: <T>(operation: () => T) => T;
  listBooks: (after: BookSummaryCursor | null, filter?: BookSummaryFilter | null) => BookSummaryPageProjection;
  boundedCall: <T>(operation: () => T) => T;
  getBookOverview: (bookId: string, historyCursor?: BookHistoryCursor | null) => BookWorkOverviewProjection;
  requireSameParser: (sourceVersionId: string, snapshot: DraftSnapshot) => void;
  wordIntakePlan: (snapshot: DraftSnapshot, target: ResolvedImportTarget, disposition: TextBoxDisposition, input: unknown, draftVersion: number) => WordIntakePlan | null;
  requireWordStagedReading: (snapshot: DraftSnapshot, word: WordIntakePlan) => void;
  readonly workflowProfile: BuiltInWorkflowProfile;
  reimportLandingWindow: (overview: BookWorkOverviewProjection, manuscriptId: string, branchId: string) => ManuscriptWindowProjection;
  readonly exactBookChoiceLabel: (title: string, bookId: string, internalNumber: string | null) => string;
  readonly stableUuid: (value: string) => string;
  readonly safeTitle: (input: string) => string;
  readonly nullableString: (value: SQLOutputValue | undefined) => string | null;
}

/**
   * The rows a Manuscript Reimport Record resolved and what its marks came to (Issue #412, plan slice S63): the first
   * `MAX_REIMPORT_RECORD_ITEMS` of each, the counts saying how many there were. A record made before the chapter-level
   * comparison has neither.
   */
export function reimportRecordResolutions(host: ImportReviewRecordsHost, reimportRecordId: string): Pick<Extract<BookRecordPresentation, { kind: 'manuscript-reimport-record' }>, 'groups' | 'markOutcomes'> {
    const groupCount = one(host.authority.prepare(
      `SELECT count(*) total FROM manuscript_reimport_groups g
       JOIN manuscript_reimport_records r ON r.comparison_id = g.comparison_id WHERE r.reimport_record_id = ?`,
    ).all(reimportRecordId) as SqlRow[], 'BOOK_RECORD_GRAPH_INVALID', '稿件重新导入记录的对应行无法读取。');
    const groups = (host.authority.prepare(
      `SELECT g.ordinal, g.chapter_label, g.current_from, g.current_to, g.staged_from, g.staged_to, gr.verb
       FROM manuscript_reimport_groups g
       JOIN manuscript_reimport_records r ON r.comparison_id = g.comparison_id
       JOIN manuscript_reimport_group_resolutions gr ON gr.group_id = g.group_id
       WHERE r.reimport_record_id = ? ORDER BY g.ordinal LIMIT ${MAX_REIMPORT_RECORD_ITEMS}`,
    ).all(reimportRecordId) as SqlRow[]).map((row) => {
      const verb = asString(row.verb) as ReimportGroupVerb;
      return {
        ordinal: asNumber(row.ordinal),
        verb,
        verbLabel: REIMPORT_GROUP_VERB_LABELS[verb],
        chapterLabel: row.chapter_label === null ? null : asString(row.chapter_label),
        currentFrom: row.current_from === null ? null : asNumber(row.current_from),
        currentTo: row.current_to === null ? null : asNumber(row.current_to),
        stagedFrom: row.staged_from === null ? null : asNumber(row.staged_from),
        stagedTo: row.staged_to === null ? null : asNumber(row.staged_to),
      };
    });
    const counts = one(host.authority.prepare(
      `SELECT count(CASE WHEN outcome = 'followed' THEN 1 END) followed, count(CASE WHEN outcome = 'unfollowed' THEN 1 END) unfollowed
       FROM manuscript_reimport_mark_outcomes WHERE reimport_record_id = ?`,
    ).all(reimportRecordId) as SqlRow[], 'BOOK_RECORD_GRAPH_INVALID', '稿件重新导入记录的标记结果无法读取。');
    const unfollowed = (host.authority.prepare(
      `SELECT mark_id, kind, words, from_position FROM manuscript_reimport_mark_outcomes
       WHERE reimport_record_id = ? AND outcome = 'unfollowed' ORDER BY from_position, mark_id LIMIT ${MAX_REIMPORT_RECORD_ITEMS}`,
    ).all(reimportRecordId) as SqlRow[]).map((row) => ({
      markId: asString(row.mark_id),
      kind: asString(row.kind) as EditorialMarkKind,
      words: asString(row.words),
      fromPosition: asNumber(row.from_position),
    }));
    return {
      groups: { count: asNumber(groupCount.total), items: groups },
      markOutcomes: { followed: asNumber(counts.followed), unfollowed: asNumber(counts.unfollowed), items: unfollowed },
    };
  }

export function reimportRecordPresentations(host: ImportReviewRecordsHost, bookId: string, recordIds: ReadonlyArray<string>): BookRecordPresentation[] {
    if (recordIds.length === 0) return [];
    const rows = host.authority.prepare(
      `SELECT rr.*, sv.display_name, sv.format, sv.source_digest, sv.content_digest, sv.structure_digest,
              sv.parser_identity, sv.working_object_digest, sv.converter_identity,
              co.byte_length source_bytes, sp.acquisition_path, sp.locality,
              fr.outcome fidelity_outcome, fr.review_digest fidelity_review_digest,
              dd.decision degradation_decision
       FROM manuscript_reimport_records rr
       JOIN source_versions sv ON sv.source_version_id = rr.source_version_id AND sv.book_id = rr.book_id
       JOIN content_objects co ON co.object_digest = sv.object_digest
       JOIN source_provenance sp ON sp.provenance_id = rr.provenance_id AND sp.source_version_id = rr.source_version_id
       JOIN import_fidelity_reviews fr
         ON fr.fidelity_review_id = rr.fidelity_review_id AND fr.source_version_id = rr.source_version_id
       LEFT JOIN import_degradation_decisions dd
         ON dd.degradation_decision_id = rr.degradation_decision_id
        AND dd.fidelity_review_id = rr.fidelity_review_id
       WHERE rr.book_id = ? AND rr.reimport_record_id IN (${recordIds.map(() => '?').join(', ')})
       ORDER BY rr.imported_at, rr.reimport_record_id`,
    ).all(bookId, ...recordIds) as SqlRow[];
    const records: BookRecordPresentation[] = [];
    const presentedSources = new Set<string>();
    for (const row of rows) {
      const sourceVersionId = asString(row.source_version_id);
      const provenanceId = asString(row.provenance_id);
      const resultKind = asString(row.result_kind) as 'changed' | 'no-change';
      const resultLabel = asString(row.result_label) as '稿件已重新导入' | '未发现稿件变化';
      const lineageStatus = asString(row.lineage_status) as 'verified' | 'unconfirmed';
      const lineageSourceVersionId = row.lineage_source_version_id === null
        ? null
        : asString(row.lineage_source_version_id);
      const comparisonKind = asString(row.comparison_kind) as 'three-way' | 'two-way';
      const fidelityReviewId = asString(row.fidelity_review_id);
      const sourceConversion = readConversionColumns(
        row,
        requireSourceFormat(asString(row.format)),
        '来源版本的转换记录不完整。',
      );
      const { categories: fidelityCategories, plan: fidelityPlan } = persistedFidelityPlan(host,
        fidelityReviewId,
        asString(row.source_digest),
        asNumber(row.source_bytes),
        sourceConversion,
        asString(row.parser_identity),
        'BOOK_RECORD_GRAPH_INVALID',
        '稿件重新导入保真与降级证据不完整。',
      );
      requireStore(fidelityPlan !== undefined && fidelityPlan.outcome === asString(row.fidelity_outcome) &&
        ((fidelityPlan.degradations.length === 0 && row.degradation_decision_id === null && row.degradation_decision === null) ||
          (fidelityPlan.degradations.length > 0 && row.degradation_decision_id !== null &&
            row.degradation_decision === canonicalDegradationDecision(fidelityPlan))),
      'BOOK_RECORD_GRAPH_INVALID', '稿件重新导入保真与降级证据不完整。');
      const recordDigest = sha256(canonicalJson({
        schema: MANUSCRIPT_REIMPORT_RECORD_SCHEMA,
        reimportRecordId: asString(row.reimport_record_id),
        commitId: asString(row.commit_id),
        bookId: asString(row.book_id),
        manuscriptId: asString(row.manuscript_id),
        branchId: asString(row.branch_id),
        sourceVersionId,
        provenanceId,
        previousRevisionId: asString(row.previous_revision_id),
        resultingRevisionId: row.resulting_revision_id === null ? null : asString(row.resulting_revision_id),
        resultKind,
        resultLabel,
        lineageStatus,
        lineageSourceVersionId,
        comparisonKind,
        comparisonDigest: asString(row.comparison_digest),
        resolutionDigest: asString(row.resolution_digest),
        fidelityReviewId,
        degradationDecisionId: row.degradation_decision_id === null ? null : asString(row.degradation_decision_id),
        importedAt: asString(row.imported_at),
      }));
      requireStore(
        (resultKind === 'changed' || resultKind === 'no-change') &&
          (lineageStatus === 'verified' || lineageStatus === 'unconfirmed') &&
          (comparisonKind === 'three-way' || comparisonKind === 'two-way') &&
          asString(row.acquisition_path) === 'native-file-picker' && asString(row.locality) === 'local-provider-free' &&
          recordDigest === asString(row.record_digest),
        'BOOK_RECORD_GRAPH_INVALID',
        '稿件重新导入记录图或摘要无效。',
      );
      if (!presentedSources.has(sourceVersionId)) {
        // A reimport compares parsed blocks, so its Source Version always carries a whole parse.
        requireStore(
          row.parser_identity !== null && row.content_digest !== null && row.structure_digest !== null,
          'BOOK_RECORD_GRAPH_INVALID',
          '稿件重新导入的来源版本缺少本地解析身份。',
        );
        records.push({
          kind: 'source',
          label: '来源版本与来源记录',
          sourceVersionId,
          provenanceId,
          bookId,
          displayName: asString(row.display_name),
          format: requireSourceFormat(asString(row.format)),
          sourceDigest: asString(row.source_digest),
          contentDigest: asString(row.content_digest),
          structureDigest: asString(row.structure_digest),
          parserIdentity: asString(row.parser_identity),
          workingObjectDigest: sourceConversion === null ? null : asString(row.working_object_digest),
          converterIdentity: sourceConversion === null ? null : sourceConversion.converterIdentity,
          acquisitionPath: 'native-file-picker',
          locality: 'local-provider-free',
        });
        presentedSources.add(sourceVersionId);
      }
      records.push({
        kind: 'manuscript-reimport-record',
        label: '稿件重新导入记录',
        reimportRecordId: asString(row.reimport_record_id),
        commitId: asString(row.commit_id),
        bookId,
        manuscriptId: asString(row.manuscript_id),
        sourceVersionId,
        provenanceId,
        previousRevisionId: asString(row.previous_revision_id),
        resultingRevisionId: row.resulting_revision_id === null ? null : asString(row.resulting_revision_id),
        resultKind,
        resultLabel,
        lineageStatus,
        lineageLabel: lineageStatus === 'verified' ? '来源关系已确认' : '来源关系未确认',
        lineageSourceVersionId,
        comparisonKind,
        comparisonDigest: asString(row.comparison_digest),
        resolutionDigest: asString(row.resolution_digest),
        fidelityReviewId,
        fidelityOutcome: fidelityPlan.outcome,
        fidelityCategories,
        degradationDecisionId: row.degradation_decision_id === null ? null : asString(row.degradation_decision_id),
        degradationDecision: row.degradation_decision_id === null
          ? null
          : { summaryLabel: '含已接受的降级', acceptedItems: fidelityPlan.degradations },
        ...reimportRecordResolutions(host, asString(row.reimport_record_id)),
        recordDigest,
        importedAt: asString(row.imported_at),
      });
    }
    return records;
  }

export function sourceImportRecordPresentations(host: ImportReviewRecordsHost, bookId: string, recordIds: ReadonlyArray<string>): BookRecordPresentation[] {
    if (recordIds.length === 0) return [];
    const rows = host.authority.prepare(
      `SELECT sir.source_import_record_id, sir.commit_id, sir.book_id, sir.source_version_id,
              sir.provenance_id, sir.target_kind, sir.source_version_disposition, sir.retained_boundary_json,
              sir.named_non_effects_json, sir.record_digest, sir.imported_at,
              sv.display_name, sv.format, sv.source_digest, sv.content_digest, sv.structure_digest,
              sv.parser_identity, sv.working_object_digest, sv.converter_identity,
              co.byte_length, sp.acquisition_path, sp.locality,
              sp.sanitized_identity
       FROM source_import_records sir
       JOIN source_versions sv
         ON sv.source_version_id = sir.source_version_id AND sv.book_id = sir.book_id
       JOIN content_objects co ON co.object_digest = sv.object_digest
       JOIN source_provenance sp
         ON sp.provenance_id = sir.provenance_id AND sp.source_version_id = sir.source_version_id
       WHERE sir.book_id = ? AND sir.source_import_record_id IN (${recordIds.map(() => '?').join(', ')})
       ORDER BY sir.imported_at, sir.source_import_record_id`,
    ).all(bookId, ...recordIds) as SqlRow[];
    const records: BookRecordPresentation[] = [];
    const presentedSources = new Set<string>();
    for (const row of rows) {
      const sourceVersionId = asString(row.source_version_id);
      const provenanceId = asString(row.provenance_id);
      const disposition = asString(row.source_version_disposition);
      const targetKind = asString(row.target_kind);
      requireStore(
        (targetKind === 'new-book' || targetKind === 'existing-book') &&
          (disposition === 'created' || disposition === 'reused-same-book') &&
          asString(row.acquisition_path) === 'native-file-picker' && asString(row.locality) === 'local-provider-free',
        'BOOK_RECORD_GRAPH_INVALID',
        '来源导入记录图不完整。',
      );
      const retained = parseStoredJson(asString(row.retained_boundary_json), '来源导入保留边界无效。');
      const namedNonEffects = parseStoredJson(asString(row.named_non_effects_json), '来源导入非影响记录无效。');
      requireStore(
        retained !== null && typeof retained === 'object' && !Array.isArray(retained) &&
          Array.isArray(namedNonEffects) && namedNonEffects.every((item) => typeof item === 'string') &&
          canonicalJson(namedNonEffects) === canonicalJson(SOURCE_IMPORT_NON_EFFECTS),
        'BOOK_RECORD_GRAPH_INVALID',
        '来源导入保留边界或非影响记录不完整。',
      );
      const boundary = retained as Record<string, unknown>;
      // A Source Version is either wholly parsed or wholly unparsed, and its record says which.
      const parserIdentity = row.parser_identity === null ? null : asString(row.parser_identity);
      const contentDigest = row.content_digest === null ? null : asString(row.content_digest);
      const structureDigest = row.structure_digest === null ? null : asString(row.structure_digest);
      const format = requireSourceFormat(asString(row.format));
      requireStore(
        boundary.kind === 'complete-local-file' &&
          acceptedSourceImportRetainedBoundaryLabels(format, parserIdentity !== null).some((label) => label === boundary.label) &&
          boundary.format === format && boundary.displayName === asString(row.sanitized_identity) &&
          boundary.sourceSha256 === asString(row.source_digest) &&
          (boundary.contentDigest ?? null) === contentDigest &&
          (boundary.structureDigest ?? null) === structureDigest &&
          typeof boundary.sourceBytes === 'number' && Number.isSafeInteger(boundary.sourceBytes) &&
          boundary.sourceBytes === asNumber(row.byte_length),
        'BOOK_RECORD_GRAPH_INVALID',
        '来源导入保留边界与来源版本不一致。',
      );
      const recordDigest = sha256(canonicalJson({
        schema: SOURCE_IMPORT_RECORD_SCHEMA,
        sourceImportRecordId: asString(row.source_import_record_id),
        commitId: asString(row.commit_id),
        bookId: asString(row.book_id),
        sourceVersionId,
        provenanceId,
        targetKind,
        sourceVersionDisposition: disposition,
        retainedBoundary: retained,
        namedNonEffects,
        importedAt: asString(row.imported_at),
      }));
      requireStore(recordDigest === asString(row.record_digest), 'BOOK_RECORD_GRAPH_INVALID', '来源导入记录摘要无效。');
      if (!presentedSources.has(sourceVersionId)) {
        const conversion = readConversionColumns(row, format, '来源版本的转换记录不完整。');
        records.push({
          kind: 'source',
          label: '来源版本与来源记录',
          sourceVersionId,
          provenanceId,
          bookId,
          displayName: asString(row.display_name),
          format,
          sourceDigest: asString(row.source_digest),
          contentDigest,
          structureDigest,
          parserIdentity,
          workingObjectDigest: conversion === null ? null : asString(row.working_object_digest),
          converterIdentity: conversion === null ? null : conversion.converterIdentity,
          acquisitionPath: 'native-file-picker',
          locality: 'local-provider-free',
        });
        presentedSources.add(sourceVersionId);
      }
      records.push({
        kind: 'source-import-record',
        label: '来源导入记录',
        sourceImportRecordId: asString(row.source_import_record_id),
        commitId: asString(row.commit_id),
        bookId,
        sourceVersionId,
        provenanceId,
        targetKind,
        sourceVersionDisposition: disposition,
        retainedBoundary: {
          kind: 'complete-local-file',
          label: boundary.label as SourceImportRetainedBoundaryLabel,
          format,
          displayName: asString(row.sanitized_identity),
          sourceSha256: asString(row.source_digest),
          sourceBytes: boundary.sourceBytes,
          contentDigest,
          structureDigest,
        },
        namedNonEffects: namedNonEffects as string[],
        recordDigest,
        importedAt: asString(row.imported_at),
      });
    }
    return records;
  }

export function reimportLineageSourceVersionPage(host: ImportReviewRecordsHost, bookId: string, after: string | null): {
    items: string[];
    previousCursor: string | null;
    nextCursor: string | null;
  } {
    const rows = (host.authority.prepare(
      `SELECT source_version_id FROM (
         SELECT mir.source_version_id
         FROM manuscript_import_records mir
         WHERE mir.book_id = ?
         UNION
         SELECT rr.source_version_id
         FROM manuscript_reimport_records rr
         WHERE rr.book_id = ? AND
           ((rr.result_kind = 'changed' AND rr.resulting_revision_id IS NOT NULL) OR rr.result_kind = 'no-change')
       ) ${after === null ? '' : 'WHERE source_version_id < ?'}
       ORDER BY source_version_id DESC LIMIT ${REIMPORT_LINEAGE_CHOICE_LIMIT + 1}`,
    ).all(...(after === null ? [bookId, bookId] : [bookId, bookId, after])) as SqlRow[]);
    const items = rows.slice(0, REIMPORT_LINEAGE_CHOICE_LIMIT).map((row) => asString(row.source_version_id));
    const previousRows = after === null ? [] : host.authority.prepare(
      `SELECT source_version_id FROM (
         SELECT mir.source_version_id FROM manuscript_import_records mir WHERE mir.book_id = ?
         UNION
         SELECT rr.source_version_id FROM manuscript_reimport_records rr
         WHERE rr.book_id = ? AND
           ((rr.result_kind = 'changed' AND rr.resulting_revision_id IS NOT NULL) OR rr.result_kind = 'no-change')
       ) WHERE source_version_id > ? ORDER BY source_version_id ASC LIMIT ${REIMPORT_LINEAGE_CHOICE_LIMIT}`,
    ).all(bookId, bookId, after) as SqlRow[];
    return {
      items,
      previousCursor: previousRows.length === REIMPORT_LINEAGE_CHOICE_LIMIT
        ? asString(previousRows.at(-1)!.source_version_id)
        : null,
      nextCursor: rows.length > REIMPORT_LINEAGE_CHOICE_LIMIT ? items.at(-1)! : null,
    };
  }

export function stagedProjection(host: ImportReviewRecordsHost, snapshot: DraftSnapshot): StagedImportProjection {
    const wordEvidence = host.readWordIntake(snapshot);
    const native = wordEvidence?.native;
    const wordTrackedChanges: StagedImportProjection['wordTrackedChanges'] = native === undefined ? undefined : native.kind === 'word'
      ? { compatibility: 'ready', previewReading: native.word.previewReading,
          readings: { rejected: { usable: native.word.readings.rejected.usable, blockCount: native.word.readings.rejected.blocks.length },
            accepted: { usable: native.word.readings.accepted.usable, blockCount: native.word.readings.accepted.blocks.length } },
          savedChoice: host.retentionCall(() => wordPreparedChoice(host.authority, snapshot.draftId)) }
      : { compatibility: 'unsupported', reasonCodes: [...new Set(native.word?.reasons.map((reason) => reason.code) ?? [])],
          locationCount: native.word?.reasons.length ?? 0 };
    const identityFindings = recordOperations.identityFindings(host, snapshot);
    const targetChoice = newBookTargetChoice(identityFindings);
    const bookPage = host.listBooks(null);
    const existingBooks = bookPage.items.map((book) => {
      return {
        kind: 'existing-book' as const,
        id: `existing-book:${book.bookId}`,
        bookId: book.bookId,
        label: host.exactBookChoiceLabel(book.title, book.bookId, book.internalNumber),
        internalNumber: book.internalNumber,
        manuscriptState: book.manuscriptState,
        reimportLineageSourceVersionIds: book.reimportLineageSourceVersionIds,
        reimportLineagePageAfter: null,
        reimportLineagePreviousCursor: null,
        reimportLineageNextCursor: book.reimportLineageNextCursor,
        selected: false as const,
      };
    });
    return {
      draftId: snapshot.draftId,
      draftVersion: snapshot.version,
      source: {
        displayName: snapshot.displayName,
        format: snapshot.sourceFormat,
        sourceSha256: snapshot.sourceDigest,
        sourceBytes: snapshot.sourceBytes,
        provenanceLabel: '本机文件选择器 · 本地解析 · 未联网',
        conversion: snapshot.conversion,
        workingObjectSha256: snapshot.workingObjectDigest,
      },
      editableImport: editableImport(snapshot.sourceFormat),
      titleSuggestion: { value: snapshot.titleSuggestion, sourceLabel: snapshot.titleSource },
      identityFindings,
      targetChoices: [targetChoice, ...existingBooks],
      nextBookCursor: bookPage.nextCursor,
      fidelity: snapshot.fidelity,
      detectedBlockCount: snapshot.blockCount,
      ...host.boundedCall(() => stagedStructureField(host.authority, snapshot.draftId, snapshot.parserIdentity !== WORD_DOCX_PARSER_IDENTITY)),
      ...(wordTrackedChanges === undefined ? {} : { wordTrackedChanges }),
    };
  }

export function emptyBookImportTarget(host: ImportReviewRecordsHost, bookId: string): {
    bookId: string;
    stableIdentity: string;
    title: string;
    internalNumber: string | null;
    dimensionSetId: string;
    label: string;
    bookStateDigest: string;
  } {
    const overview = host.getBookOverview(bookId);
    requireStore(overview.manuscriptState.state === 'empty', 'BOOK_ALREADY_POPULATED', '所选图书已有稿件，不能导入首份稿件。');
    const bookRecord = overview.records[0];
    requireStore(bookRecord?.kind === 'book', 'BOOK_RECORD_GRAPH_INVALID', '所选图书记录不完整。');
    const bookStateDigest = sha256(canonicalJson({
      schema: 'ai7.empty-book-import-target/1',
      book: overview.book,
      dimensionSet: {
        dimensionSetId: bookRecord.dimensionSetId,
        definitionDigest: bookRecord.dimensionSetDigest,
        profileId: BASELINE_EDITORIAL_DIMENSION_SET.profileId,
        profileVersion: BASELINE_EDITORIAL_DIMENSION_SET.profileVersion,
        weightSemantics: BASELINE_EDITORIAL_DIMENSION_SET.weightSemantics,
        dimensions: EDITORIAL_DIMENSIONS,
      },
      manuscriptState: 'empty',
    }));
    return {
      bookId,
      stableIdentity: overview.book.stableIdentity,
      title: overview.book.title,
      internalNumber: overview.book.internalNumber,
      dimensionSetId: bookRecord.dimensionSetId,
      label: host.exactBookChoiceLabel(overview.book.title, bookId, overview.book.internalNumber),
      bookStateDigest,
    };
  }

export function bookSourceImportTarget(host: ImportReviewRecordsHost, bookId: string, sourceDigest: string): Omit<
    Extract<ResolvedSourceImportTarget, { kind: 'existing-book' }>,
    'choiceId' | 'sourceVersionDisposition' | 'reuseSourceVersionId'
  > & { exactSourceVersionId: string | null } {
    const overview = host.getBookOverview(bookId);
    const bookRecord = overview.records[0];
    requireStore(bookRecord?.kind === 'book', 'BOOK_RECORD_GRAPH_INVALID', '所选图书记录不完整。');
    const matches = host.authority.prepare(
      `SELECT source_version_id
       FROM source_versions
       WHERE book_id = ? AND source_digest = ?
       ORDER BY source_version_id`,
    ).all(bookId, sourceDigest) as SqlRow[];
    requireStore(matches.length <= 1, 'BOOK_RECORD_GRAPH_INVALID', '所选图书的来源版本身份不唯一。');
    const bookStateDigest = sha256(canonicalJson({
      schema: 'ai7.source-import-target-book-state/1',
      overview,
      dimensionSet: {
        dimensionSetId: bookRecord.dimensionSetId,
        definitionDigest: bookRecord.dimensionSetDigest,
        profileId: BASELINE_EDITORIAL_DIMENSION_SET.profileId,
        profileVersion: BASELINE_EDITORIAL_DIMENSION_SET.profileVersion,
        weightSemantics: BASELINE_EDITORIAL_DIMENSION_SET.weightSemantics,
        dimensions: EDITORIAL_DIMENSIONS,
      },
    }));
    return {
      kind: 'existing-book',
      bookId,
      stableIdentity: overview.book.stableIdentity,
      title: overview.book.title,
      internalNumber: overview.book.internalNumber,
      dimensionSetId: bookRecord.dimensionSetId,
      label: host.exactBookChoiceLabel(overview.book.title, bookId, overview.book.internalNumber),
      bookStateDigest,
      exactSourceVersionId: matches.length === 0 ? null : asString(matches[0]!.source_version_id),
    };
  }

export function resolveSourceImportTarget(host: ImportReviewRecordsHost, selection: SourceImportTargetSelection, snapshot: DraftSnapshot, identityFindings: ReadonlyArray<ImportIdentityFindingProjection>): ResolvedSourceImportTarget {
    if (selection.kind === 'new-book') {
      requireStore(selection.relationship === 'source-only', 'TARGET_CHOICE_INVALID', '来源导入关系选择无效。');
      const targetChoice = newBookTargetChoice(identityFindings);
      requireStore(selection.choiceId === targetChoice.id, 'TARGET_CHOICE_CHANGED', '导入目标选择已变化，请重新选择。');
      const bookId = host.stableUuid(`ai7.source-bound-book/1\u0000${snapshot.draftId}`);
      return {
        kind: 'new-book',
        choiceId: selection.choiceId,
        confirmedTitle: host.safeTitle(selection.confirmedTitle),
        label: targetChoice.label,
        bookId,
        stableIdentity: `book:${bookId}`,
        sourceVersionDisposition: 'created',
        reuseSourceVersionId: null,
      };
    }
    requireStore(
      UUID_PATTERN.test(selection.bookId) && selection.relationship === 'source-only' &&
        (selection.reuseSourceVersionId === null || UUID_PATTERN.test(selection.reuseSourceVersionId)),
      'TARGET_CHOICE_INVALID',
      '来源导入目标、关系或来源版本选择无效。',
    );
    const target = bookSourceImportTarget(host, selection.bookId, snapshot.sourceDigest);
    if (target.exactSourceVersionId !== null) {
      requireStore(
        selection.reuseSourceVersionId === target.exactSourceVersionId && identityFindings.some((finding) =>
          finding.bookId === target.bookId && finding.sourceVersionId === target.exactSourceVersionId &&
          finding.identityClass.kind === 'immutable-original'),
        'SOURCE_VERSION_REUSE_REQUIRED',
        '同图书已有精确来源版本；必须明确选择后才能复用。',
      );
      host.requireSameParser(target.exactSourceVersionId, snapshot);
    } else {
      requireStore(selection.reuseSourceVersionId === null, 'SOURCE_VERSION_REUSE_INVALID', '所选来源版本不能在该图书中复用。');
    }
    const { exactSourceVersionId, ...resolved } = target;
    return {
      ...resolved,
      choiceId: `existing-book:${target.bookId}`,
      sourceVersionDisposition: exactSourceVersionId === null ? 'created' : 'reused-same-book',
      reuseSourceVersionId: exactSourceVersionId,
    };
  }

export function reconstructReviewedSourceImportTarget(host: ImportReviewRecordsHost, snapshot: DraftSnapshot, identityFindings: ReadonlyArray<ImportIdentityFindingProjection>): ResolvedSourceImportTarget | null {
    if (snapshot.reviewDigest === null || snapshot.reviewedRelationship !== 'source-only') return null;
    let target: ResolvedSourceImportTarget;
    try {
      if (snapshot.reviewedTargetKind === 'new-book') {
        if (snapshot.reviewedTitle === null || snapshot.reviewedTargetChoiceId === null) return null;
        target = resolveSourceImportTarget(host, {
          kind: 'new-book',
          choiceId: snapshot.reviewedTargetChoiceId,
          confirmedTitle: snapshot.reviewedTitle,
          relationship: 'source-only',
        }, snapshot, identityFindings);
      } else if (snapshot.reviewedTargetKind === 'existing-book') {
        if (snapshot.reviewedExistingBookId === null || snapshot.reviewedBookStateDigest === null) return null;
        target = resolveSourceImportTarget(host, {
          kind: 'existing-book',
          bookId: snapshot.reviewedExistingBookId,
          relationship: 'source-only',
          reuseSourceVersionId: snapshot.reviewedReuseSourceVersionId,
        }, snapshot, identityFindings);
        if (target.kind !== 'existing-book' || target.bookStateDigest !== snapshot.reviewedBookStateDigest) return null;
      } else {
        return null;
      }
    } catch {
      return null;
    }
    return createSourceImportReviewDigest(snapshot, target, identityFindings) === snapshot.reviewDigest ? target : null;
  }

export function sourceImportReviewProjection(host: ImportReviewRecordsHost, snapshot: DraftSnapshot, target: ResolvedSourceImportTarget, identityFindings: ReadonlyArray<ImportIdentityFindingProjection>, commitAttemptId: string | null): ReviewBeforeSourceImportProjection {
    return {
      draftId: snapshot.draftId,
      draftVersion: snapshot.version,
      reviewDigest: snapshot.reviewDigest ?? createSourceImportReviewDigest(snapshot, target, identityFindings),
      commitAttemptId,
      target: target.kind === 'new-book'
        ? {
            choiceId: target.choiceId,
            kind: 'new-book',
            label: target.label,
            confirmedTitle: target.confirmedTitle,
            bookId: target.bookId,
            stableIdentity: target.stableIdentity,
            relationship: 'source-only',
            relationshipLabel: '作为来源材料导入',
          }
        : {
            choiceId: target.choiceId,
            kind: 'existing-book',
            label: target.label,
            bookId: target.bookId,
            stableIdentity: target.stableIdentity,
            internalNumber: target.internalNumber,
            relationship: 'source-only',
            relationshipLabel: '作为来源材料导入',
            bookStateDigest: target.bookStateDigest,
          },
      source: stagedProjection(host, snapshot).source,
      identityFindings,
      retainedBoundary: sourceImportRetainedBoundary(snapshot),
      provenance: {
        acquisitionPath: 'native-file-picker',
        locality: 'local-provider-free',
        label: '本机文件选择器 · 本地解析 · 未联网',
        acquiredAt: snapshot.stagedAt,
      },
      sourceVersionResult: target.sourceVersionDisposition === 'created'
        ? { disposition: 'created', label: '创建所选图书拥有的新来源版本', sourceVersionId: null }
        : {
            disposition: 'reused-same-book',
            label: '复用已明确选择的同图书来源版本',
            sourceVersionId: target.reuseSourceVersionId!,
          },
      recordsToCreate: sourceImportRecordsToCreate(target),
      namedNonEffects: SOURCE_IMPORT_NON_EFFECTS,
      editorialDimensionSet: {
        createdWithBook: target.kind === 'new-book',
        ...BASELINE_EDITORIAL_DIMENSION_SET,
        digest: BASELINE_EDITORIAL_DIMENSION_SET_DIGEST,
      },
    };
  }

export function resolveImportTarget(host: ImportReviewRecordsHost, selection: ImportTargetSelection, identityFindings: ReadonlyArray<ImportIdentityFindingProjection>): ResolvedImportTarget {
    if (selection.kind === 'new-book') {
      const targetChoice = newBookTargetChoice(identityFindings);
      requireStore(selection.choiceId === targetChoice.id, 'TARGET_CHOICE_CHANGED', '导入目标选择已变化，请重新选择。');
      return {
        kind: 'new-book',
        choiceId: selection.choiceId,
        confirmedTitle: host.safeTitle(selection.confirmedTitle),
        label: targetChoice.label,
      };
    }
    requireStore(
      UUID_PATTERN.test(selection.bookId) && selection.relationship === 'first-manuscript',
      'TARGET_CHOICE_INVALID',
      '导入目标或稿件关系选择无效。',
    );
    const target = emptyBookImportTarget(host, selection.bookId);
    return {
      kind: 'existing-book',
      choiceId: `existing-book:${target.bookId}`,
      ...target,
      relationship: 'first-manuscript',
    };
  }

export function manuscriptImportParser(host: ImportReviewRecordsHost, bookId: string, commitId: string, sourceVersionId: string, parentParser: string, derivationParser: string): string {
    if (derivationParser === WORD_DOCX_PARSER_IDENTITY) {
      const { choice } = host.retentionCall(() => readWordImportChoiceRecord(host.authority, bookId, commitId));
      requireStore(choice.sourceVersionId === sourceVersionId, 'WORD_SOURCE_INVALID', 'Word 稿件衍生来源与原始来源不一致。');
      return WORD_DOCX_PARSER_IDENTITY;
    }
    requireStore(parentParser === derivationParser, 'BOOK_RECORD_GRAPH_INVALID', '历史稿件导入的来源解析器不一致。');
    return parentParser;
  }

export function reviewedFidelity(host: ImportReviewRecordsHost, snapshot: DraftSnapshot, disposition: TextBoxDisposition, word?: WordIntakePlan): ReviewedFidelity {
    if (word !== undefined) {
      const plan = deriveImportFidelityPlan(word.parsed.fidelity, snapshot.sourceDigest, snapshot.sourceBytes, undefined, WORD_DOCX_PARSER_IDENTITY);
      requireStore(plan !== undefined, 'WORD_READING_UNAVAILABLE', 'Word 所选阅读的保真计划无法重建。');
      return { fidelity: word.parsed.fidelity, plan, word };
    }
    requireFidelityPlan(host, snapshot);
    const conversion = fidelityConversion(snapshot.conversion);
    const fidelity = withTextBoxDisposition(snapshot.fidelity, disposition, conversion, snapshot.parserIdentity!);
    requireStore(fidelity, 'TEXT_BOX_CHOICE_INVALID', '本次导入没有可并入正文的文本框。');
    const plan = deriveImportFidelityPlan(fidelity, snapshot.sourceDigest, snapshot.sourceBytes, conversion, snapshot.parserIdentity!);
    requireStore(plan, 'FIDELITY_OUTSIDE_TRACER', '当前导入的保真计划不符合受限边界。');
    return { fidelity, plan };
  }

export function reconstructReviewedImport(host: ImportReviewRecordsHost, snapshot: DraftSnapshot, identityFindings: ReadonlyArray<ImportIdentityFindingProjection>): { target: ResolvedImportTarget; reviewed: ReviewedFidelity } | null {
    if (snapshot.parserIdentity === WORD_DOCX_PARSER_IDENTITY) {
      try {
        const selection = host.retentionCall(() => wordPreparedSelection(host.authority, snapshot.draftId));
        const target = recordedImportTarget(host, snapshot, identityFindings);
        if (selection === null || target === null) return null;
        const word = host.wordIntakePlan(snapshot, target, selection.textBoxDisposition, selection.choice, snapshot.version);
        requireStore(word !== null, 'WORD_PREPARATION_INVALID', 'Word 导入准备缺少完整的原始来源。');
        host.retentionCall(() => requireWordPreparedIntake(host.authority, word.prepared));
        host.requireWordStagedReading(snapshot, word);
        const reviewed = reviewedFidelity(host, snapshot, selection.textBoxDisposition, word);
        return reconstructReviewedImportTarget(host, snapshot, reviewed, identityFindings) === null ? null : { target, reviewed };
      } catch (error) { if (error instanceof StoreError) return null; throw error; }
    }
    const staged = requireFidelityPlan(host, snapshot);
    const dispositions: ReadonlyArray<TextBoxDisposition> = staged.textBoxDisposition === null ? ['retain'] : ['retain', 'merge'];
    const structure = host.boundedCall(() => recordedStructureChoice(host.authority, snapshot.draftId));
    for (const disposition of dispositions) {
      const reviewed = { ...reviewedFidelity(host, snapshot, disposition), structure };
      const target = reconstructReviewedImportTarget(host, snapshot, reviewed, identityFindings);
      if (target !== null) return { target, reviewed };
    }
    return null;
  }

export function reconstructReviewedImportTarget(host: ImportReviewRecordsHost, snapshot: DraftSnapshot, reviewed: ReviewedFidelity, identityFindings: ReadonlyArray<ImportIdentityFindingProjection>): ResolvedImportTarget | null {
    if (snapshot.reviewDigest === null) return null;
    const target = recordedImportTarget(host, snapshot, identityFindings);
    if (target === null) return null;
    if (createImportReviewDigestV6(snapshot, snapshot.version, reviewed, target, identityFindings, host.workflowProfile) === snapshot.reviewDigest) return target;
    if (target.kind !== 'new-book' || reviewed.word !== undefined) return null;
    return reconstructReviewedTargetChoice(snapshot, target.confirmedTitle, reviewed.plan, identityFindings) === target.choiceId ? target : null;
  }

export function recordedImportTarget(host: ImportReviewRecordsHost, snapshot: DraftSnapshot, identityFindings: ReadonlyArray<ImportIdentityFindingProjection>): ResolvedImportTarget | null {
    if (snapshot.reviewedTargetKind === 'existing-book') {
      if (
        snapshot.reviewedExistingBookId === null ||
        snapshot.reviewedRelationship !== 'first-manuscript' ||
        snapshot.reviewedBookStateDigest === null
      ) return null;
      let target: ResolvedImportTarget;
      try {
        target = resolveImportTarget(host,
          { kind: 'existing-book', bookId: snapshot.reviewedExistingBookId, relationship: 'first-manuscript' },
          identityFindings,
        );
      } catch {
        return null;
      }
      if (target.kind !== 'existing-book' || target.bookStateDigest !== snapshot.reviewedBookStateDigest) return null;
      return target;
    }
    if (snapshot.reviewedTargetKind !== 'new-book' || snapshot.reviewedTitle === null) return null;
    let confirmedTitle: string;
    try {
      confirmedTitle = host.safeTitle(snapshot.reviewedTitle);
    } catch {
      return null;
    }
    const currentChoice = newBookTargetChoice(identityFindings);
    if (snapshot.reviewedTargetChoiceId !== currentChoice.id) return null;
    const target: ResolvedImportTarget = {
      kind: 'new-book',
      choiceId: currentChoice.id,
      confirmedTitle,
      label: currentChoice.label,
    };
    return target;
  }

export function reviewProjection(host: ImportReviewRecordsHost, snapshot: DraftSnapshot, reviewDigest: string | null, reviewed: ReviewedFidelity, accepted: boolean, target: ResolvedImportTarget, identityFindings: ReadonlyArray<ImportIdentityFindingProjection>, commitAttemptId: string | null): ReviewBeforeImportProjection {
    const { plan } = reviewed;
    return {
      draftId: snapshot.draftId,
      draftVersion: snapshot.version,
      reviewDigest,
      commitAttemptId,
      target: target.kind === 'new-book'
        ? {
            choiceId: target.choiceId,
            kind: 'new-book',
            label: target.label,
            confirmedTitle: target.confirmedTitle,
          }
        : {
            choiceId: target.choiceId,
            kind: 'existing-book',
            label: target.label,
            bookId: target.bookId,
            stableIdentity: target.stableIdentity,
            internalNumber: target.internalNumber,
            relationship: target.relationship,
            relationshipLabel: '作为首份稿件导入',
            bookStateDigest: target.bookStateDigest,
          },
      source: stagedProjection(host, snapshot).source,
      identityFindings,
      fidelity: reviewed.fidelity,
      textBoxDisposition: plan.textBoxDisposition,
      ...(reviewed.word !== undefined ? {} : host.boundedCall(() => reviewStructureField(host.authority, snapshot.draftId,
        snapshot.parserIdentity !== WORD_DOCX_PARSER_IDENTITY, reviewed.structure))),
      ...(reviewed.word === undefined ? {} : { trackedChanges: reviewed.word.prepared.choice, wordLearning: {
        globalEnabled: reviewed.word.prepared.target.controls.global.enabled,
        bookExcluded: reviewed.word.prepared.target.controls.book.excluded,
        sourceTemplateCount: reviewed.word.compiled.templates.length,
        eligibleSampleCount: wordIntakeRecords(reviewed.word)!.eligibleSamples,
      } }),
      recordsToCreate: recordsToCreate(plan, target.kind, wordIntakeRecords(reviewed.word)),
      nonEffects: nonEffects(plan),
      workflowProfile: {
        id: host.workflowProfile.projection.id,
        name: host.workflowProfile.projection.name,
        version: host.workflowProfile.projection.version,
        digest: host.workflowProfile.projection.digest,
        nativeProfile: {
          id: host.workflowProfile.native.id,
          version: host.workflowProfile.native.version,
          digest: host.workflowProfile.native.digest,
        },
      },
      editorialDimensionSet: {
        ...BASELINE_EDITORIAL_DIMENSION_SET,
        digest: BASELINE_EDITORIAL_DIMENSION_SET_DIGEST,
      },
      degradationDecision: degradationReview(plan, accepted),
    };
  }

export function identityFindings(host: ImportReviewRecordsHost, snapshot: DraftSnapshot): ImportIdentityFindingProjection[] {
    if (snapshot.parserIdentity === WORD_DOCX_PARSER_IDENTITY) {
      const evidence = host.readWordIntake(snapshot);
      requireStore(evidence !== null && evidence.native.kind === 'word', 'WORD_SOURCE_INVALID', 'Word 身份提示缺少原始暂存。');
      snapshot = { ...snapshot, contentDigest: evidence.native.parsed.contentDigest, structureDigest: evidence.native.parsed.structureDigest };
    }
    const rows = host.authority
      .prepare(
        `SELECT b.book_id, b.title, sv.source_version_id, sv.source_digest, sv.content_digest,
                sv.structure_digest, sv.parser_identity, sv.display_name,
                records.import_record_id, records.record_kind
         FROM source_versions sv
         JOIN books b ON b.book_id = sv.book_id
         JOIN (
           SELECT book_id, source_version_id, import_record_id, 'manuscript-import' record_kind
           FROM manuscript_import_records
           UNION ALL
           SELECT book_id, source_version_id, source_import_record_id, 'source-import' record_kind
           FROM source_import_records
           UNION ALL
           SELECT book_id, source_version_id, reimport_record_id, 'manuscript-reimport' record_kind
           FROM manuscript_reimport_records
         ) records
           ON records.book_id = sv.book_id
          AND records.source_version_id = sv.source_version_id
         ORDER BY b.title COLLATE BINARY, b.book_id, sv.source_version_id,
                  records.record_kind, records.import_record_id`,
      )
      .all() as SqlRow[];
    const findings = new Map<string, ImportIdentityFindingProjection>();
    for (const row of rows) {
      const sourceDigest = asString(row.source_digest);
      // A Source Version the product never parsed has no content or structure identity, and neither
      // has an unparsed draft, so only the original's digest can classify either of them: the
      // content-digest findings need a parse on both sides (ADR 0072 §2).
      const contentDigest = host.nullableString(row.content_digest);
      const structureDigest = host.nullableString(row.structure_digest);
      const parserIdentity = host.nullableString(row.parser_identity);
      const displayName = asString(row.display_name);
      // Content and structure digests that agree are the same content whichever parser read each side (Issue #532): a Book
      // an earlier parser read is still found by it.
      const comparableParse = parserIdentity !== null && snapshot.parserIdentity !== null;
      const identityClass =
        sourceDigest === snapshot.sourceDigest
          ? ({ kind: 'immutable-original', label: '精确原始文件身份' } as const)
          : comparableParse &&
              contentDigest === snapshot.contentDigest &&
              structureDigest === snapshot.structureDigest
            ? ({ kind: 'parsed-content-structure', label: '发现相同内容' } as const)
            : displayName === snapshot.displayName
              ? ({ kind: 'filename-collision', label: '名称相同，内容不同' } as const)
              : undefined;
      if (!identityClass) continue;
      const finding = {
        bookId: asString(row.book_id),
        bookTitle: asString(row.title),
        sourceVersionId: asString(row.source_version_id),
        importRecordId: asString(row.import_record_id),
        recordKind: asString(row.record_kind) as ImportIdentityFindingProjection['recordKind'],
        recordLabel: asString(row.record_kind) === 'manuscript-import'
          ? '稿件导入记录'
          : asString(row.record_kind) === 'source-import'
            ? '来源导入记录'
            : '稿件重新导入记录',
        identityClass,
      } satisfies ImportIdentityFindingProjection;
      const key = `${finding.bookId}\u0000${finding.sourceVersionId}\u0000${finding.importRecordId}`;
      if (!findings.has(key)) findings.set(key, finding);
    }
    return [...findings.values()];
  }

export function loadDraftSnapshot(host: ImportReviewRecordsHost, draftId: string): DraftSnapshot {
    const row = one(
      host.authority
        .prepare(
          `SELECT d.draft_id, d.state, d.draft_version, d.display_name, d.object_digest,
                  d.selected_path, d.reviewed_title, d.reviewed_target_choice_id, d.review_digest,
                  d.reviewed_target_kind, d.reviewed_existing_book_id, d.reviewed_relationship,
                  d.reviewed_book_state_digest, d.reviewed_reuse_source_version_id,
                  d.reviewed_lineage_status, d.reviewed_lineage_source_version_id,
                  d.reviewed_checkpoint_revision_id, d.reviewed_manuscript_id, d.reviewed_branch_id,
                  d.staged_at, d.source_format, d.working_object_digest, d.converter_identity,
                  s.parser_identity, s.source_digest,
                  s.content_digest, s.structure_digest, s.block_count, s.character_count, s.fidelity_json,
                  s.title_suggestion, s.title_source, co.byte_length
           FROM import_drafts d
           LEFT JOIN staged_import_snapshots s ON s.draft_id = d.draft_id
           JOIN content_objects co ON co.object_digest = d.object_digest
           WHERE d.draft_id = ?`,
        )
        .all(draftId) as SqlRow[],
      'DRAFT_NOT_FOUND',
      '导入草稿不存在或已完成。',
    );
    const sourceFormat = requireSourceFormat(asString(row.source_format));
    // The two conversion columns are set together and only where the format is one the product
    // converts; `ALTER TABLE` could not add that as a table `CHECK`, so it is required here on
    // every read (ADR 0072 §2).
    const conversion = readConversionColumns(row, sourceFormat, '导入草稿的转换记录不完整。');
    // A DOCX was parsed natively and a converted file through its working representation; every
    // other draft is source-only and carries the original's identity alone (ADR 0072 §2).
    const parsed = sourceFormat === 'DOCX' || conversion !== null;
    requireStore(parsed === (row.parser_identity !== null), 'STORE_CORRUPT', '暂存解析结果与来源格式不一致。');
    const sourceDigest = parsed ? asString(row.source_digest) : asString(row.object_digest);
    const sourceBytes = asNumber(row.byte_length);
    requireStore(asString(row.object_digest) === sourceDigest, 'STORE_CORRUPT', '暂存对象与来源摘要不一致。');
    const fidelityValue = parsed ? parseStoredJson(asString(row.fidelity_json), '导入保真快照无效。') : [];
    if (parsed) {
      const plan = deriveImportFidelityPlan(
        fidelityValue, sourceDigest, sourceBytes, fidelityConversion(conversion), asString(row.parser_identity),
      );
      requireStore(plan, 'FIDELITY_OUTSIDE_TRACER', '持久化导入保真快照不符合当前受限边界。');
    }
    const titleSource = parsed ? asString(row.title_source) : '文件名';
    requireStore(titleSource === 'DOCX 标题元数据' || titleSource === '文件名', 'STORE_CORRUPT', '书名建议来源无效。');
    const reviewedTargetChoiceId =
      row.reviewed_target_choice_id === null ? null : asString(row.reviewed_target_choice_id);
    requireStore(
      reviewedTargetChoiceId === null ||
        reviewedTargetChoiceId === 'new-book' ||
        reviewedTargetChoiceId === 'new-book-distinct-intended-work',
      'STORE_CORRUPT',
      '导入复核目标无效。',
    );
    const selectedPath = row.selected_path === null ? null : asString(row.selected_path);
    requireStore(selectedPath === null || isAbsolute(selectedPath), 'STORE_CORRUPT', '原始所选路径无效。');
    const reviewedTargetKind = row.reviewed_target_kind === null ? null : asString(row.reviewed_target_kind);
    const reviewedExistingBookId = row.reviewed_existing_book_id === null ? null : asString(row.reviewed_existing_book_id);
    const reviewedRelationship = row.reviewed_relationship === null ? null : asString(row.reviewed_relationship);
    const reviewedBookStateDigest = row.reviewed_book_state_digest === null ? null : asString(row.reviewed_book_state_digest);
    const reviewedReuseSourceVersionId = row.reviewed_reuse_source_version_id === null
      ? null
      : asString(row.reviewed_reuse_source_version_id);
    const reviewedLineageStatus = row.reviewed_lineage_status === null ? null : asString(row.reviewed_lineage_status);
    const reviewedLineageSourceVersionId = row.reviewed_lineage_source_version_id === null
      ? null
      : asString(row.reviewed_lineage_source_version_id);
    const reviewedCheckpointRevisionId = row.reviewed_checkpoint_revision_id === null
      ? null
      : asString(row.reviewed_checkpoint_revision_id);
    const reviewedManuscriptId = row.reviewed_manuscript_id === null ? null : asString(row.reviewed_manuscript_id);
    const reviewedBranchId = row.reviewed_branch_id === null ? null : asString(row.reviewed_branch_id);
    requireStore(
      (reviewedTargetKind === null || reviewedTargetKind === 'new-book' || reviewedTargetKind === 'existing-book') &&
        (reviewedExistingBookId === null || UUID_PATTERN.test(reviewedExistingBookId)) &&
        (reviewedRelationship === null || reviewedRelationship === 'new-book-first-manuscript' ||
          reviewedRelationship === 'first-manuscript' || reviewedRelationship === 'source-only' ||
          reviewedRelationship === 'reimport') &&
        (reviewedBookStateDigest === null || DIGEST_PATTERN.test(reviewedBookStateDigest)) &&
        (reviewedReuseSourceVersionId === null || UUID_PATTERN.test(reviewedReuseSourceVersionId)) &&
        (reviewedLineageStatus === null || reviewedLineageStatus === 'verified' || reviewedLineageStatus === 'unconfirmed') &&
        (reviewedLineageSourceVersionId === null || UUID_PATTERN.test(reviewedLineageSourceVersionId)) &&
        (reviewedCheckpointRevisionId === null || UUID_PATTERN.test(reviewedCheckpointRevisionId)) &&
        (reviewedManuscriptId === null || UUID_PATTERN.test(reviewedManuscriptId)) &&
        (reviewedBranchId === null || UUID_PATTERN.test(reviewedBranchId)),
      'STORE_CORRUPT',
      '导入复核目标记录无效。',
    );
    return {
      draftId: asString(row.draft_id),
      state: asString(row.state),
      version: asNumber(row.draft_version),
      displayName: asString(row.display_name),
      objectDigest: asString(row.object_digest),
      selectedPath,
      reviewedTitle: row.reviewed_title === null ? null : asString(row.reviewed_title),
      reviewedTargetChoiceId,
      reviewedTargetKind: reviewedTargetKind as DraftSnapshot['reviewedTargetKind'],
      reviewedExistingBookId,
      reviewedRelationship: reviewedRelationship as DraftSnapshot['reviewedRelationship'],
      reviewedBookStateDigest,
      reviewedReuseSourceVersionId,
      reviewedLineageStatus: reviewedLineageStatus as DraftSnapshot['reviewedLineageStatus'],
      reviewedLineageSourceVersionId,
      reviewedCheckpointRevisionId,
      reviewedManuscriptId,
      reviewedBranchId,
      reviewDigest: row.review_digest === null ? null : asString(row.review_digest),
      stagedAt: asString(row.staged_at),
      sourceFormat,
      conversion,
      workingObjectDigest: conversion === null ? null : asString(row.working_object_digest),
      parserIdentity: parsed ? asString(row.parser_identity) : null,
      sourceDigest,
      sourceBytes,
      contentDigest: parsed ? asString(row.content_digest) : null,
      structureDigest: parsed ? asString(row.structure_digest) : null,
      blockCount: parsed ? asNumber(row.block_count) : 0,
      characterCount: parsed ? asNumber(row.character_count) : 0,
      fidelity: fidelityValue as FidelityCategoryProjection[],
      titleSuggestion: parsed ? asString(row.title_suggestion) : fileNameTitleSuggestion(asString(row.display_name)),
      titleSource,
    };
  }

export function requireEditableFormat(host: ImportReviewRecordsHost, snapshot: DraftSnapshot): void {
    const refusal = editableImport(snapshot.sourceFormat);
    requireStore(refusal.available, 'FORMAT_UNSUPPORTED_FOR_EDITABLE_IMPORT',
      refusal.available ? '' : refusal.reason);
  }

export function requireFidelityPlan(host: ImportReviewRecordsHost, snapshot: DraftSnapshot): ImportFidelityPlan {
    requireEditableFormat(host, snapshot);
    requireStore(snapshot.parserIdentity !== null, 'FIDELITY_OUTSIDE_TRACER', '当前导入没有本地解析结果。');
    const plan = deriveImportFidelityPlan(
      snapshot.fidelity,
      snapshot.sourceDigest,
      snapshot.sourceBytes,
      fidelityConversion(snapshot.conversion),
      snapshot.parserIdentity,
    );
    requireStore(plan, 'FIDELITY_OUTSIDE_TRACER', '当前导入的保真计划不符合受限边界。');
    return plan;
  }

export function reimportFidelity(host: ImportReviewRecordsHost, snapshot: DraftSnapshot): { fidelity: FidelityCategoryProjection[]; plan: ImportFidelityPlan } {
    const plan = requireFidelityPlan(host, snapshot);
    return { fidelity: snapshot.fidelity, plan };
  }

export function loadPersistedFidelity(host: ImportReviewRecordsHost, fidelityReviewId: string): FidelityCategoryProjection[] {
    return (
      host.authority
        .prepare(
          `SELECT category_key, display_label, item_count, status, detail
           FROM import_fidelity_categories WHERE fidelity_review_id = ? ORDER BY position`,
        )
        .all(fidelityReviewId) as SqlRow[]
    ).map((row) => {
      const status = asString(row.status);
      requireStore(
        status === 'preserved' || status === 'retained' || status === 'degraded' || status === 'unsupported',
        'STORE_CORRUPT',
        '保真状态无效。',
      );
      return {
        key: asString(row.category_key) as FidelityCategoryProjection['key'],
        label: asString(row.display_label),
        count: asNumber(row.item_count),
        status,
        statusLabel: fidelityStatusLabel(status),
        detail: asString(row.detail),
      };
    });
  }

export function persistedFidelityPlan(host: ImportReviewRecordsHost, fidelityReviewId: string, sourceDigest: string, sourceBytes: number, conversion: ManuscriptConversionProjection | null, parserIdentity: string, code: string, message: string): { categories: FidelityCategoryProjection[]; plan: ImportFidelityPlan } {
    const categories = loadPersistedFidelity(host, fidelityReviewId);
    const plan = deriveImportFidelityPlan(categories, sourceDigest, sourceBytes, fidelityConversion(conversion), parserIdentity);
    requireStore(plan, code, message);
    requireStore(
      host.retentionCall(() => recordedTextBoxChoice(host.authority, fidelityReviewId)) === plan.textBoxDisposition,
      code,
      message,
    );
    return { categories, plan };
  }

export function loadStoredCommitResult(host: ImportReviewRecordsHost, commitId: string): StoredImportCommitProjection {
    const counts = one(host.authority.prepare(
      `SELECT
         (SELECT count(*) FROM manuscript_import_records WHERE commit_id = ?) manuscript_imports,
         (SELECT count(*) FROM source_import_records WHERE commit_id = ?) source_imports,
         (SELECT count(*) FROM manuscript_reimport_records WHERE commit_id = ?) reimports`,
    ).all(commitId, commitId, commitId) as SqlRow[], 'STORE_CORRUPT', '无法判定导入提交记录类型。');
    const manuscriptImports = asNumber(counts.manuscript_imports);
    const sourceImports = asNumber(counts.source_imports);
    const reimports = asNumber(counts.reimports);
    requireStore(manuscriptImports + sourceImports + reimports === 1, 'STORE_CORRUPT', '导入提交记录类型不唯一。');
    return reimports === 1
      ? loadStoredReimportResult(host, commitId)
      : sourceImports === 1
      ? loadStoredSourceImportResult(host, commitId)
      : loadStoredManuscriptImportResult(host, commitId);
  }

export function loadStoredReimportResult(host: ImportReviewRecordsHost, commitId: string): ManuscriptReimportCommitProjection {
    const row = one(host.authority.prepare(
      `SELECT ic.commit_id, ic.committed_at, rr.*, sv.display_name, sv.source_digest, sv.format,
              sv.working_object_digest, sv.converter_identity,
              co.byte_length, d.reviewed_reuse_source_version_id
       FROM import_commits ic
       JOIN manuscript_reimport_records rr ON rr.commit_id = ic.commit_id
       JOIN source_versions sv ON sv.source_version_id = rr.source_version_id AND sv.book_id = rr.book_id
       JOIN content_objects co ON co.object_digest = sv.object_digest
       JOIN import_drafts d ON d.draft_id = ic.draft_id
       WHERE ic.commit_id = ? AND ic.operation_kind = 'manuscript-reimport'`,
    ).all(commitId) as SqlRow[], 'STORE_CORRUPT', '稿件重新导入提交记录图不完整。');
    const resultKind = asString(row.result_kind) as 'changed' | 'no-change';
    const completionLabel = asString(row.result_label) as '稿件已重新导入' | '未发现稿件变化';
    const lineageStatus = asString(row.lineage_status) as 'verified' | 'unconfirmed';
    const comparisonKind = asString(row.comparison_kind) as 'three-way' | 'two-way';
    const manuscriptId = asString(row.manuscript_id);
    const branchId = asString(row.branch_id);
    const bookId = asString(row.book_id);
    const reimportRecordId = asString(row.reimport_record_id);
    const receipt = reimportRecordPresentations(host, bookId, [reimportRecordId])
      .find((record) => record.kind === 'manuscript-reimport-record');
    requireStore(receipt?.kind === 'manuscript-reimport-record', 'STORE_CORRUPT', '稿件重新导入完成凭据不完整。');
    const overview = host.getBookOverview(bookId);
    return {
      commitId: asString(row.commit_id),
      importedAt: asString(row.committed_at),
      completionLabel,
      resultKind,
      bookId,
      manuscriptId,
      branchId,
      previousRevisionId: asString(row.previous_revision_id),
      resultingRevisionId: row.resulting_revision_id === null ? null : asString(row.resulting_revision_id),
      reimportRecordId,
      sourceVersionId: asString(row.source_version_id),
      sourceVersionDisposition: row.reviewed_reuse_source_version_id === null ? 'created' : 'reused-same-book',
      provenanceId: asString(row.provenance_id),
      lineageStatus,
      lineageLabel: lineageStatus === 'verified' ? '来源关系已确认' : '来源关系未确认',
      comparisonKind,
      comparisonDigest: asString(row.comparison_digest),
      resolutionDigest: asString(row.resolution_digest),
      source: storedSourceProjection(row),
      receipt,
      overview,
      window: host.reimportLandingWindow(overview, manuscriptId, branchId),
    };
  }

export function loadStoredManuscriptImportResult(host: ImportReviewRecordsHost, commitId: string): Omit<ManuscriptImportCommitProjection, 'firstWindow'> {
    const row = one(
      host.authority
        .prepare(
          `SELECT ic.commit_id, ic.committed_at, ir.import_record_id, ir.book_id, ir.manuscript_id,
                  ir.fidelity_review_id, ir.degradation_decision_id, ir.resulting_revision_id,
                  mr.branch_id, CASE WHEN sp.parser_identity = '${WORD_DOCX_PARSER_IDENTITY}' THEN d.display_name ELSE sv.display_name END display_name,
                  sv.source_version_id, sv.object_digest, sv.source_digest, sv.format, sp.parser_identity derivation_parser_identity,
                  sv.working_object_digest, sv.converter_identity, sv.parser_identity, co.byte_length,
                  fr.outcome, fr.round_trip_guaranteed, dd.fidelity_review_id decision_fidelity_review_id,
                  dd.decision
           FROM import_commits ic
           JOIN import_drafts d ON d.draft_id = ic.draft_id
           JOIN manuscript_import_records ir ON ir.commit_id = ic.commit_id
           JOIN source_provenance sp ON sp.provenance_id = ir.provenance_id AND sp.source_version_id = ir.source_version_id
           JOIN manuscript_revisions mr
             ON mr.revision_id = ir.resulting_revision_id
            AND mr.manuscript_id = ir.manuscript_id
            AND mr.source_version_id = ir.source_version_id
           JOIN source_versions sv
             ON sv.source_version_id = ir.source_version_id
            AND sv.book_id = ir.book_id
           JOIN content_objects co ON co.object_digest = sv.object_digest
           JOIN import_fidelity_reviews fr
             ON fr.fidelity_review_id = ir.fidelity_review_id
            AND fr.book_id = ir.book_id
            AND fr.source_version_id = ir.source_version_id
           LEFT JOIN import_degradation_decisions dd
             ON dd.degradation_decision_id = ir.degradation_decision_id
            AND dd.fidelity_review_id = ir.fidelity_review_id
           WHERE ic.commit_id = ?`,
        )
        .all(commitId) as SqlRow[],
      'STORE_CORRUPT',
      '导入提交记录图不完整。',
    );
    const fidelityReviewId = asString(row.fidelity_review_id);
    const sourceDigest = asString(row.source_digest);
    const sourceBytes = asNumber(row.byte_length);
    requireStore(asString(row.object_digest) === sourceDigest, 'STORE_CORRUPT', '提交来源对象与来源摘要不一致。');
    const conversion = readConversionColumns(row, requireSourceFormat(asString(row.format)), '来源版本的转换记录不完整。');
    const { categories, plan } = persistedFidelityPlan(host,
      fidelityReviewId, sourceDigest, sourceBytes, conversion,
      manuscriptImportParser(host, asString(row.book_id), commitId, asString(row.source_version_id), asString(row.parser_identity), asString(row.derivation_parser_identity)),
      'STORE_CORRUPT', '导入提交保真记录无效。',
    );
    requireStore(asString(row.outcome) === plan.outcome && asNumber(row.round_trip_guaranteed) === 0, 'STORE_CORRUPT', '导入保真结论无效。');
    // Issue #411 (D5): the committed graph still holds every mark its review counted. A mark is never deleted —
    // it is applied, resolved, removed or converted, and an Apply re-pins it — so the manuscript's marks from
    // the file's author can only have grown in number since the commit wrote exactly these.
    const importedMarks = one(host.authority.prepare(
      "SELECT count(*) total FROM editorial_marks WHERE manuscript_id = ? AND source_kind = 'imported-author'",
    ).all(asString(row.manuscript_id)) as SqlRow[], 'STORE_CORRUPT', '导入的批注与修改建议无法计数。');
    requireStore(asNumber(importedMarks.total) >= plan.importedMarks, 'STORE_CORRUPT', '导入提交记录图缺少导入的批注与修改建议。');
    const degradationDecisionId = row.degradation_decision_id === null ? null : asString(row.degradation_decision_id);
    if (plan.degradations.length === 0) {
      requireStore(degradationDecisionId === null && row.decision === null, 'STORE_CORRUPT', '洁净导入意外关联了降级决定。');
    } else {
      requireStore(
        degradationDecisionId !== null &&
          asString(row.decision_fidelity_review_id) === fidelityReviewId &&
          asString(row.decision) === canonicalDegradationDecision(plan),
        'STORE_CORRUPT',
        '导入降级决定无效。',
      );
    }
    const importRecordId = asString(row.import_record_id);
    return {
      commitId: asString(row.commit_id),
      importedAt: asString(row.committed_at),
      completionLabel: '稿件已导入',
      bookId: asString(row.book_id),
      manuscriptId: asString(row.manuscript_id),
      branchId: asString(row.branch_id),
      revisionId: asString(row.resulting_revision_id),
      importRecordId,
      source: storedSourceProjection(row),
      fidelityReview: { fidelityReviewId, outcome: plan.outcome, categories },
      importRecord: {
        importRecordId,
        fidelityReviewId,
        degradationDecision: degradationDecisionId
          ? {
              degradationDecisionId,
              summaryLabel: '含已接受的降级',
              acceptedItems: plan.degradations,
            }
          : null,
      },
      overview: host.getBookOverview(asString(row.book_id)),
    };
  }

export function loadStoredSourceImportResult(host: ImportReviewRecordsHost, commitId: string): SourceImportCommitProjection {
    const row = one(host.authority.prepare(
      `SELECT ic.commit_id, ic.committed_at, sir.source_import_record_id, sir.book_id,
              sir.source_version_id, sir.provenance_id, sir.target_kind,
              sir.source_version_disposition, sir.retained_boundary_json,
              sir.named_non_effects_json, sir.record_digest, sir.imported_at,
              sv.display_name, sv.format, sv.object_digest, sv.source_digest, sv.content_digest,
              sv.structure_digest, sv.parser_identity, sv.working_object_digest, sv.converter_identity,
              co.byte_length, sp.acquisition_path, sp.locality, sp.sanitized_identity, sp.recorded_at
       FROM import_commits ic
       JOIN source_import_records sir ON sir.commit_id = ic.commit_id
       JOIN source_versions sv
         ON sv.source_version_id = sir.source_version_id AND sv.book_id = sir.book_id
       JOIN content_objects co ON co.object_digest = sv.object_digest
       JOIN source_provenance sp
         ON sp.provenance_id = sir.provenance_id AND sp.source_version_id = sir.source_version_id
       WHERE ic.commit_id = ?`,
    ).all(commitId) as SqlRow[], 'STORE_CORRUPT', '来源导入提交记录图不完整。');
    const targetKind = asString(row.target_kind);
    const disposition = asString(row.source_version_disposition);
    requireStore(
      (targetKind === 'new-book' || targetKind === 'existing-book') &&
        (disposition === 'created' || disposition === 'reused-same-book') &&
        asString(row.object_digest) === asString(row.source_digest) &&
        asString(row.acquisition_path) === 'native-file-picker' && asString(row.locality) === 'local-provider-free' &&
        asString(row.imported_at) === asString(row.committed_at),
      'STORE_CORRUPT',
      '来源导入提交身份或来源记录无效。',
    );
    const retained = parseStoredJson(asString(row.retained_boundary_json), '来源导入保留边界无效。');
    const namedNonEffects = parseStoredJson(asString(row.named_non_effects_json), '来源导入非影响记录无效。');
    requireStore(
      retained !== null && typeof retained === 'object' && !Array.isArray(retained) &&
        Array.isArray(namedNonEffects) && canonicalJson(namedNonEffects) === canonicalJson(SOURCE_IMPORT_NON_EFFECTS),
      'STORE_CORRUPT',
      '来源导入保留边界或非影响记录无效。',
    );
    const boundary = retained as ReviewBeforeSourceImportProjection['retainedBoundary'];
    requireStore(
      boundary.kind === 'complete-local-file' &&
        acceptedSourceImportRetainedBoundaryLabels(requireSourceFormat(asString(row.format)), row.parser_identity !== null)
          .some((label) => label === boundary.label) &&
        boundary.format === asString(row.format) && boundary.displayName === asString(row.sanitized_identity) &&
        boundary.sourceSha256 === asString(row.source_digest) &&
        boundary.sourceBytes === asNumber(row.byte_length) &&
        boundary.contentDigest === host.nullableString(row.content_digest) &&
        boundary.structureDigest === host.nullableString(row.structure_digest),
      'STORE_CORRUPT',
      '来源导入保留边界与来源版本不一致。',
    );
    const sourceImportRecordId = asString(row.source_import_record_id);
    const bookId = asString(row.book_id);
    const sourceVersionId = asString(row.source_version_id);
    const provenanceId = asString(row.provenance_id);
    const importedAt = asString(row.imported_at);
    const recordDigest = sha256(canonicalJson({
      schema: SOURCE_IMPORT_RECORD_SCHEMA,
      sourceImportRecordId,
      commitId: asString(row.commit_id),
      bookId,
      sourceVersionId,
      provenanceId,
      targetKind,
      sourceVersionDisposition: disposition,
      retainedBoundary: retained,
      namedNonEffects,
      importedAt,
    }));
    requireStore(recordDigest === asString(row.record_digest), 'STORE_CORRUPT', '来源导入记录摘要无效。');
    const conversion = readConversionColumns(row, requireSourceFormat(asString(row.format)), '来源版本的转换记录不完整。');
    const receiptRecords = sourceImportRecordPresentations(host, bookId, [sourceImportRecordId]);
    const receiptSource = receiptRecords.find((record) => record.kind === 'source');
    const receiptRecord = receiptRecords.find((record) => record.kind === 'source-import-record');
    requireStore(receiptSource?.kind === 'source' && receiptRecord?.kind === 'source-import-record',
      'STORE_CORRUPT', '来源导入完成凭据不完整。');
    return {
      commitId: asString(row.commit_id),
      importedAt,
      completionLabel: '来源材料已导入',
      targetKind,
      createdBook: targetKind === 'new-book',
      bookId,
      sourceVersionId,
      sourceImportRecordId,
      sourceVersionDisposition: disposition,
      source: {
        displayName: boundary.displayName,
        format: boundary.format,
        sourceSha256: boundary.sourceSha256,
        sourceBytes: boundary.sourceBytes,
        provenanceLabel: '本机文件选择器 · 本地解析 · 未联网',
        // A TXT, Markdown or legacy .doc kept as source material was read through its converter, and the
        // commit recorded that working representation on the Source Version (ADR 0072 §2, #552).
        conversion,
        workingObjectSha256: conversion === null ? null : asString(row.working_object_digest),
      },
      retainedBoundary: boundary,
      provenance: {
        acquisitionPath: 'native-file-picker',
        locality: 'local-provider-free',
        label: '本机文件选择器 · 本地解析 · 未联网',
        acquiredAt: asString(row.recorded_at),
        provenanceId,
      },
      namedNonEffects: namedNonEffects as string[],
      receipt: { source: receiptSource, record: receiptRecord },
      overview: host.getBookOverview(bookId),
    };
  }

export const INGEST_BATCH_SIZE = 256;

export const REIMPORT_MAPPING_BATCH_SIZE = 64;

export const REIMPORT_COMMIT_FILE_BATCH_BYTES = 256 * 1024;

export const REIMPORT_MAX_JSON_BLOCK_BYTES = MAX_BLOCK_CODE_UNITS * 6;

export const REIMPORT_WIRE_HEADROOM_BYTES = 4_096;

export const REIMPORT_MAPPING_PAGE_SIZE = 4;

/** Rows of the chapter-level comparison per page (Issue #412, S63): each shows at most three excerpts a side. */
export const REIMPORT_GROUP_PAGE_SIZE = 10;

export const REIMPORT_GROUPING = 'ai7.reimport-groups/1' as const;

export const REIMPORT_IDENTITY_CANDIDATE_PAGE_SIZE = 16;

export const REIMPORT_LINEAGE_CHOICE_LIMIT = 32;

export const DEGRADATION_DECISION_SCHEMA = 'ai7.import-degradation-decision/1';

export const SOURCE_IMPORT_RECORD_SCHEMA = 'ai7.source-import-record/1';

export const SOURCE_IMPORT_NON_EFFECTS = [
  '不创建稿件',
  '不创建稿件修订版',
  '不创建工作流实例',
  '不创建运行来源范围',
  '不创建事实状态或事实核查结论',
  '不创建书系或书系成员关系',
  '不创建编辑学习准入决定',
  '不授予或执行模型提供方传输',
  '不创建发稿版本、公开发布许可或公开发布事实',
  '不导出、不发送、不交付、不发布',
] as const;

export const MANUSCRIPT_REIMPORT_RECORD_SCHEMA = 'ai7.manuscript-reimport-record/1';

export const MANUSCRIPT_REIMPORT_NON_EFFECTS = [
  '不创建第二份主稿件或并行稿件分支',
  '不把来源关系未确认解释为导入阻断、来源确认或血缘证明',
  '不执行模糊匹配或通用合并',
  '不创建里程碑、恢复快照、恢复决定或恢复注意事项',
  '不改变图书稳定标识、内部编号、编辑维度集或工作流程实例',
  '不创建运行来源范围、事实状态或事实核查结论',
  '不创建书系或书系成员关系',
  '不创建编辑学习准入决定',
  '不授予或执行模型提供方传输',
  '不创建发稿版本、公开发布许可或公开发布事实',
  '不导出、不发送、不交付、不发布',
] as const;

export type StoredImportCommitProjection =
  | Omit<ManuscriptImportCommitProjection, 'firstWindow'>
  | SourceImportCommitProjection
  | ManuscriptReimportCommitProjection;

export type ImmutableManuscriptImportResult = Omit<ManuscriptImportCommitProjection, 'firstWindow' | 'overview'>;

export function commitRequestFingerprint(
  operationKind: 'manuscript-import' | 'source-import' | 'manuscript-reimport',
  input: { draftId: string; expectedDraftVersion: number; reviewDigest: string; commitId: string },
): string {
  return sha256(canonicalJson({ schema: 'ai7.import-commit-request/1', operationKind, input }));
}

export function immutableCommitResult(result: StoredImportCommitProjection): Record<string, unknown> {
  if ('reimportRecordId' in result) {
    const { overview: _freshOverview, window: _freshWindow, receipt: _freshReceipt, ...immutable } = result;
    return immutable;
  }
  if ('sourceImportRecordId' in result) {
    const { overview: _freshOverview, receipt: _freshReceipt, ...immutable } = result;
    return immutable;
  }
  const { overview: _freshProjection, ...immutable } = result;
  return immutable;
}

export function safeDisplayName(input: string): string {
  requireStore(input.isWellFormed(), 'SOURCE_IDENTITY_INVALID', '来源标识无效。');
  const name = input.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  requireStore(name.length > 0 && name.length <= 180 && !/[\\/]/.test(name), 'SOURCE_IDENTITY_INVALID', '来源标识无效。');
  return name;
}

/**
 * The parser's two "this is not a WordprocessingML package" refusals. They say the file is not a
 * DOCX at all, which the router answers by classifying it as unrecognised and retaining it
 * source-only; every other `DOCX_REJECTED` is a bound a hostile archive crossed and stays a refusal.
 */
export const NOT_A_WORDPROCESSING_PACKAGE = [
  'DOCX_REJECTED:not a WordprocessingML DOCX',
  'DOCX_REJECTED:package does not declare a WordprocessingML document',
] as const;

export function isNotAWordprocessingPackage(error: unknown): boolean {
  return error instanceof Error && NOT_A_WORDPROCESSING_PACKAGE.some((message) => error.message === message);
}

export const SOURCE_FORMATS: ReadonlyArray<SourceFormat> = ['DOCX', 'DOC', 'PDF', 'ODT', 'RTF', 'TXT', 'MD', 'UNKNOWN'];

export function requireSourceFormat(value: string): SourceFormat {
  const format = SOURCE_FORMATS.find((candidate) => candidate === value);
  requireStore(format !== undefined, 'STORE_CORRUPT', '来源格式无效。');
  return format!;
}

/**
 * A file the product did not parse has no title metadata, so the file name is the only suggestion
 * there is — the same fallback the DOCX parser uses when a package carries no title.
 */
export function fileNameTitleSuggestion(displayName: string): string {
  const withoutExtension = displayName.slice(0, displayName.length - extname(displayName).length).trim();
  return withoutExtension.length > 0 ? withoutExtension : displayName;
}

export function draftSourceProjection(snapshot: DraftSnapshot): StagedImportProjection['source'] {
  return { displayName: snapshot.displayName, format: snapshot.sourceFormat, sourceSha256: snapshot.sourceDigest,
    sourceBytes: snapshot.sourceBytes, provenanceLabel: '本机文件选择器 · 本地解析 · 未联网',
    conversion: snapshot.conversion, workingObjectSha256: snapshot.workingObjectDigest };
}

/**
 * The Import Fidelity Review for a converted file (ADR 0072 §3). The parser found nothing of its
 * own in a working representation the product itself wrote, so every count in the review is the
 * conversion's loss and every non-zero class names the converter as its cause.
 */
export function conversionFidelityReport(
  conversion: ManuscriptConversionProjection,
  loss: ConversionLoss,
): FidelityCategoryProjection[] {
  return buildFidelityReport(
    {
      inlineStyles: 0, commentsRevisions: 0, notes: 0, tables: 0, imagesCaptions: 0, sections: 0,
      textBoxes: 0, fields: 0,
    },
    0,
    { identity: conversion.converterIdentity, sourceFormat: conversion.sourceFormat, loss },
  );
}

/**
 * The conversion a row carries, with the invariant `ALTER TABLE ADD COLUMN` could not express as a
 * table `CHECK`: the working object and the converter's identity are null together or set together,
 * and set only where the format is one the product reads through a converter (ADR 0072 §2).
 */
export function readConversionColumns(
  row: SqlRow,
  format: SourceFormat,
  message: string,
): ManuscriptConversionProjection | null {
  const workingObjectDigest = row.working_object_digest ?? null;
  const converterIdentity = row.converter_identity ?? null;
  requireStore((workingObjectDigest === null) === (converterIdentity === null), 'STORE_CORRUPT', message);
  if (workingObjectDigest === null) return null;
  requireStore(format === 'TXT' || format === 'MD' || format === 'DOC', 'STORE_CORRUPT', message);
  requireStore(DIGEST_PATTERN.test(asString(workingObjectDigest)), 'STORE_CORRUPT', message);
  return { converterIdentity: asString(converterIdentity), sourceFormat: format };
}

/**
 * The source surface of a stored commit result, read back from its Source Version row: the format
 * and digest of record are the original's, and a converted import also names what it was read
 * through (ADR 0072 §2).
 */
export function storedSourceProjection(row: SqlRow): StagedImportProjection['source'] {
  const format = requireSourceFormat(asString(row.format));
  const conversion = readConversionColumns(row, format, '来源版本的转换记录不完整。');
  return {
    displayName: asString(row.display_name),
    format,
    sourceSha256: asString(row.source_digest),
    sourceBytes: asNumber(row.byte_length),
    provenanceLabel: '本机文件选择器 · 本地解析 · 未联网',
    conversion,
    workingObjectSha256: conversion === null ? null : asString(row.working_object_digest),
  };
}

/** What such a review is rebuilt from, or `undefined` for a file the product read natively. */
export function fidelityConversion(conversion: ManuscriptConversionProjection | null): FidelityConversionIdentity | undefined {
  return conversion === null
    ? undefined
    : { identity: conversion.converterIdentity, sourceFormat: conversion.sourceFormat };
}

export interface DraftSnapshot {
  draftId: string;
  state: string;
  version: number;
  displayName: string;
  objectDigest: string;
  selectedPath: string | null;
  reviewedTitle: string | null;
  reviewedTargetChoiceId: NewBookImportTargetChoiceId | null;
  reviewedTargetKind: 'new-book' | 'existing-book' | null;
  reviewedExistingBookId: string | null;
  reviewedRelationship: 'new-book-first-manuscript' | 'first-manuscript' | 'source-only' | 'reimport' | null;
  reviewedBookStateDigest: string | null;
  reviewedReuseSourceVersionId: string | null;
  reviewedLineageStatus: 'verified' | 'unconfirmed' | null;
  reviewedLineageSourceVersionId: string | null;
  reviewedCheckpointRevisionId: string | null;
  reviewedManuscriptId: string | null;
  reviewedBranchId: string | null;
  reviewDigest: string | null;
  stagedAt: string;
  /** What the intake router identified the selected file as (ADR 0072 §1). */
  sourceFormat: SourceFormat;
  /** The converter this draft was read through, or null for a file read natively or not at all. */
  conversion: ManuscriptConversionProjection | null;
  /** The working representation's digest, set exactly when `conversion` is (ADR 0072 §2). */
  workingObjectDigest: string | null;
  /** Null together, for a retained original the product never parsed (ADR 0072 §2). */
  parserIdentity: string | null;
  sourceDigest: string;
  sourceBytes: number;
  contentDigest: string | null;
  structureDigest: string | null;
  blockCount: number;
  characterCount: number;
  fidelity: FidelityCategoryProjection[];
  titleSuggestion: string;
  titleSource: StagedImportProjection['titleSuggestion']['sourceLabel'];
}

export interface IngestedDocx {
  ingestId: string;
  parsed: ParsedDocx | ParsedWordDocx;
  /** Which source paragraph each ingested block and text-box paragraph came from (ADR 0086 §3). */
  sources: StagedImportSources | null;
  /** Native evidence keeps its honest preview separate from an explicit reading or real legacy capability. */
  native: NativeDocxIntakeParse | null;
}

export interface WordIntakePlan {
  original: Uint8Array;
  native: Extract<NativeDocxIntakeParse, { kind: 'word' }>;
  compiled: Extract<WordTrackedCompilation, { kind: 'ready' }>;
  reading: WordCompiledReading;
  parsed: ParsedWordDocx;
  prepared: WordPreparedIntake;
}

/** What a reviewed Word intake creates beside the ordinary import records: its eligible samples and any reused Source Version. */
export function wordIntakeRecords(word: WordIntakePlan | undefined): { reusedSourceVersionId: string | null; eligibleSamples: number } | undefined {
  if (word === undefined) return undefined;
  const { choice, target } = word.prepared;
  const eligibleSamples = !choice.learnFromEdits || !target.controls.global.enabled || target.controls.book.excluded ? 0
    : target.kind === 'new-book' ? word.compiled.templates.length
      : target.controls.materials.filter(({ standing }) => standing.choice === 'book' || standing.choice === 'house').length;
  return { reusedSourceVersionId: target.kind === 'existing-book' ? target.parentSourcePin?.sourceVersionId ?? null : null, eligibleSamples };
}

export interface CommitAttempt {
  attemptId: string;
  draftId: string;
  requestFingerprint: string;
  expectedDraftVersion: number;
  reviewDigest: string;
  operationKind: 'manuscript-import' | 'source-import' | 'manuscript-reimport';
  state: 'prepared' | 'uncertain' | 'committed';
  preparedAt: string;
  completionAcknowledgedAt: string | null;
}

/**
 * The working representation is always stored under `.docx` and its own digest, so a cleanup intent
 * needs only the digest to find it again (ADR 0072 §2).
 */
export function workingObjectRelativeKey(objectDigest: string): string {
  return posix.join('sha256', objectDigest.slice(0, 2), `${objectDigest}${manuscriptObjectExtension('DOCX')}`);
}

export interface AbandonmentCleanupIntent {
  draftId: string;
  objectDigest: string;
  expectedDraftVersion: number;
  relativeKey: string;
  state: 'prepared' | 'bytes-removed';
  /** The converted working representation to remove beside the original, when there is one. */
  workingObjectDigest: string | null;
}

export function continuationNotice(access: OriginalFileAccessProjection): string {
  if (access.state === 'available-exact') return '已重新校验完整暂存快照；原始所选文件仍可访问且身份一致。';
  return `${access.label}。已重新校验完整暂存快照，不会从原路径读取或替换暂存内容。`;
}

export function newBookTargetChoice(
  identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
): Extract<StagedImportProjection['targetChoices'][number], { kind: 'new-book' }> {
  return identityFindings.length > 0
    ? { kind: 'new-book', id: 'new-book-distinct-intended-work', label: '新建图书（作为不同作品）', selected: false }
    : { kind: 'new-book', id: 'new-book', label: '新建图书', selected: false };
}

export function degradationReview(
  plan: ImportFidelityPlan,
  accepted: boolean,
): ImportDegradationDecisionReviewProjection {
  if (plan.degradations.length === 0) return { state: 'not-required-clean-import', items: [] };
  return {
    state: accepted ? 'accepted-complete-set' : 'required-unselected',
    items: plan.degradations,
  };
}

export function canonicalDegradationDecision(plan: ImportFidelityPlan): string | null {
  if (plan.degradations.length === 0) return null;
  return canonicalJson({
    schema: DEGRADATION_DECISION_SCHEMA,
    scope: 'this-import-only',
    state: 'accepted-complete-set',
    items: plan.degradations,
  });
}

export function createLegacyNewBookReviewDigestV2(
  snapshot: DraftSnapshot,
  confirmedTitle: string,
  draftVersion: number,
  plan: ImportFidelityPlan,
): string {
  return sha256(
    canonicalJson({
      schema: 'ai7.new-book-import-review/2',
      draftId: snapshot.draftId,
      draftVersion,
      target: 'new-book',
      confirmedTitle,
      source: {
        displayName: snapshot.displayName,
        provenance: 'native-file-picker/local-provider-free',
        objectDigest: snapshot.objectDigest,
        parserIdentity: snapshot.parserIdentity,
        sourceDigest: snapshot.sourceDigest,
        sourceBytes: snapshot.sourceBytes,
        contentDigest: snapshot.contentDigest,
        structureDigest: snapshot.structureDigest,
      },
      fidelity: snapshot.fidelity,
      degradationDecision:
        plan.degradations.length === 0
          ? null
          : {
              schema: DEGRADATION_DECISION_SCHEMA,
              scope: 'this-import-only',
              state: 'accepted-complete-set',
              items: plan.degradations,
            },
      recordsToCreate: recordsToCreate(plan),
      nonEffects: nonEffects(plan),
      workflowProfile: { ...LEGACY_WORKFLOW_PROFILE, digest: LEGACY_WORKFLOW_PROFILE_DIGEST },
      editorialDimensionSet: {
        ...BASELINE_EDITORIAL_DIMENSION_SET,
        digest: BASELINE_EDITORIAL_DIMENSION_SET_DIGEST,
      },
    }),
  );
}

export function createNewBookReviewDigestV4(
  snapshot: DraftSnapshot,
  confirmedTitle: string,
  draftVersion: number,
  plan: ImportFidelityPlan,
  targetChoiceId: NewBookImportTargetChoiceId,
  identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
): string {
  return sha256(
    canonicalJson({
      schema: 'ai7.new-book-import-review/4',
      draftId: snapshot.draftId,
      draftVersion,
      target:
        targetChoiceId === 'new-book-distinct-intended-work'
          ? { choiceId: targetChoiceId, kind: 'new-book', relationship: 'distinct-intended-work' }
          : { choiceId: targetChoiceId, kind: 'new-book' },
      confirmedTitle,
      source: {
        displayName: snapshot.displayName,
        provenance: 'native-file-picker/local-provider-free',
        objectDigest: snapshot.objectDigest,
        parserIdentity: snapshot.parserIdentity,
        sourceDigest: snapshot.sourceDigest,
        sourceBytes: snapshot.sourceBytes,
        contentDigest: snapshot.contentDigest,
        structureDigest: snapshot.structureDigest,
      },
      identityFindings,
      fidelity: snapshot.fidelity,
      degradationDecision:
        plan.degradations.length === 0
          ? null
          : {
              schema: DEGRADATION_DECISION_SCHEMA,
              scope: 'this-import-only',
              state: 'accepted-complete-set',
              items: plan.degradations,
            },
      recordsToCreate: recordsToCreate(plan),
      nonEffects: nonEffects(plan),
      workflowProfile: { ...LEGACY_WORKFLOW_PROFILE, digest: LEGACY_WORKFLOW_PROFILE_DIGEST },
      editorialDimensionSet: {
        ...BASELINE_EDITORIAL_DIMENSION_SET,
        digest: BASELINE_EDITORIAL_DIMENSION_SET_DIGEST,
      },
    }),
  );
}

export type ResolvedImportTarget =
  | {
      kind: 'new-book';
      choiceId: NewBookImportTargetChoiceId;
      confirmedTitle: string;
      label: '新建图书' | '新建图书（作为不同作品）';
    }
  | {
      kind: 'existing-book';
      choiceId: string;
      bookId: string;
      stableIdentity: string;
      title: string;
      internalNumber: string | null;
      dimensionSetId: string;
      label: string;
      relationship: 'first-manuscript';
      bookStateDigest: string;
    };

export type ResolvedSourceImportTarget =
  | {
      kind: 'new-book';
      choiceId: NewBookImportTargetChoiceId;
      confirmedTitle: string;
      label: '新建图书' | '新建图书（作为不同作品）';
      bookId: string;
      stableIdentity: string;
      sourceVersionDisposition: 'created';
      reuseSourceVersionId: null;
    }
  | {
      kind: 'existing-book';
      choiceId: string;
      bookId: string;
      stableIdentity: string;
      title: string;
      internalNumber: string | null;
      dimensionSetId: string;
      label: string;
      bookStateDigest: string;
      sourceVersionDisposition: 'created' | 'reused-same-book';
      reuseSourceVersionId: string | null;
    };

export type ResolvedReimportTarget = {
  kind: 'existing-book';
  choiceId: string;
  bookId: string;
  stableIdentity: string;
  title: string;
  internalNumber: string | null;
  label: string;
  manuscriptId: string;
  branchId: string;
  bookStateDigest: string;
  sourceVersionDisposition: 'created' | 'reused-same-book';
  reuseSourceVersionId: string | null;
  checkpoint: ReimportCheckpointBinding;
  lineage:
    | { status: 'verified'; sourceVersionId: string; revisionId: string; comparisonKind: 'three-way' }
    | { status: 'unconfirmed'; sourceVersionId: null; revisionId: null; comparisonKind: 'two-way' };
};

export interface ReimportBlockFact {
  blockId: string;
  position: number;
  kind: ManuscriptBlockProjection['kind'];
  level: number | null;
  text: string;
  digest: string;
}

export interface ReimportMappingFact {
  mappingId: string;
  position: number;
  changeKind: 'unchanged' | 'move' | 'edit' | 'insert' | 'delete';
  current: ReimportBlockFact | null;
  lineage: ReimportBlockFact | null;
  staged: ReimportBlockFact | null;
  identityConsequence: 'preserve-current-identity' | null;
}

export interface ReimportMappingBatch {
  readonly mappings: ReadonlyArray<ReimportMappingFact>;
  readonly scanned: number;
}

export interface ReimportPreparationWork {
  readonly workId: string;
  readonly draftId: string;
  readonly expectedDraftVersion: number;
  readonly targetSelection: ManuscriptReimportTargetSelection;
  readonly snapshot: DraftSnapshot;
  phase: 'checkpoint' | 'staged-occurrences' | 'current-occurrences' | 'lineage-occurrences' | 'mapping';
  checkpointWorkId: string | null;
  checkpointCompleted: number;
  target: ResolvedReimportTarget | null;
  comparisonId: string | null;
  comparisonHasher: ReturnType<typeof createReimportComparisonHasher> | null;
  batches: Generator<ReimportMappingBatch> | null;
  occurrenceCursor: number;
  checkpointBlockCount: number;
  totalUpperBound: number;
  completed: number;
  mappingCount: number;
  unresolvedMappings: number;
  changedMappings: number;
}

/** One mapping's identity as a row's verb writes it (Issue #412, S63). */
export interface ReimportPendingResolution {
  readonly mappingId: string;
  readonly resolution: 'preserve-current-identity' | 'create-new-identity' | 'retire-current-identity';
  readonly currentBlockId: string | null;
}

export interface ReimportResolutionWork {
  readonly workId: string;
  readonly draftId: string;
  readonly expectedDraftVersion: number;
  readonly groupId: string;
  readonly verb: ReimportGroupVerb;
  /** The identities the verb writes, by mapping, in the order the row lists them. */
  readonly pending: ReadonlyMap<string, ReimportPendingResolution>;
  readonly snapshot: DraftSnapshot;
  readonly target: ResolvedReimportTarget;
  readonly comparisonId: string;
  readonly degradationAccepted: boolean;
  readonly totalMappings: number;
  readonly resolutionHasher: ReturnType<typeof createReimportResolutionHasher>;
  completed: number;
}

export interface ReimportCommitWork {
  readonly mode: 'commit';
  readonly workId: string;
  readonly input: { draftId: string; expectedDraftVersion: number; reviewDigest: string; commitId: string };
  readonly requestFingerprint: string;
  readonly snapshot: DraftSnapshot;
  readonly target: ResolvedReimportTarget;
  readonly evidence: {
    comparisonDigest: string;
    resolutionDigest: string;
    totalMappings: number;
    unresolvedMappings: number;
    changed: boolean;
  };
  readonly resultingRevisionId: string | null;
  readonly objectPath: string;
  readonly abortController: AbortController;
  readonly total: number;
  readonly attemptExists: boolean;
  readonly interruptAfterAttempt: boolean;
  readonly interruptAfterCommit: boolean;
  readonly legacyResultWithoutPresentation: boolean;
  phase: 'parse' | 'mappings';
  parseBytes: number;
  /** A converted source's working representation, reproduced from the kept original before the parse (Issue #597). */
  converted: { digest: string; byteLength: number; fidelity: FidelityCategoryProjection[] } | null;
  parsedIngest: IngestedDocx | null;
  parseFailure: unknown;
  mappingPosition: number;
  stagedBlocks: number;
  stagedCharacters: number;
  readonly offsetSegments: ReimportOffsetSegment[];
}

export interface ReimportReplayWork {
  readonly mode: 'committed-replay';
  readonly workId: string;
  readonly input: { draftId: string; expectedDraftVersion: number; reviewDigest: string; commitId: string };
  readonly attempt: CommitAttempt;
  readonly result: ManuscriptReimportCommitProjection;
  readonly objectPath: string;
  objectFd: number | null;
  readonly objectHasher: ReturnType<typeof createHash>;
  readonly expectedDigest: string;
  readonly total: number;
  completed: number;
}

export interface ReimportOffsetSegment {
  size: number;
  total: number;
}

export function appendReimportOffsetSegment(
  stack: ReimportOffsetSegment[],
  position: number,
  length: number,
): number {
  requireStore(Number.isSafeInteger(length) && length >= 0,
    'REIMPORT_COMPARISON_INVALID', '重新导入偏移索引长度无效。');
  let segment: ReimportOffsetSegment = { size: 1, total: length };
  while (stack.at(-1)?.size === segment.size) {
    const previous = stack.pop()!;
    const total = previous.total + segment.total;
    requireStore(Number.isSafeInteger(total), 'REIMPORT_COMPARISON_INVALID', '重新导入偏移索引总量无效。');
    segment = { size: segment.size * 2, total };
  }
  let remainder = position;
  let expectedSize = 1;
  while (remainder % 2 === 0) {
    remainder /= 2;
    expectedSize *= 2;
  }
  requireStore(segment.size === expectedSize, 'REIMPORT_COMPARISON_INVALID', '重新导入偏移索引范围无效。');
  stack.push(segment);
  return segment.total;
}

export function manuscriptBlockDigest(kind: ManuscriptBlockProjection['kind'], level: number | null, text: string): string {
  return sha256(canonicalJson({ kind, level, text }));
}

export function createReimportComparisonHasher(draftId: string, target: ResolvedReimportTarget) {
  const hash = createHash('sha256');
  hash.update(canonicalJson({
    schema: 'ai7.manuscript-reimport-comparison/2',
    draftId,
    manuscriptId: target.manuscriptId,
    branchId: target.branchId,
    checkpoint: target.checkpoint,
    lineage: target.lineage,
  }));
  return {
    update: (mapping: ReimportMappingFact) => hash.update(`\n${canonicalJson(mapping)}`),
    digest: () => hash.digest('hex'),
  };
}

/**
 * The digest of a comparison's resolutions: every mapping's identity in position order, then — since the
 * chapter-level comparison (Issue #412, S63; schema `/3`) — every row's verb in ordinal order, so a commit reads
 * exactly the rows the editor resolved. A comparison prepared before it keeps its `/2` digest.
 */
export function createReimportResolutionHasher() {
  const hash = createHash('sha256');
  hash.update(canonicalJson({ schema: 'ai7.manuscript-reimport-resolutions/3' }));
  return {
    update: (
      mappingId: string,
      resolution: 'preserve-current-identity' | 'create-new-identity' | 'retire-current-identity',
      resolvedCurrentBlockId: string | null,
    ) => hash.update(`\n${canonicalJson({ mappingId, resolution, resolvedCurrentBlockId })}`),
    group: (groupId: string, verb: ReimportGroupVerb) => hash.update(`\n${canonicalJson({ groupId, verb })}`),
    digest: () => hash.digest('hex'),
  };
}

export function emptyReimportResolutionDigest(): string {
  return createReimportResolutionHasher().digest();
}

export function createReimportReviewDigest(
  snapshot: DraftSnapshot,
  target: ResolvedReimportTarget,
  comparisonDigest: string,
  resolutionDigest: string,
  degradationDecisionState: ImportDegradationDecisionReviewProjection['state'],
): string {
  return sha256(canonicalJson({
    schema: 'ai7.manuscript-reimport-review/1',
    draftId: snapshot.draftId,
    draftVersion: snapshot.version,
    target: {
      bookId: target.bookId,
      stableIdentity: target.stableIdentity,
      manuscriptId: target.manuscriptId,
      branchId: target.branchId,
      relationship: 'reimport',
      bookStateDigest: target.bookStateDigest,
    },
    checkpoint: target.checkpoint,
    lineage: target.lineage,
    sourceVersionDisposition: target.sourceVersionDisposition,
    reuseSourceVersionId: target.reuseSourceVersionId,
    source: {
      objectDigest: snapshot.objectDigest,
      sourceDigest: snapshot.sourceDigest,
      contentDigest: snapshot.contentDigest,
      structureDigest: snapshot.structureDigest,
      parserIdentity: snapshot.parserIdentity,
    },
    comparisonDigest,
    resolutionDigest,
    degradationDecision: degradationDecisionState,
    namedNonEffects: MANUSCRIPT_REIMPORT_NON_EFFECTS,
  }));
}

export function sourceImportRecordsToCreate(
  target: ResolvedSourceImportTarget,
): ReadonlyArray<string> {
  const bookRecords = target.kind === 'new-book' ? ['图书与稳定标识', '图书编辑维度集（8 项）'] : [];
  const sourceRecords = target.sourceVersionDisposition === 'created'
    ? ['图书拥有的来源版本', '来源记录']
    : ['复用已明确选择的同图书来源版本与来源记录'];
  return [...bookRecords, ...sourceRecords, '来源导入记录'];
}

export function sourceImportRetainedBoundary(snapshot: DraftSnapshot): ReviewBeforeSourceImportProjection['retainedBoundary'] {
  return {
    kind: 'complete-local-file',
    label: sourceImportRetainedBoundaryLabel(snapshot.sourceFormat, snapshot.parserIdentity !== null),
    format: snapshot.sourceFormat,
    displayName: snapshot.displayName,
    sourceSha256: snapshot.sourceDigest,
    sourceBytes: snapshot.sourceBytes,
    contentDigest: snapshot.contentDigest,
    structureDigest: snapshot.structureDigest,
  };
}

export function createSourceImportReviewDigest(
  snapshot: DraftSnapshot,
  target: ResolvedSourceImportTarget,
  identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
): string {
  return sha256(canonicalJson({
    // Revision 2: the retained boundary now carries the identified format and may carry no parse.
    schema: 'ai7.source-import-review/2',
    draftId: snapshot.draftId,
    draftVersion: snapshot.version,
    target: target.kind === 'new-book'
      ? {
          kind: target.kind,
          choiceId: target.choiceId,
          confirmedTitle: target.confirmedTitle,
          bookId: target.bookId,
          stableIdentity: target.stableIdentity,
          relationship: 'source-only',
        }
      : {
          kind: target.kind,
          bookId: target.bookId,
          stableIdentity: target.stableIdentity,
          title: target.title,
          internalNumber: target.internalNumber,
          relationship: 'source-only',
          bookStateDigest: target.bookStateDigest,
          sourceVersionDisposition: target.sourceVersionDisposition,
          reuseSourceVersionId: target.reuseSourceVersionId,
        },
    retainedBoundary: sourceImportRetainedBoundary(snapshot),
    provenance: {
      acquisitionPath: 'native-file-picker',
      locality: 'local-provider-free',
      acquiredAt: snapshot.stagedAt,
    },
    parserIdentity: snapshot.parserIdentity,
    objectDigest: snapshot.objectDigest,
    identityFindings,
    recordsToCreate: sourceImportRecordsToCreate(target),
    namedNonEffects: SOURCE_IMPORT_NON_EFFECTS,
    editorialDimensionSet: target.kind === 'new-book'
      ? { ...BASELINE_EDITORIAL_DIMENSION_SET, digest: BASELINE_EDITORIAL_DIMENSION_SET_DIGEST }
      : { preservedBookStateDigest: target.bookStateDigest },
  }));
}

/**
 * The fidelity a review states: the staged report with the text-box choice the review made (ADR 0086
 * §2), and the plan it rebuilds to. The staged report itself always states the default, `retain`.
 */
export interface ReviewedFidelity {
  fidelity: FidelityCategoryProjection[];
  plan: ImportFidelityPlan;
  word?: WordIntakePlan;
  /** The confirmed structure (Issue #1205); absent or null when the review confirmed none. */
  structure?: ImportStructureChoice | null;
}

/**
 * Revision 6 of the review digest covers the text-box choice and the fidelity that states it (ADR 0086):
 * a review that merges its text boxes and one that keeps them are different reviews.
 */
export function createImportReviewDigestV6(
  snapshot: DraftSnapshot,
  draftVersion: number,
  reviewed: ReviewedFidelity,
  target: ResolvedImportTarget,
  identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
  profile: BuiltInWorkflowProfile,
): string {
  const { plan } = reviewed;
  return sha256(canonicalJson({
    schema: 'ai7.manuscript-import-review/6',
    draftId: snapshot.draftId,
    draftVersion,
    target: target.kind === 'new-book'
      ? {
          kind: 'new-book',
          choiceId: target.choiceId,
          confirmedTitle: target.confirmedTitle,
        }
      : {
          kind: 'existing-book',
          bookId: target.bookId,
          stableIdentity: target.stableIdentity,
          title: target.title,
          internalNumber: target.internalNumber,
          relationship: target.relationship,
          bookStateDigest: target.bookStateDigest,
        },
    source: {
      displayName: snapshot.displayName,
      provenance: 'native-file-picker/local-provider-free',
      objectDigest: snapshot.objectDigest,
      parserIdentity: snapshot.parserIdentity,
      sourceDigest: snapshot.sourceDigest,
      sourceBytes: snapshot.sourceBytes,
      contentDigest: snapshot.contentDigest,
      structureDigest: snapshot.structureDigest,
    },
    identityFindings,
    fidelity: reviewed.fidelity,
    ...(reviewed.word === undefined ? {} : { word: reviewed.word.prepared }),
    textBoxDisposition: plan.textBoxDisposition,
    ...(reviewed.structure ? { structure: reviewed.structure } : {}),
    degradationDecision: plan.degradations.length === 0
      ? null
      : {
          schema: DEGRADATION_DECISION_SCHEMA,
          scope: 'this-import-only',
          state: 'accepted-complete-set',
          items: plan.degradations,
        },
    recordsToCreate: recordsToCreate(plan, target.kind, wordIntakeRecords(reviewed.word)),
    nonEffects: nonEffects(plan),
    workflowProfile: {
      projection: profile.projection,
      native: profile.native,
    },
    editorialDimensionSet: target.kind === 'new-book'
      ? { ...BASELINE_EDITORIAL_DIMENSION_SET, digest: BASELINE_EDITORIAL_DIMENSION_SET_DIGEST }
      : { preservedBookStateDigest: target.bookStateDigest },
  }));
}

export function reconstructReviewedTargetChoice(
  snapshot: DraftSnapshot,
  confirmedTitle: string,
  plan: ImportFidelityPlan,
  identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
): NewBookImportTargetChoiceId | null {
  const targetChoice = newBookTargetChoice(identityFindings);
  if (
    createNewBookReviewDigestV4(
      snapshot,
      confirmedTitle,
      snapshot.version,
      plan,
      targetChoice.id,
      identityFindings,
    ) === snapshot.reviewDigest
  ) {
    return targetChoice.id;
  }
  return null;
}

export const LEGACY_WORKFLOW_PROFILE = {
  id: 'ai7.manuscript.editorial.zh-CN',
  name: '基础书稿编辑流程',
  version: '1.0.0',
  phases: ['接收与准备', '来源建设', '起草', '审阅与核查', '定稿', '交付', '维护'],
} as const;
export const BASELINE_EDITORIAL_DIMENSION_SET = {
  profileId: 'ai7.editorial.baseline',
  name: '基础图书编辑维度集',
  profileVersion: '1.0.0',
  weightSemantics: '中性起始权重；非穷尽评分量表',
  dimensions: [
    { id: 'literary-quality-voice', label: '文学质量与声音', weight: 1 },
    { id: 'theme-values-social-cultural-context', label: '主题、价值观与社会文化语境', weight: 1 },
    { id: 'structure-narrative-coherence', label: '结构与叙事连贯性', weight: 1 },
    { id: 'chinese-language-style', label: '中文语言与风格', weight: 1 },
    { id: 'factual-source-integrity', label: '事实与来源完整性', weight: 1 },
    { id: 'readership-market-positioning', label: '读者与市场定位', weight: 1 },
    { id: 'legal-rights-ethical-policy-risk', label: '法律、权利、伦理与出版政策风险', weight: 1 },
    { id: 'production-cross-deliverable-consistency', label: '制作与跨交付物一致性', weight: 1 },
  ],
} as const;
export const LEGACY_WORKFLOW_PROFILE_DIGEST = sha256(canonicalJson(LEGACY_WORKFLOW_PROFILE));
export const BASELINE_EDITORIAL_DIMENSION_SET_DIGEST = sha256(canonicalJson(BASELINE_EDITORIAL_DIMENSION_SET));
export const EDITORIAL_DIMENSIONS = BASELINE_EDITORIAL_DIMENSION_SET.dimensions;
const recordOperations = { identityFindings };
