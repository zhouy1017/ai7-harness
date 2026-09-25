import { isAbsolute } from 'node:path';
import {
  BASELINE_ANALYSIS_MODE_GOALS,
  BASELINE_ANALYSIS_UPDATE_MODES,
  MAX_BLOCK_CODE_UNITS,
  MAX_EDIT_CODE_UNITS,
  MAX_EXPORT_DESTINATION_CODE_UNITS,
  MAX_MARK_BODY_CODE_UNITS,
  MAX_MILESTONE_PURPOSE_CODE_UNITS,
  MAX_PROPOSAL_CONFLICT_UNITS,
  MAX_PUBLICATION_BASIS_CHARACTERS,
  MAX_PRODUCTION_DOCUMENT_DELIVERY_NOTE_CHARACTERS,
  MAX_PRODUCTION_DOCUMENT_RECIPIENT_CHARACTERS,
  MAX_BOOK_DELIVERY_PACKAGE_PURPOSE_CHARACTERS,
  MAX_BOOK_AUTHORS,
  MAX_BOOK_EDITORS,
  MAX_BOOK_PERSON_NAME_CHARACTERS,
  MAX_BOOK_RELATED_PEOPLE,
  MAX_BOOK_SUMMARY_FILTER_CHARACTERS,
  MAINTENANCE_CLASSIFICATIONS,
  LIBRARY_MATERIAL_KINDS,
  MAX_LEARNING_ELIGIBILITY_REASON_GRAPHEMES,
  type LibraryMaterialKind,
  MAX_MAINTENANCE_ERRATA_CHARACTERS,
  MAX_MAINTENANCE_EVIDENCE_CHARACTERS,
  MAX_MAINTENANCE_REASON_CHARACTERS,
  PRODUCTION_DOCUMENT_RECIPIENT_KINDS,
  PRODUCTION_DOCUMENT_PHASE_ACTIONS,
  PRODUCTION_DOCUMENT_PHASE_IDS,
  MAX_PRODUCTION_DOCUMENT_PHASE_REASON_CHARACTERS,
  type ProductionDocumentPhaseAction,
  type ProductionDocumentPhaseId,
  type ProductionDocumentRecipientKind,
  MAX_PUBLICATION_SCOPE_CHARACTERS,
  MAX_REPLACEMENT_EXCLUSIONS,
  MAX_REVIEW_FINDING_REASON_CHARACTERS,
  MAX_REVIEW_RUN_CATEGORIES,
  J03_TASK_GOAL,
  MILESTONE_PURPOSE_KINDS,
  REVIEW_FINDING_ID_PATTERN,
  REVIEW_FINDING_PAGE_KEYS,
  REVIEW_FINDING_SEVERITIES,
  REVIEW_FINDING_STATUSES,
  REVIEW_SCOPE_KINDS,
  TASK_PLAN_KINDS,
  isReviewCategoryId,
  publicationText,
  SERIES_KNOWLEDGE_CLASSES,
  SERIES_KNOWLEDGE_REUSE_SCOPES,
  type BaselineAnalysisUpdateMode,
  type MilestonePurposeKind,
  type ReviewFindingSeverity,
  type ReviewFindingStatus,
  type ReviewScopeKind,
  type ServiceRequest,
  type TaskPlanKind,
} from '../shared/protocol.js';
import { CONFLICT_RESOLUTIONS, type ConflictResolution } from '../shared/conflict-units.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX_DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const textDecoder = new TextDecoder('utf-8', { fatal: true });

export class ProtocolError extends Error {
  readonly code = 'PROTOCOL_INVALID';

  constructor(readonly requestId = 'invalid') {
    super('服务请求格式无效。');
    this.name = 'ProtocolError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function isSafeInteger(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

function isBoundedString(value: unknown, maximum: number, allowEmpty = false): value is string {
  return typeof value === 'string' && value.isWellFormed() && value.length <= maximum && (allowEmpty || value.length > 0);
}

function requireInput(value: unknown, keys: readonly string[], requestId: string): Record<string, unknown> {
  if (!isRecord(value) || !hasExactKeys(value, keys)) throw new ProtocolError(requestId);
  return value;
}

/** Every required key, and nothing beyond them but the optional ones. */
function requireInputWithOptional(value: unknown, required: readonly string[], optional: readonly string[], requestId: string): Record<string, unknown> {
  if (!isRecord(value) || !required.every((key) => Object.hasOwn(value, key)) ||
      !Object.keys(value).every((key) => required.includes(key) || optional.includes(key))) {
    throw new ProtocolError(requestId);
  }
  return value;
}

/** An optional key is absent, `null`, or a value the check accepts. */
function optionalOrNull(input: Record<string, unknown>, key: string, check: (value: unknown) => boolean): boolean {
  return !Object.hasOwn(input, key) || input[key] === null || check(input[key]);
}

const MARK_BLOCK_PATTERN = /^blk_[0-9a-f]{24}$/;

/** A feedback reason (Issue #94, S38): `null`, or one choice with the editor's words or none. */
function validFeedbackReason(value: unknown): boolean {
  return value === null || (isRecord(value) && hasExactKeys(value, ['choice', 'text']) && isBoundedString(value.choice, 40) &&
    /^[a-z][a-z-]{0,39}$/u.test(value.choice) && (value.text === null || isBoundedString(value.text, 4_000, true)));
}

const EVALUATION_TEXT_CODE_UNITS = 16_000;

function optionalText(value: unknown): boolean {
  return value === null || isBoundedString(value, EVALUATION_TEXT_CODE_UNITS, true);
}

/**
 * One 评估 version's content (Issue #429, S81a): its items, risks and lists of their closed shapes, each field present; the
 * store holds them to the profile, the scale and the bounds.
 */
function validEvaluationContent(value: unknown): boolean {
  if (!isRecord(value) || !hasExactKeys(value, ['items', 'risks', 'readiness', 'strengths', 'weaknesses', 'verdict', 'conclusion'])) return false;
  const lines = (list: unknown): boolean => Array.isArray(list) && list.length <= 64 && list.every((line) => isBoundedString(line, 2_000, true));
  return Array.isArray(value.items) && value.items.length <= 32 && value.items.every((item) => isRecord(item) &&
      hasExactKeys(item, ['itemId', 'score', 'notRated', 'comment']) && isBoundedString(item.itemId, 64) &&
      (item.score === null || (typeof item.score === 'number' && Number.isFinite(item.score))) && optionalText(item.notRated) && optionalText(item.comment)) &&
    Array.isArray(value.risks) && value.risks.length <= 16 && value.risks.every((risk) => isRecord(risk) &&
      hasExactKeys(risk, ['riskId', 'level', 'statement', 'reviewed']) && isBoundedString(risk.riskId, 64) &&
      (risk.level === null || risk.level === 'low' || risk.level === 'medium' || risk.level === 'high') && optionalText(risk.statement) &&
      typeof risk.reviewed === 'boolean') &&
    lines(value.readiness) && lines(value.strengths) && lines(value.weaknesses) && optionalText(value.verdict) &&
    (value.conclusion === null || value.conclusion === 'recommend' || value.conclusion === 'revise' || value.conclusion === 'defer' || value.conclusion === 'reject');
}

/**
 * One 资料库 decision (Issue #427, S79c): an attribution to one Book or to the house, or a Learning Eligibility choice with
 * its optional note — each of exactly its own keys. Whether the Book exists and the choice fits the attribution is the store's.
 */
function validLibraryDecision(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === 'attribution') {
    if (!hasExactKeys(value, ['kind', 'attribution']) || !isRecord(value.attribution)) return false;
    const attribution = value.attribution;
    return attribution.scope === 'house'
      ? hasExactKeys(attribution, ['scope'])
      : attribution.scope === 'book' && hasExactKeys(attribution, ['scope', 'bookId']) &&
        isBoundedString(attribution.bookId, 36) && UUID_PATTERN.test(attribution.bookId);
  }
  return value.kind === 'eligibility' && hasExactKeys(value, ['kind', 'choice', 'reason']) &&
    (value.choice === 'book' || value.choice === 'house' || value.choice === 'excluded' || value.choice === 'deferred') &&
    (value.reason === null || isBoundedString(value.reason, MAX_LEARNING_ELIGIBILITY_REASON_GRAPHEMES * 8, true));
}

/** A Series Knowledge Candidate's item (Issue #63, S28b): a new one by name and class, or one existing item by identity. */
function validKnowledgeTarget(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === 'new') {
    return hasExactKeys(value, ['kind', 'subject', 'knowledgeClass']) && isBoundedString(value.subject, 400) &&
      (SERIES_KNOWLEDGE_CLASSES as readonly unknown[]).includes(value.knowledgeClass);
  }
  return value.kind === 'existing' && hasExactKeys(value, ['kind', 'itemId']) && validUuid(value.itemId);
}

/** The manuscript span a candidate cites, as a mark names its range, or `null` for the editor's own words. */
function validKnowledgeSpan(value: unknown): boolean {
  if (value === null) return true;
  return isRecord(value) && hasExactKeys(value, [
    'manuscriptId', 'branchId', 'windowStartBlockId', 'baseRevisionId', 'expectedJournalSequence', 'blockId', 'baseBlockDigest', 'fromGrapheme',
    'toGrapheme', 'selectedText',
  ]) && validMarkBinding(value) && isBoundedString(value.baseRevisionId, 36) && UUID_PATTERN.test(value.baseRevisionId) &&
    isSafeInteger(value.expectedJournalSequence, 0) && isBoundedString(value.blockId, 28) && MARK_BLOCK_PATTERN.test(value.blockId) &&
    isBoundedString(value.baseBlockDigest, 64) && HEX_DIGEST_PATTERN.test(value.baseBlockDigest) && isSafeInteger(value.fromGrapheme, 0) &&
    isSafeInteger(value.toGrapheme, 1) && isBoundedString(value.selectedText, MAX_BLOCK_CODE_UNITS);
}

function validMarkBinding(input: Record<string, unknown>): boolean {
  return isBoundedString(input.manuscriptId, 36) && UUID_PATTERN.test(input.manuscriptId) &&
    isBoundedString(input.branchId, 36) && UUID_PATTERN.test(input.branchId) &&
    isBoundedString(input.windowStartBlockId, 28) && MARK_BLOCK_PATTERN.test(input.windowStartBlockId);
}

function validMarkKind(value: unknown): boolean {
  return value === 'change-suggestion' || value === 'annotation' || value === 'editor-note' || value === 'personal-highlight';
}

function validHighlightColor(value: unknown): boolean {
  return value === null || value === 1 || value === 2 || value === 3;
}

function validUuid(value: unknown): value is string {
  return isBoundedString(value, 36) && UUID_PATTERN.test(value);
}

/** One unit of a Resolution Draft: a resolution or `null`, and words — possibly none — only when edited. */
function validConflictUnitResolution(value: unknown): boolean {
  if (!isRecord(value) || !hasExactKeys(value, ['resolution', 'text'])) return false;
  if (value.resolution === null) return value.text === null;
  if (!CONFLICT_RESOLUTIONS.includes(value.resolution as ConflictResolution)) return false;
  return value.resolution === 'edited' ? isBoundedString(value.text, MAX_MARK_BODY_CODE_UNITS, true) : value.text === null;
}

/** Distinct category identities, between `minimum` and the most one Review Run request names. */
function validReviewCategoryIds(values: readonly unknown[], minimum: number): boolean {
  return values.length >= minimum && values.length <= MAX_REVIEW_RUN_CATEGORIES &&
    values.every((value) => isReviewCategoryId(value)) && new Set(values).size === values.length;
}

/** 选章 names its first and last chapter by each chapter's first block; every other scope names neither. */
function validReviewRunScope(value: unknown): boolean {
  if (!isRecord(value) || !hasExactKeys(value, ['kind', 'fromChapterBlockId', 'toChapterBlockId']) ||
      !REVIEW_SCOPE_KINDS.includes(value.kind as ReviewScopeKind)) return false;
  return value.kind === 'chapters'
    ? isBoundedString(value.fromChapterBlockId, 28) && MARK_BLOCK_PATTERN.test(value.fromChapterBlockId) &&
      isBoundedString(value.toChapterBlockId, 28) && MARK_BLOCK_PATTERN.test(value.toChapterBlockId)
    : value.fromChapterBlockId === null && value.toChapterBlockId === null;
}

/**
 * 忽略并说明's reason: not blank, and at most the reason's characters once trimmed. The raw text may
 * carry the whitespace the store trims, so its own ceiling leaves room for that and for characters
 * outside the Basic Multilingual Plane.
 */
function validReviewFindingReason(value: unknown): boolean {
  if (!isBoundedString(value, MAX_REVIEW_FINDING_REASON_CHARACTERS * 4)) return false;
  const reason = value.trim();
  return reason.length > 0 && [...reason].length <= MAX_REVIEW_FINDING_REASON_CHARACTERS;
}

/**
 * 发稿范围 or 依据: not blank, and at most `maximum` characters once normalized and trimmed, counted as the
 * store counts them. The raw text may carry the whitespace the store trims and characters outside the
 * Basic Multilingual Plane, so its own ceiling leaves room for both.
 */
/** A house type's identity: lower-case words joined by hyphens, as the type configuration spells them. */
function validProductionDocumentTypeId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value) && value.length <= 64;
}

function validPublicationText(value: unknown, maximum: number): boolean {
  return isBoundedString(value, maximum * 4) && publicationText(value, maximum) !== null;
}

/** One later step of a 维护事项 (Issue #426, S68a): a link by its identity, or a conclusion with its status and words. */
function validMaintenanceStep(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === 'link-proposal') return hasExactKeys(value, ['kind', 'markId']) && validUuid(value.markId);
  if (value.kind === 'link-publication') return hasExactKeys(value, ['kind', 'publicationVersionId']) && validUuid(value.publicationVersionId);
  return value.kind === 'conclude' && hasExactKeys(value, ['kind', 'status', 'outcome']) &&
    (value.status === 'unresolved' || value.status === 'complete') && validPublicationText(value.outcome, MAX_MAINTENANCE_REASON_CHARACTERS);
}

/** The version an export names: the current revision, or one milestone by its identity (Issue #413). */
/** One of the three export formats (Issue #500, S64b). */
function validExportFormat(value: unknown): boolean {
  return value === 'docx' || value === 'pdf' || value === 'markdown';
}

function validExportTarget(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === 'current') return hasExactKeys(value, ['kind']);
  // One recorded version of a 审阅报告 (Issue #500, S64b part 2).
  if (value.kind === 'report') return hasExactKeys(value, ['kind', 'reportId']) && validUuid(value.reportId);
  // One saved version of a Production Document (Issue #415, S66b).
  if (value.kind === 'document') return hasExactKeys(value, ['kind', 'documentId', 'revisionId']) && validUuid(value.documentId) && validUuid(value.revisionId);
  return value.kind === 'milestone' && hasExactKeys(value, ['kind', 'milestoneId']) && validUuid(value.milestoneId);
}

/** 含批注, 含修改建议（作为修订） and 含备注, each a switch and nothing else (V2-UX-EXP-023). */
function validExportOptions(value: unknown): boolean {
  return isRecord(value) && hasExactKeys(value, ['includeAnnotations', 'includeSuggestions', 'includeEditorNotes']) &&
    typeof value.includeAnnotations === 'boolean' && typeof value.includeSuggestions === 'boolean' &&
    typeof value.includeEditorNotes === 'boolean';
}

function validRecoverySelection(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (value.kind === 'journal' && hasExactKeys(value, ['kind'])) ||
    (value.kind === 'checkpoint' && hasExactKeys(value, ['kind'])) ||
    (value.kind === 'snapshot' && hasExactKeys(value, ['kind', 'snapshotId']) &&
      isBoundedString(value.snapshotId, 36) && UUID_PATTERN.test(value.snapshotId));
}

function validRecoveryWindowTarget(value: unknown): boolean {
  return isRecord(value) && (
    (value.kind === 'start' && hasExactKeys(value, ['kind'])) ||
    (value.kind === 'after' && hasExactKeys(value, ['kind', 'position']) && isSafeInteger(value.position, 1))
  );
}

export function decodeRequest(frame: Uint8Array): ServiceRequest {
  let value: unknown;
  try {
    value = JSON.parse(textDecoder.decode(frame));
  } catch {
    throw new ProtocolError();
  }
  const tentativeId = isRecord(value) && isBoundedString(value.id, 64) ? value.id : 'invalid';
  if (!isRecord(value) || !hasExactKeys(value, ['id', 'op', 'input']) || !UUID_PATTERN.test(tentativeId)) {
    throw new ProtocolError(tentativeId);
  }
  const { op } = value;
  if (typeof op !== 'string') throw new ProtocolError(tentativeId);

  switch (op) {
    case 'ready':
    case 'getStartup':
    case 'getImportStartup':
    case 'listPriorWork':
    case 'getModelServiceStoredState':
    // 待我处理 (Issue #424) reads across every Book, so it names none.
    case 'inspectGlobalAttention':
    case 'runReconnectPreflight':
    case 'inspectDefaultExecutionRules':
    // 知识库 › 审阅规范文件 (Issue #427, S79a) reads across every Book, so it names none.
    case 'inspectReviewGuidelines':
    // 知识库 › 范例 (Issue #427, S79b) reads every published Book, so it names none.
    case 'inspectExemplars':
    case 'inspectKnowledgeProcedures':
    case 'inspectLibraryMaterials':
    case 'inspectEvaluationProfiles':
    case 'shutdown': {
      requireInput(value.input, [], tentativeId);
      break;
    }
    case 'resolveBookWorkbenchRoute': {
      if (!isRecord(value.input)) throw new ProtocolError(tentativeId);
      const input = value.input;
      const valid = input.kind === 'book'
        ? hasExactKeys(input, ['kind', 'bookId']) &&
          isBoundedString(input.bookId, 36) && UUID_PATTERN.test(input.bookId)
        : input.kind === 'revision' &&
          hasExactKeys(input, ['kind', 'revisionId']) &&
          isBoundedString(input.revisionId, 36) && UUID_PATTERN.test(input.revisionId);
      if (!valid) throw new ProtocolError(tentativeId);
      break;
    }
    case 'getHistoricalRevision': {
      const input = requireInput(value.input, ['revisionId', 'cursor'], tentativeId);
      if (!isBoundedString(input.revisionId, 36) || !UUID_PATTERN.test(input.revisionId) ||
          !(input.cursor === null || isBoundedString(input.cursor, 1_024))) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'saveModelServiceConnection': {
      const input = requireInput(
        value.input,
        ['connectionName', 'credentialReference', 'credentialOperationState'],
        tentativeId,
      );
      if (!isBoundedString(input.connectionName, 80) ||
          !isBoundedString(input.credentialReference, 36) || !UUID_PATTERN.test(input.credentialReference) ||
          (input.credentialOperationState !== 'ready' && input.credentialOperationState !== 'needs-attention')) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'setModelServiceCredentialState': {
      const input = requireInput(value.input, ['credentialReference', 'credentialOperationState'], tentativeId);
      if (!isBoundedString(input.credentialReference, 36) || !UUID_PATTERN.test(input.credentialReference) ||
          !['ready', 'missing', 'needs-attention'].includes(input.credentialOperationState as string)) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'listBooks': {
      const input = requireInputWithOptional(value.input, ['after'], ['filter'], tentativeId);
      const after = input.after;
      if (
        !(after === null || (isRecord(after) && hasExactKeys(after, ['title', 'bookId']) &&
          isBoundedString(after.title, 180) && isBoundedString(after.bookId, 36) && UUID_PATTERN.test(after.bookId)))
      ) throw new ProtocolError(tentativeId);
      // 书库's search (Issue #431, S83; 书系 Issue #63, S28a): one field, or all of them, and the words within their bound.
      if (input.filter !== undefined && !(isRecord(input.filter) && hasExactKeys(input.filter, ['field', 'text']) &&
          (input.filter.field === 'all' || input.filter.field === 'title' || input.filter.field === 'author' || input.filter.field === 'editor' ||
            input.filter.field === 'series') &&
          validPublicationText(input.filter.text, MAX_BOOK_SUMMARY_FILTER_CHARACTERS) && !/[\r\n]/u.test(String(input.filter.text)))) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    // 作者 · 责编 · 相关人 (Issue #431, S83): the whole set, each name within its bound, against the version read.
    case 'updateBookPeople': {
      const input = requireInput(value.input, ['bookId', 'expectedVersion', 'authors', 'editors', 'related'], tentativeId);
      const name = (entry: unknown): boolean => validPublicationText(entry, MAX_BOOK_PERSON_NAME_CHARACTERS);
      if (!validUuid(input.bookId) || !isSafeInteger(input.expectedVersion, 0) ||
          !Array.isArray(input.authors) || input.authors.length > MAX_BOOK_AUTHORS || !input.authors.every(name) ||
          !Array.isArray(input.editors) || input.editors.length > MAX_BOOK_EDITORS || !input.editors.every(name) ||
          !Array.isArray(input.related) || input.related.length > MAX_BOOK_RELATED_PEOPLE ||
          !input.related.every((entry) => isRecord(entry) && hasExactKeys(entry, ['roleId', 'name']) &&
            typeof entry.roleId === 'string' && /^[a-z][a-z-]{0,31}$/.test(entry.roleId) && name(entry.name))) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'getRecoveryComparison': {
      const input = requireInput(value.input, ['attentionId'], tentativeId);
      if (!isBoundedString(input.attentionId, 36) || !UUID_PATTERN.test(input.attentionId)) throw new ProtocolError(tentativeId);
      break;
    }
    case 'viewRecoveryCandidate': {
      const input = requireInput(value.input, ['attentionId', 'expectedAttentionVersion', 'selection', 'target'], tentativeId);
      if (!isBoundedString(input.attentionId, 36) || !UUID_PATTERN.test(input.attentionId) ||
          !isSafeInteger(input.expectedAttentionVersion, 1) || !validRecoverySelection(input.selection) ||
          !validRecoveryWindowTarget(input.target)) throw new ProtocolError(tentativeId);
      break;
    }
    case 'deferRecovery': {
      const input = requireInput(value.input, ['attentionId', 'expectedAttentionVersion'], tentativeId);
      if (!isBoundedString(input.attentionId, 36) || !UUID_PATTERN.test(input.attentionId) ||
          !isSafeInteger(input.expectedAttentionVersion, 1)) throw new ProtocolError(tentativeId);
      break;
    }
    case 'restoreRecovery': {
      const input = requireInput(value.input, ['restorationId', 'attentionId', 'expectedAttentionVersion', 'selection'], tentativeId);
      if (!isBoundedString(input.restorationId, 36) || !UUID_PATTERN.test(input.restorationId) ||
          !isBoundedString(input.attentionId, 36) || !UUID_PATTERN.test(input.attentionId) ||
          !isSafeInteger(input.expectedAttentionVersion, 1) || !validRecoverySelection(input.selection)) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'stageSelectedManuscript': {
      const input = requireInput(value.input, ['selectionToken', 'selectedPath'], tentativeId);
      if (
        !isBoundedString(input.selectionToken, 36) ||
        !UUID_PATTERN.test(input.selectionToken) ||
        !isBoundedString(input.selectedPath, 32_767) ||
        !isAbsolute(input.selectedPath)
      ) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'continueImportDraft':
    case 'abandonImportDraft': {
      const input = requireInput(value.input, ['draftId', 'expectedDraftVersion'], tentativeId);
      if (
        !isBoundedString(input.draftId, 36) ||
        !UUID_PATTERN.test(input.draftId) ||
        !isSafeInteger(input.expectedDraftVersion, 1)
      ) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'reselectImportDraft': {
      const input = requireInput(
        value.input,
        ['draftId', 'expectedDraftVersion', 'selectionToken', 'selectedPath'],
        tentativeId,
      );
      if (
        !isBoundedString(input.draftId, 36) ||
        !UUID_PATTERN.test(input.draftId) ||
        !isSafeInteger(input.expectedDraftVersion, 1) ||
        !isBoundedString(input.selectionToken, 36) ||
        !UUID_PATTERN.test(input.selectionToken) ||
        !isBoundedString(input.selectedPath, 32_767) ||
        !isAbsolute(input.selectedPath)
      ) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'prepareBookCreation': {
      const input = requireInput(value.input, ['title', 'internalNumber'], tentativeId);
      if (
        !isBoundedString(input.title, 180) ||
        !(input.internalNumber === null || isBoundedString(input.internalNumber, 80))
      ) throw new ProtocolError(tentativeId);
      break;
    }
    case 'commitBookCreation': {
      const input = requireInput(
        value.input,
        ['bookId', 'stableIdentity', 'title', 'internalNumber', 'reviewDigest'],
        tentativeId,
      );
      if (
        !isBoundedString(input.bookId, 36) || !UUID_PATTERN.test(input.bookId) ||
        input.stableIdentity !== `book:${input.bookId}` ||
        !isBoundedString(input.title, 180) ||
        !(input.internalNumber === null || isBoundedString(input.internalNumber, 80)) ||
        !isBoundedString(input.reviewDigest, 64) || !HEX_DIGEST_PATTERN.test(input.reviewDigest)
      ) throw new ProtocolError(tentativeId);
      break;
    }
    case 'getBookOverview': {
      const input = requireInput(value.input, ['bookId', 'historyCursor'], tentativeId);
      const cursor = input.historyCursor;
      if (!isBoundedString(input.bookId, 36) || !UUID_PATTERN.test(input.bookId) ||
        !(cursor === null || (isRecord(cursor) &&
          hasExactKeys(cursor, ['occurredAt', 'kindRank', 'stableId', 'direction']) &&
          isBoundedString(cursor.occurredAt, 64) && isSafeInteger(cursor.kindRank, 1) && cursor.kindRank <= 3 &&
          isBoundedString(cursor.stableId, 36) && UUID_PATTERN.test(cursor.stableId) &&
          (cursor.direction === 'forward' || cursor.direction === 'backward')))) throw new ProtocolError(tentativeId);
      break;
    }
    case 'inspectEditorialWorkspaceProfile':
    case 'installEditorialWorkspaceProfile':
    case 'enableEditorialWorkspaceProfile':
    case 'inspectTaskAuthorization': {
      const input = requireInput(value.input, ['bookId'], tentativeId);
      if (!isBoundedString(input.bookId, 36) || !UUID_PATTERN.test(input.bookId)) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    // The Task Drawer (Issue #418): one of the three kinds, and the Task — a Review Run is always named;
    // the other two may ask for the Book's current Task with `null`.
    case 'inspectTaskPlan': {
      const input = requireInput(value.input, ['bookId', 'kind', 'ref'], tentativeId);
      if (!validUuid(input.bookId) || !TASK_PLAN_KINDS.includes(input.kind as TaskPlanKind) ||
          !(input.ref === null ? input.kind !== 'review-run' : validUuid(input.ref))) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'inspectBaselineAnalysis': {
      const input = requireInput(value.input, ['bookId', 'revisionId'], tentativeId);
      if (!isBoundedString(input.bookId, 36) || !UUID_PATTERN.test(input.bookId) ||
          !(input.revisionId === null || (isBoundedString(input.revisionId, 36) && UUID_PATTERN.test(input.revisionId)))) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'inspectForegroundExecutionBoundary': {
      const input = requireInput(value.input, ['bookId', 'runRecordId'], tentativeId);
      if (!isBoundedString(input.bookId, 36) || !UUID_PATTERN.test(input.bookId) ||
          !isBoundedString(input.runRecordId, 36) || !UUID_PATTERN.test(input.runRecordId)) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'prepareTaskAuthorization': {
      const input = requireInput(value.input, ['bookId', 'goal'], tentativeId);
      if (!isBoundedString(input.bookId, 36) || !UUID_PATTERN.test(input.bookId) || input.goal !== J03_TASK_GOAL) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'prepareBaselineAnalysis': {
      // The goal is one of the four fixed mode goals; `update` is null exactly for the first baseline,
      // names the mode whose goal was sent, and carries a block range exactly for `重新分析所选范围`;
      // `reconfirm` is the explicit `重新确认计划` of a prepared Task's pending Plan Revision; `redoOf`, when present, the
      // cancelled Run a 改计划重做 redoes (Issue #422, S76c).
      const input = requireInputWithOptional(value.input, ['bookId', 'goal', 'update', 'reconfirm'], ['redoOf'], tentativeId);
      if (!isBoundedString(input.bookId, 36) || !UUID_PATTERN.test(input.bookId) || typeof input.reconfirm !== 'boolean' ||
          !optionalOrNull(input, 'redoOf', validUuid)) {
        throw new ProtocolError(tentativeId);
      }
      const update = input.update;
      if (update === null) {
        if (input.goal !== BASELINE_ANALYSIS_MODE_GOALS['first-baseline']) throw new ProtocolError(tentativeId);
        break;
      }
      if (!isRecord(update) || !hasExactKeys(update, ['mode', 'selectedRange']) ||
          !BASELINE_ANALYSIS_UPDATE_MODES.includes(update.mode as BaselineAnalysisUpdateMode) ||
          input.goal !== BASELINE_ANALYSIS_MODE_GOALS[update.mode as BaselineAnalysisUpdateMode]) {
        throw new ProtocolError(tentativeId);
      }
      const range = update.selectedRange;
      const validRange = isRecord(range) && hasExactKeys(range, ['startPosition', 'endPosition']) &&
        isSafeInteger(range.startPosition, 1) && isSafeInteger(range.endPosition, 1) && range.endPosition >= range.startPosition;
      if ((update.mode === 'reanalyze-range') !== validRange || (update.mode !== 'reanalyze-range' && range !== null)) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'authorizeTaskAuthorization':
    case 'authorizeBaselineAnalysis':
    case 'startBaselineAnalysisWhenOnline':
    case 'setDefaultExecutionRule': {
      const input = requireInput(value.input, ['bookId', 'taskIntentId', 'planEnvelopeDigest'], tentativeId);
      if (!isBoundedString(input.bookId, 36) || !UUID_PATTERN.test(input.bookId) ||
          !isBoundedString(input.taskIntentId, 36) || !UUID_PATTERN.test(input.taskIntentId) ||
          !isBoundedString(input.planEnvelopeDigest, 64) || !HEX_DIGEST_PATTERN.test(input.planEnvelopeDigest)) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    // 更新计划 (Issue #419): the Task, the version the editor read, and the full set of what the plan leaves out — a few
    // short identities, each once; the ledger decides which of them the plan can leave out.
    case 'editBaselineAnalysisPlan': {
      // `askFirstAdaptations` (Issue #422, S76d) and `runBudgetCeiling` (Issue #51, S16a) are optional: a frame without
      // them still means what it meant. A ceiling is a whole count of tokens, or `null` for none.
      const input = requireInputWithOptional(value.input, ['bookId', 'taskIntentId', 'planEnvelopeDigest', 'removedSteps', 'disallowedAdaptations'],
        ['askFirstAdaptations', 'runBudgetCeiling'], tentativeId);
      const ceiling = (candidate: unknown): boolean => isRecord(candidate) && hasExactKeys(candidate, ['kind', 'maxTotalTokens']) &&
        candidate.kind === 'tokens' && isSafeInteger(candidate.maxTotalTokens, 1) && candidate.maxTotalTokens <= 999_999_999_999;
      const identities = (list: unknown): boolean => Array.isArray(list) && list.length <= 8 &&
        list.every((entry) => isBoundedString(entry, 64) && /^[a-z][a-z-]*$/u.test(entry)) && new Set(list).size === list.length;
      if (!validUuid(input.bookId) || !validUuid(input.taskIntentId) ||
          !isBoundedString(input.planEnvelopeDigest, 64) || !HEX_DIGEST_PATTERN.test(input.planEnvelopeDigest) ||
          !identities(input.removedSteps) || !identities(input.disallowedAdaptations) ||
          (Object.hasOwn(input, 'askFirstAdaptations') && !identities(input.askFirstAdaptations)) ||
          !optionalOrNull(input, 'runBudgetCeiling', ceiling)) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    // 提交回答 (Issue #422, S76d): the question and the Task it belongs to, the one option chosen, and a note or none.
    case 'answerBaselineAnalysisClarification': {
      const input = requireInput(value.input, ['bookId', 'taskIntentId', 'requestId', 'optionId', 'note'], tentativeId);
      if (!validUuid(input.bookId) || !validUuid(input.taskIntentId) || !validUuid(input.requestId) ||
          (input.optionId !== 'retry' && input.optionId !== 'record-gap') ||
          !(input.note === null || isBoundedString(input.note, 500))) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    // 快速开始 (Issue #421): the Task just prepared, its exact plan, and the rule version the editor started under.
    case 'quickStartBaselineAnalysis': {
      const input = requireInput(value.input, ['bookId', 'taskIntentId', 'planEnvelopeDigest', 'ruleVersionId'], tentativeId);
      if (!validUuid(input.bookId) || !validUuid(input.taskIntentId) || !validUuid(input.ruleVersionId) ||
          !isBoundedString(input.planEnvelopeDigest, 64) || !HEX_DIGEST_PATTERN.test(input.planEnvelopeDigest)) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    // 导入新版本 (Issue #427, S79a): the document it versions, and the absolute path main's picker returned.
    case 'previewReviewGuidelineVersion': {
      const input = requireInput(value.input, ['documentId', 'path'], tentativeId);
      if (!isBoundedString(input.documentId, 64) || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$/u.test(input.documentId) ||
          !isBoundedString(input.path, 32_767) || !isAbsolute(input.path)) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'importReviewGuidelineVersion': {
      const input = requireInput(value.input, ['previewId'], tentativeId);
      if (!validUuid(input.previewId)) throw new ProtocolError(tentativeId);
      break;
    }
    // 放入资料… (Issue #427, S79c): the absolute path main's picker returned.
    case 'previewLibraryMaterial': {
      const input = requireInput(value.input, ['path'], tentativeId);
      if (!isBoundedString(input.path, 32_767) || !isAbsolute(input.path)) throw new ProtocolError(tentativeId);
      break;
    }
    // 放入资料库: the preview, and the title and kind the editor gave it; the store holds the title to its bounds.
    case 'addLibraryMaterial': {
      const input = requireInput(value.input, ['previewId', 'title', 'kind'], tentativeId);
      if (!validUuid(input.previewId) || !isBoundedString(input.title, 2_000) || !LIBRARY_MATERIAL_KINDS.includes(input.kind as LibraryMaterialKind)) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    // ②C 评估 (Issue #429, S81a): the route's Book, and a version by its identity or the latest.
    case 'inspectEvaluation': {
      const input = requireInput(value.input, ['bookId', 'recordId'], tentativeId);
      if (!validUuid(input.bookId) || !(input.recordId === null || validUuid(input.recordId))) throw new ProtocolError(tentativeId);
      break;
    }
    case 'startEvaluation': {
      const input = requireInput(value.input, ['bookId'], tentativeId);
      if (!validUuid(input.bookId)) throw new ProtocolError(tentativeId);
      break;
    }
    // 保存评估 or 定稿: the version, how many entries the editor saw, and content of the closed shape; the store holds it to the
    // profile the version snapshotted.
    case 'saveEvaluation': {
      const input = requireInput(value.input, ['bookId', 'recordId', 'expectedEntries', 'content', 'finalize'], tentativeId);
      if (!validUuid(input.bookId) || !validUuid(input.recordId) || !isSafeInteger(input.expectedEntries, 1) || typeof input.finalize !== 'boolean' ||
          !validEvaluationContent(input.content)) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    // ②A 分析反馈 (Issue #94, S38): the route's Book and one of its Result Set Revisions.
    case 'inspectAnalysisFeedback': {
      const input = requireInput(value.input, ['bookId', 'revisionId'], tentativeId);
      if (!validUuid(input.bookId) || !validUuid(input.revisionId)) throw new ProtocolError(tentativeId);
      break;
    }
    // 记录反馈: the item by its place and digest, the latest judgment the editor saw, and the judgment of the closed shape;
    // whether the reason is one offered for it is the store's.
    case 'recordAnalysisFeedback': {
      const input = requireInput(value.input, ['bookId', 'revisionId', 'itemKey', 'itemDigest', 'expectedLatestSignalId', 'judgment', 'reason', 'correction'], tentativeId);
      if (!validUuid(input.bookId) || !validUuid(input.revisionId) || !isBoundedString(input.itemKey, 64) ||
          !/^(?:synopsis|(?:entities|events|relationships|settings)\/\d{1,5})$/u.test(input.itemKey) ||
          !isBoundedString(input.itemDigest, 64) || !HEX_DIGEST_PATTERN.test(input.itemDigest) ||
          !(input.expectedLatestSignalId === null || validUuid(input.expectedLatestSignalId)) ||
          (input.judgment !== 'accurate' && input.judgment !== 'inaccurate' && input.judgment !== 'incomplete') ||
          !validFeedbackReason(input.reason) || !(input.correction === null || isBoundedString(input.correction, 4_000, true))) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    // 质量与学习 › 反馈记录 (Issue #61, S26c): every Book's feedback; it names nothing.
    case 'inspectFeedbackHistory':
    // 设置 › 评估校准与预测 (Issue #430, S82): the house's page; it names nothing.
    case 'inspectEvaluationCalibration':
    // 设置 › 数据与存储 › 版本 (Issue #433, S85a): the store's versions; it names nothing.
    case 'inspectDataVersion':
    // 导出数据库 (Issue #434, S86a): the approved exports; it names nothing.
    case 'inspectDatabaseExports':
      requireInput(value.input, [], tentativeId);
      break;
    // 导出数据库…: the destination, only ever the main process's, from the system Save dialog.
    case 'prepareDatabaseExport': {
      const input = requireInput(value.input, ['destination'], tentativeId);
      if (!isBoundedString(input.destination, MAX_EXPORT_DESTINATION_CODE_UNITS) || !isAbsolute(input.destination)) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    // 按上述方式导出: the one preparation it approves.
    case 'approveDatabaseExport': {
      const input = requireInput(value.input, ['preparationId'], tentativeId);
      if (!validUuid(input.preparationId)) throw new ProtocolError(tentativeId);
      break;
    }
    // 录入定价与首印: the Book, how many entries the editor saw, and two whole positive numbers, the price in 分.
    case 'recordPublicationActuals': {
      const input = requireInput(value.input, ['bookId', 'expectedEntries', 'priceFen', 'firstPrint'], tentativeId);
      if (!validUuid(input.bookId) || !Number.isSafeInteger(input.expectedEntries) || (input.expectedEntries as number) < 0 ||
          !Number.isSafeInteger(input.priceFen) || (input.priceFen as number) < 1 ||
          !Number.isSafeInteger(input.firstPrint) || (input.firstPrint as number) < 1) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    // The house's two switches, and how many changes of them the editor saw.
    case 'setEvaluationPreferences': {
      const input = requireInput(value.input, ['expectedEntries', 'predictionEnabled', 'calibrationEnabled'], tentativeId);
      if (!Number.isSafeInteger(input.expectedEntries) || (input.expectedEntries as number) < 0 ||
          typeof input.predictionEnabled !== 'boolean' || typeof input.calibrationEnabled !== 'boolean') {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    // 书系 (Issue #63, S28a): the list names nothing; 新建书系 names two texts the service reads; a Series, a membership change
    // and its preview name their Series, Book and kind, and the commit the digest of the preview the editor saw.
    case 'inspectSeriesList':
      requireInput(value.input, [], tentativeId);
      break;
    case 'createSeries': {
      const input = requireInput(value.input, ['title', 'note'], tentativeId);
      if (!isBoundedString(input.title, 400) || !isBoundedString(input.note, 4_000, true)) throw new ProtocolError(tentativeId);
      break;
    }
    case 'inspectSeries': {
      const input = requireInput(value.input, ['seriesId'], tentativeId);
      if (!validUuid(input.seriesId)) throw new ProtocolError(tentativeId);
      break;
    }
    case 'previewSeriesMembershipChange': {
      const input = requireInput(value.input, ['seriesId', 'bookId', 'kind'], tentativeId);
      if (!validUuid(input.seriesId) || !validUuid(input.bookId) || (input.kind !== 'add' && input.kind !== 'remove')) throw new ProtocolError(tentativeId);
      break;
    }
    case 'changeSeriesMembership': {
      const input = requireInput(value.input, ['seriesId', 'bookId', 'kind', 'previewDigest'], tentativeId);
      if (!validUuid(input.seriesId) || !validUuid(input.bookId) || (input.kind !== 'add' && input.kind !== 'remove') ||
          !isBoundedString(input.previewDigest, 64) || !HEX_DIGEST_PATTERN.test(input.previewDigest)) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'inspectBookSeries': {
      const input = requireInput(value.input, ['bookId'], tentativeId);
      if (!validUuid(input.bookId)) throw new ProtocolError(tentativeId);
      break;
    }
    // 书系知识 (Issue #63, S28b): a candidate names its Series, a new item by name and class or an existing one, its words and —
    // when it cites a member Book's manuscript — the exact span as a mark names one; a review and a promotion name the candidate.
    case 'proposeSeriesKnowledge': {
      const input = requireInput(value.input, ['seriesId', 'target', 'content', 'span'], tentativeId);
      if (!validUuid(input.seriesId) || !validKnowledgeTarget(input.target) || !isBoundedString(input.content, 8_000) || !validKnowledgeSpan(input.span)) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'inspectSeriesKnowledgeReview': {
      const input = requireInput(value.input, ['seriesId', 'candidateId'], tentativeId);
      if (!validUuid(input.seriesId) || !validUuid(input.candidateId)) throw new ProtocolError(tentativeId);
      break;
    }
    case 'editSeriesKnowledgeCandidate': {
      const input = requireInput(value.input, ['seriesId', 'candidateId', 'expectedVersion', 'target', 'content'], tentativeId);
      if (!validUuid(input.seriesId) || !validUuid(input.candidateId) || !isSafeInteger(input.expectedVersion, 1) || !validKnowledgeTarget(input.target) ||
          !isBoundedString(input.content, 8_000)) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'promoteSeriesKnowledge': {
      const input = requireInput(value.input, ['seriesId', 'candidateId', 'candidateVersion', 'reviewDigest', 'reuseScope', 'conflictDisposition'], tentativeId);
      if (!validUuid(input.seriesId) || !validUuid(input.candidateId) || !isSafeInteger(input.candidateVersion, 1) ||
          !isBoundedString(input.reviewDigest, 64) || !HEX_DIGEST_PATTERN.test(input.reviewDigest) ||
          !(SERIES_KNOWLEDGE_REUSE_SCOPES as readonly unknown[]).includes(input.reuseScope) ||
          (input.conflictDisposition !== 'none' && input.conflictDisposition !== 'preserved')) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    // 质量与学习 › 学习准入 (Issue #61, S26b): every Book's Learning Material, or one Book's.
    case 'inspectLearningMaterials': {
      const input = requireInput(value.input, ['bookId'], tentativeId);
      if (!(input.bookId === null || validUuid(input.bookId))) throw new ProtocolError(tentativeId);
      break;
    }
    // 记录学习准入决定: the material by its place and exact version, how many decisions the editor saw, one choice of the closed
    // set, and an optional note; whether the material still stands so is the store's.
    case 'decideLearningMaterial': {
      const input = requireInput(value.input, ['bookId', 'materialKey', 'materialDigest', 'expectedDecisions', 'choice', 'note'], tentativeId);
      if (!validUuid(input.bookId) || !isBoundedString(input.materialKey, 160) ||
          !/^(?:proposal-decision|analysis-feedback|review-disposition):[0-9a-z/:.-]{1,140}$/u.test(input.materialKey) ||
          !isBoundedString(input.materialDigest, 64) || !HEX_DIGEST_PATTERN.test(input.materialDigest) ||
          !Number.isSafeInteger(input.expectedDecisions) || (input.expectedDecisions as number) < 0 ||
          (input.choice !== 'book' && input.choice !== 'house' && input.choice !== 'excluded' && input.choice !== 'deferred') ||
          !(input.note === null || isBoundedString(input.note, 4_000, true))) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    // 定归属 or 定学习准入: the item, how many decisions the editor saw, and one decision of the closed shapes.
    case 'decideLibraryMaterial': {
      const input = requireInput(value.input, ['materialId', 'expectedDecisions', 'decision'], tentativeId);
      if (!validUuid(input.materialId) || !Number.isSafeInteger(input.expectedDecisions) || (input.expectedDecisions as number) < 0 ||
          !validLibraryDecision(input.decision)) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    // 停用 (Issue #421): a rule names itself; which Book it belongs to is the store's to know.
    case 'deactivateDefaultExecutionRule': {
      const input = requireInput(value.input, ['ruleId'], tentativeId);
      if (!validUuid(input.ruleId)) throw new ProtocolError(tentativeId);
      break;
    }
    // 取消 while a Run waits (Issue #502), and 取消任务 once it started (Issue #422): the Task Intent names it, within
    // the route's Book.
    case 'cancelWaitingBaselineAnalysis':
    case 'cancelBaselineAnalysisRun':
    // 暂停 and 续行 (Issue #422, S76b) name the Task Intent as 取消任务 does.
    case 'pauseBaselineAnalysisRun':
    case 'resumeBaselineAnalysisRun': {
      const input = requireInput(value.input, ['bookId', 'taskIntentId'], tentativeId);
      if (!validUuid(input.bookId) || !validUuid(input.taskIntentId)) throw new ProtocolError(tentativeId);
      break;
    }
    // 审阅 (Issue #417). A Review Run is named by its identity within the route's Book; which categories
    // exist, what a scope can read and whether a plan still stands are the store's to decide.
    case 'inspectReviewWorkspace': {
      // The Run to open, and — each optional, `null` or absent for none — the page cursor and the four
      // filters of the results; a filter is a view and never names more than a Run already holds.
      const input = requireInputWithOptional(value.input, ['bookId', 'reviewRunId'], REVIEW_FINDING_PAGE_KEYS, tentativeId);
      if (!validUuid(input.bookId) || !(input.reviewRunId === null || validUuid(input.reviewRunId)) ||
          !optionalOrNull(input, 'findingsAfterOrdinal', (after) => isSafeInteger(after, 1)) ||
          !optionalOrNull(input, 'categoryId', isReviewCategoryId) ||
          !optionalOrNull(input, 'severity', (severity) => REVIEW_FINDING_SEVERITIES.includes(severity as ReviewFindingSeverity)) ||
          !optionalOrNull(input, 'status', (status) => REVIEW_FINDING_STATUSES.includes(status as ReviewFindingStatus)) ||
          !optionalOrNull(input, 'chapterBlockId', (blockId) => isBoundedString(blockId, 28) && MARK_BLOCK_PATTERN.test(blockId))) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'prepareReviewRun': {
      const input = requireInput(value.input, ['bookId', 'categoryIds', 'scope'], tentativeId);
      if (!validUuid(input.bookId) || !Array.isArray(input.categoryIds) || !validReviewCategoryIds(input.categoryIds, 1) ||
          !validReviewRunScope(input.scope)) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'authorizeReviewRun': {
      // One exact plan digest per Task-backed category; a Run of the leads alone approves none.
      const input = requireInput(value.input, ['bookId', 'reviewRunId', 'planDigests'], tentativeId);
      if (!validUuid(input.bookId) || !validUuid(input.reviewRunId) || !Array.isArray(input.planDigests) ||
          !input.planDigests.every((entry) => isRecord(entry) && hasExactKeys(entry, ['categoryId', 'planEnvelopeDigest']) &&
            isBoundedString(entry.planEnvelopeDigest, 64) && HEX_DIGEST_PATTERN.test(entry.planEnvelopeDigest)) ||
          !validReviewCategoryIds(input.planDigests.map((entry: Record<string, unknown>) => entry.categoryId), 0)) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'continueReviewRun':
    case 'generateReviewReport': {
      const input = requireInput(value.input, ['bookId', 'reviewRunId'], tentativeId);
      if (!validUuid(input.bookId) || !validUuid(input.reviewRunId)) throw new ProtocolError(tentativeId);
      break;
    }
    case 'recordReviewFindingDisposition': {
      const input = requireInput(value.input, ['bookId', 'reviewRunId', 'findingId', 'disposition', 'reason'], tentativeId);
      if (!validUuid(input.bookId) || !validUuid(input.reviewRunId) ||
          !isBoundedString(input.findingId, 28) || !REVIEW_FINDING_ID_PATTERN.test(input.findingId) ||
          input.disposition !== 'ignored' || !validReviewFindingReason(input.reason)) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'inspectReviewFindingOfMark': {
      const input = requireInput(value.input, ['bookId', 'markId'], tentativeId);
      if (!validUuid(input.bookId) || !validUuid(input.markId)) throw new ProtocolError(tentativeId);
      break;
    }
    case 'prepareNewBookReview': {
      const input = requireInput(
        value.input,
        ['draftId', 'expectedDraftVersion', 'target', 'acceptDegradation', 'textBoxDisposition'],
        tentativeId,
      );
      const target = input.target;
      const validTarget = isRecord(target) && (
        (target.kind === 'new-book' && hasExactKeys(target, ['kind', 'choiceId', 'confirmedTitle']) &&
          (target.choiceId === 'new-book' || target.choiceId === 'new-book-distinct-intended-work') &&
          isBoundedString(target.confirmedTitle, 180)) ||
        (target.kind === 'existing-book' && hasExactKeys(target, ['kind', 'bookId', 'relationship']) &&
          isBoundedString(target.bookId, 36) && UUID_PATTERN.test(target.bookId) &&
          target.relationship === 'first-manuscript')
      );
      if (
        !isBoundedString(input.draftId, 36) ||
        !UUID_PATTERN.test(input.draftId) ||
        !isSafeInteger(input.expectedDraftVersion, 1) ||
        !validTarget ||
        typeof input.acceptDegradation !== 'boolean' ||
        (input.textBoxDisposition !== 'retain' && input.textBoxDisposition !== 'merge')
      ) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'commitNewBookImport': {
      const input = requireInput(value.input, ['draftId', 'expectedDraftVersion', 'reviewDigest', 'commitId'], tentativeId);
      if (
        !isBoundedString(input.draftId, 36) ||
        !UUID_PATTERN.test(input.draftId) ||
        !isSafeInteger(input.expectedDraftVersion, 1) ||
        !isBoundedString(input.reviewDigest, 64) ||
        !HEX_DIGEST_PATTERN.test(input.reviewDigest) ||
        !isBoundedString(input.commitId, 36) ||
        !UUID_PATTERN.test(input.commitId)
      ) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'prepareSourceImportReview': {
      const input = requireInput(value.input, ['draftId', 'expectedDraftVersion', 'target'], tentativeId);
      const target = input.target;
      const validTarget = isRecord(target) && (
        (target.kind === 'new-book' &&
          hasExactKeys(target, ['kind', 'choiceId', 'confirmedTitle', 'relationship']) &&
          (target.choiceId === 'new-book' || target.choiceId === 'new-book-distinct-intended-work') &&
          isBoundedString(target.confirmedTitle, 180) && target.relationship === 'source-only') ||
        (target.kind === 'existing-book' &&
          hasExactKeys(target, ['kind', 'bookId', 'relationship', 'reuseSourceVersionId']) &&
          isBoundedString(target.bookId, 36) && UUID_PATTERN.test(target.bookId) &&
          target.relationship === 'source-only' &&
          (target.reuseSourceVersionId === null ||
            (isBoundedString(target.reuseSourceVersionId, 36) && UUID_PATTERN.test(target.reuseSourceVersionId))))
      );
      if (!isBoundedString(input.draftId, 36) || !UUID_PATTERN.test(input.draftId) ||
          !isSafeInteger(input.expectedDraftVersion, 1) || !validTarget) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'commitSourceImport': {
      const input = requireInput(value.input, ['draftId', 'expectedDraftVersion', 'reviewDigest', 'commitId'], tentativeId);
      if (!isBoundedString(input.draftId, 36) || !UUID_PATTERN.test(input.draftId) ||
          !isSafeInteger(input.expectedDraftVersion, 1) ||
          !isBoundedString(input.reviewDigest, 64) || !HEX_DIGEST_PATTERN.test(input.reviewDigest) ||
          !isBoundedString(input.commitId, 36) || !UUID_PATTERN.test(input.commitId)) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'prepareManuscriptReimport': {
      const input = requireInput(value.input, ['draftId', 'expectedDraftVersion', 'target'], tentativeId);
      if (!isBoundedString(input.draftId, 36) || !UUID_PATTERN.test(input.draftId) ||
          !isSafeInteger(input.expectedDraftVersion, 1) || !isRecord(input.target) ||
          !hasExactKeys(input.target, ['kind', 'bookId', 'relationship', 'lineage', 'reuseSourceVersionId'])) {
        throw new ProtocolError(tentativeId);
      }
      const target = input.target;
      if (target.kind !== 'existing-book' || target.relationship !== 'reimport' ||
          !isBoundedString(target.bookId, 36) || !UUID_PATTERN.test(target.bookId) ||
          !(target.reuseSourceVersionId === null ||
            (isBoundedString(target.reuseSourceVersionId, 36) && UUID_PATTERN.test(target.reuseSourceVersionId))) ||
          !isRecord(target.lineage)) throw new ProtocolError(tentativeId);
      const lineage = target.lineage;
      const validLineage =
        (lineage.kind === 'unconfirmed' && hasExactKeys(lineage, ['kind'])) ||
        (lineage.kind === 'verified-source-version' && hasExactKeys(lineage, ['kind', 'sourceVersionId']) &&
          isBoundedString(lineage.sourceVersionId, 36) && UUID_PATTERN.test(lineage.sourceVersionId));
      if (!validLineage) throw new ProtocolError(tentativeId);
      break;
    }
    case 'getReimportMappingPage': {
      const input = requireInput(value.input, ['draftId', 'expectedDraftVersion', 'after'], tentativeId);
      if (!isBoundedString(input.draftId, 36) || !UUID_PATTERN.test(input.draftId) ||
          !isSafeInteger(input.expectedDraftVersion, 1) ||
          !(input.after === null || isSafeInteger(input.after))) throw new ProtocolError(tentativeId);
      break;
    }
    case 'getReimportLineageSourceVersionPage': {
      const input = requireInput(value.input, ['bookId', 'after'], tentativeId);
      if (!isBoundedString(input.bookId, 36) || !UUID_PATTERN.test(input.bookId) ||
          !(input.after === null ||
            (isBoundedString(input.after, 36) && UUID_PATTERN.test(input.after)))) throw new ProtocolError(tentativeId);
      break;
    }
    case 'acceptReimportDegradation': {
      const input = requireInput(value.input, ['draftId', 'expectedDraftVersion'], tentativeId);
      if (!isBoundedString(input.draftId, 36) || !UUID_PATTERN.test(input.draftId) ||
          !isSafeInteger(input.expectedDraftVersion, 1)) throw new ProtocolError(tentativeId);
      break;
    }
    // One row of the chapter-level comparison and one of the four verbs (Issue #412, S63).
    case 'resolveReimportMapping': {
      const input = requireInput(value.input, ['draftId', 'expectedDraftVersion', 'groupId', 'verb'], tentativeId);
      if (!isBoundedString(input.draftId, 36) || !UUID_PATTERN.test(input.draftId) ||
          !isSafeInteger(input.expectedDraftVersion, 1) ||
          !isBoundedString(input.groupId, 36) || !UUID_PATTERN.test(input.groupId) ||
          !['split', 'rewrite', 'delete', 'merge'].includes(input.verb as string)) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'resolveAcknowledgedManuscriptReimportReplay':
    case 'commitManuscriptReimport': {
      const input = requireInput(value.input, ['draftId', 'expectedDraftVersion', 'reviewDigest', 'commitId'], tentativeId);
      if (!isBoundedString(input.draftId, 36) || !UUID_PATTERN.test(input.draftId) ||
          !isSafeInteger(input.expectedDraftVersion, 1) ||
          !isBoundedString(input.reviewDigest, 64) || !HEX_DIGEST_PATTERN.test(input.reviewDigest) ||
          !isBoundedString(input.commitId, 36) || !UUID_PATTERN.test(input.commitId)) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'acknowledgeImportCompletion': {
      const input = requireInput(value.input, ['commitId'], tentativeId);
      if (!isBoundedString(input.commitId, 36) || !UUID_PATTERN.test(input.commitId)) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'getManuscriptWindow': {
      const input = requireInput(value.input, ['manuscriptId', 'branchId', 'cursor'], tentativeId);
      if (
        !isBoundedString(input.manuscriptId, 36) ||
        !UUID_PATTERN.test(input.manuscriptId) ||
        !isBoundedString(input.branchId, 36) ||
        !UUID_PATTERN.test(input.branchId) ||
        !(input.cursor === null || isBoundedString(input.cursor, 1_024))
      ) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'recordManuscriptEntryPosition': {
      const input = requireInput(value.input, ['manuscriptId', 'branchId', 'blockId', 'grapheme'], tentativeId);
      if (
        !isBoundedString(input.manuscriptId, 36) ||
        !UUID_PATTERN.test(input.manuscriptId) ||
        !isBoundedString(input.branchId, 36) ||
        !UUID_PATTERN.test(input.branchId) ||
        !isBoundedString(input.blockId, 28) ||
        !/^blk_[0-9a-f]{24}$/.test(input.blockId) ||
        !isSafeInteger(input.grapheme, 0)
      ) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'createEditorialMark': {
      const input = requireInput(
        value.input,
        [
          'manuscriptId', 'branchId', 'windowStartBlockId', 'clientMarkId', 'baseRevisionId', 'expectedJournalSequence',
          'blockId', 'baseBlockDigest', 'fromGrapheme', 'toGrapheme', 'selectedText', 'kind', 'highlightColor', 'body',
          'proposedText', 'rationale',
        ],
        tentativeId,
      );
      if (
        !validMarkBinding(input) ||
        !isBoundedString(input.clientMarkId, 36) || !UUID_PATTERN.test(input.clientMarkId) ||
        !isBoundedString(input.baseRevisionId, 36) || !UUID_PATTERN.test(input.baseRevisionId) ||
        !isSafeInteger(input.expectedJournalSequence, 0) ||
        !isBoundedString(input.blockId, 28) || !MARK_BLOCK_PATTERN.test(input.blockId) ||
        !isBoundedString(input.baseBlockDigest, 64) || !/^[0-9a-f]{64}$/.test(input.baseBlockDigest) ||
        !isSafeInteger(input.fromGrapheme, 0) || !isSafeInteger(input.toGrapheme, 1) ||
        !isBoundedString(input.selectedText, MAX_BLOCK_CODE_UNITS) ||
        !validMarkKind(input.kind) ||
        !validHighlightColor(input.highlightColor) ||
        !isBoundedString(input.body, MAX_MARK_BODY_CODE_UNITS, true) ||
        !(input.proposedText === null || isBoundedString(input.proposedText, MAX_MARK_BODY_CODE_UNITS, true)) ||
        !(input.rationale === null || isBoundedString(input.rationale, MAX_MARK_BODY_CODE_UNITS, true))
      ) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'getEditorialMarkCard': {
      const input = requireInput(value.input, ['manuscriptId', 'branchId', 'markId'], tentativeId);
      if (
        !isBoundedString(input.manuscriptId, 36) || !UUID_PATTERN.test(input.manuscriptId) ||
        !isBoundedString(input.branchId, 36) || !UUID_PATTERN.test(input.branchId) ||
        !isBoundedString(input.markId, 36) || !UUID_PATTERN.test(input.markId)
      ) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'updateEditorialMark': {
      const input = requireInput(
        value.input,
        ['manuscriptId', 'branchId', 'windowStartBlockId', 'markId', 'action', 'body', 'highlightColor', 'status', 'targetKind', 'proposedText', 'rationale'],
        tentativeId,
      );
      if (
        !validMarkBinding(input) ||
        !isBoundedString(input.markId, 36) || !UUID_PATTERN.test(input.markId) ||
        !(typeof input.action === 'string' && ['edit-body', 'recolor', 'set-status', 'reply', 'remove', 'convert'].includes(input.action)) ||
        !(input.body === null || isBoundedString(input.body, MAX_MARK_BODY_CODE_UNITS, true)) ||
        !validHighlightColor(input.highlightColor) ||
        !(input.status === null || input.status === 'open' || input.status === 'resolved') ||
        !(input.targetKind === null || validMarkKind(input.targetKind)) ||
        !(input.proposedText === null || isBoundedString(input.proposedText, MAX_MARK_BODY_CODE_UNITS, true)) ||
        !(input.rationale === null || isBoundedString(input.rationale, MAX_MARK_BODY_CODE_UNITS, true))
      ) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'recordChangeSuggestionDecision': {
      const input = requireInput(
        value.input,
        ['manuscriptId', 'branchId', 'windowStartBlockId', 'markId', 'clientDecisionId', 'disposition', 'editedText', 'reason'],
        tentativeId,
      );
      if (
        !validMarkBinding(input) ||
        !isBoundedString(input.markId, 36) || !UUID_PATTERN.test(input.markId) ||
        !isBoundedString(input.clientDecisionId, 36) || !UUID_PATTERN.test(input.clientDecisionId) ||
        !(input.disposition === 'rejected' || input.disposition === 'accepted-with-edit' || input.disposition === 'withdrawn') ||
        !(input.editedText === null || isBoundedString(input.editedText, MAX_MARK_BODY_CODE_UNITS, true)) ||
        !(input.reason === null || isBoundedString(input.reason, MAX_MARK_BODY_CODE_UNITS))
      ) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'applyChangeSuggestion': {
      const input = requireInput(
        value.input,
        ['manuscriptId', 'branchId', 'windowStartBlockId', 'markId', 'clientEffectId', 'interaction', 'editedText', 'reason'],
        tentativeId,
      );
      if (
        !validMarkBinding(input) ||
        !isBoundedString(input.markId, 36) || !UUID_PATTERN.test(input.markId) ||
        !isBoundedString(input.clientEffectId, 36) || !UUID_PATTERN.test(input.clientEffectId) ||
        !(input.interaction === 'accept-and-apply' || input.interaction === 'accept-edited-and-apply' || input.interaction === 'apply-recorded-decision') ||
        !(input.editedText === null || isBoundedString(input.editedText, MAX_MARK_BODY_CODE_UNITS, true)) ||
        !(input.reason === null || isBoundedString(input.reason, MAX_MARK_BODY_CODE_UNITS))
      ) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'applyChangeSuggestionBatch': {
      const input = requireInput(value.input, ['manuscriptId', 'branchId', 'windowStartBlockId', 'markIds', 'clientEffectId'], tentativeId);
      if (
        !validMarkBinding(input) ||
        !isBoundedString(input.clientEffectId, 36) || !UUID_PATTERN.test(input.clientEffectId) ||
        !Array.isArray(input.markIds) || input.markIds.length === 0 || input.markIds.length > 500 ||
        !input.markIds.every((markId) => isBoundedString(markId, 36) && UUID_PATTERN.test(markId))
      ) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'reverseAppliedChangeSuggestion': {
      const input = requireInput(value.input, ['manuscriptId', 'branchId', 'windowStartBlockId', 'markId', 'clientEffectId'], tentativeId);
      if (
        !validMarkBinding(input) ||
        !isBoundedString(input.markId, 36) || !UUID_PATTERN.test(input.markId) ||
        !isBoundedString(input.clientEffectId, 36) || !UUID_PATTERN.test(input.clientEffectId)
      ) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'getManuscriptRail': {
      const input = requireInput(value.input, ['manuscriptId', 'branchId'], tentativeId);
      if (
        !isBoundedString(input.manuscriptId, 36) || !UUID_PATTERN.test(input.manuscriptId) ||
        !isBoundedString(input.branchId, 36) || !UUID_PATTERN.test(input.branchId)
      ) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'getManuscriptApplyOutcome': {
      const input = requireInput(value.input, ['manuscriptId', 'branchId', 'clientEffectId'], tentativeId);
      if (
        !isBoundedString(input.manuscriptId, 36) || !UUID_PATTERN.test(input.manuscriptId) ||
        !isBoundedString(input.branchId, 36) || !UUID_PATTERN.test(input.branchId) ||
        !isBoundedString(input.clientEffectId, 36) || !UUID_PATTERN.test(input.clientEffectId)
      ) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    // 稿件冲突 (Issue #57). Every operation names its 修改建议 within one manuscript; the two records are bound
    // to the basis digest the read answered. A draft is one entry per unit of the comparison — a resolution,
    // or `null` for a unit that needs none, and the editor's words exactly for an edited one — and whether
    // it fits this conflict's units is the store's to decide.
    case 'inspectProposalConflict': {
      const input = requireInput(value.input, ['manuscriptId', 'branchId', 'markId'], tentativeId);
      if (!validUuid(input.manuscriptId) || !validUuid(input.branchId) || !validUuid(input.markId)) throw new ProtocolError(tentativeId);
      break;
    }
    case 'saveProposalConflictDraft': {
      const input = requireInput(value.input, ['manuscriptId', 'branchId', 'markId', 'basisDigest', 'units'], tentativeId);
      if (
        !validUuid(input.manuscriptId) || !validUuid(input.branchId) || !validUuid(input.markId) ||
        !isBoundedString(input.basisDigest, 64) || !HEX_DIGEST_PATTERN.test(input.basisDigest) ||
        !Array.isArray(input.units) || input.units.length === 0 || input.units.length > MAX_PROPOSAL_CONFLICT_UNITS ||
        !input.units.every(validConflictUnitResolution)
      ) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'resolveProposalConflict': {
      const input = requireInput(value.input, ['manuscriptId', 'branchId', 'markId', 'basisDigest', 'outcome', 'draftOrdinal'], tentativeId);
      if (
        !validUuid(input.manuscriptId) || !validUuid(input.branchId) || !validUuid(input.markId) ||
        !isBoundedString(input.basisDigest, 64) || !HEX_DIGEST_PATTERN.test(input.basisDigest) ||
        (input.outcome !== 'keep-current' && input.outcome !== 'defer' && input.outcome !== 'new-version') ||
        (input.outcome === 'new-version' ? !isSafeInteger(input.draftOrdinal, 1) : input.draftOrdinal !== null)
      ) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    // 不说明 or 改原因 after a decision (Issue #61, S26a): the decision, how many entries the editor saw, and the action's own
    // shape — no reason with 不说明, a reason and where it came from with 改原因.
    case 'recordProposalDecisionFeedback': {
      const input = requireInput(
        value.input,
        ['manuscriptId', 'branchId', 'windowStartBlockId', 'markId', 'decisionId', 'expectedFeedback', 'action', 'reason', 'reasonSource'],
        tentativeId,
      );
      if (
        !validMarkBinding(input) ||
        !isBoundedString(input.markId, 36) || !UUID_PATTERN.test(input.markId) ||
        !isBoundedString(input.decisionId, 36) || !UUID_PATTERN.test(input.decisionId) ||
        !Number.isSafeInteger(input.expectedFeedback) || (input.expectedFeedback as number) < 0 ||
        !(input.action === 'dismiss'
          ? input.reason === null && input.reasonSource === null
          : input.action === 'revise' && isBoundedString(input.reason, MAX_MARK_BODY_CODE_UNITS) &&
            (input.reasonSource === 'suggested' || input.reasonSource === 'free-text'))
      ) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'recordProposalDecisionReason': {
      const input = requireInput(
        value.input,
        ['manuscriptId', 'branchId', 'windowStartBlockId', 'markId', 'decisionId', 'reason', 'reasonSource'],
        tentativeId,
      );
      if (
        !validMarkBinding(input) ||
        !isBoundedString(input.markId, 36) || !UUID_PATTERN.test(input.markId) ||
        !isBoundedString(input.decisionId, 36) || !UUID_PATTERN.test(input.decisionId) ||
        !isBoundedString(input.reason, MAX_MARK_BODY_CODE_UNITS) ||
        !(input.reasonSource === 'suggested' || input.reasonSource === 'free-text')
      ) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'flushJournalEdit': {
      const input = requireInput(
        value.input,
        [
          'clientEditId',
          'manuscriptId',
          'branchId',
          'baseRevisionId',
          'blockId',
          'windowStartBlockId',
          'baseBlockDigest',
          'expectedJournalSequence',
          'fromGrapheme',
          'toGrapheme',
          'insertText',
        ],
        tentativeId,
      );
      if (
        !isBoundedString(input.clientEditId, 36) ||
        !UUID_PATTERN.test(input.clientEditId) ||
        !isBoundedString(input.manuscriptId, 36) ||
        !UUID_PATTERN.test(input.manuscriptId) ||
        !isBoundedString(input.branchId, 36) ||
        !UUID_PATTERN.test(input.branchId) ||
        !isBoundedString(input.baseRevisionId, 36) ||
        !UUID_PATTERN.test(input.baseRevisionId) ||
        !isBoundedString(input.blockId, 28) ||
        !/^blk_[0-9a-f]{24}$/.test(input.blockId) ||
        !isBoundedString(input.windowStartBlockId, 28) ||
        !/^blk_[0-9a-f]{24}$/.test(input.windowStartBlockId) ||
        !isBoundedString(input.baseBlockDigest, 64) ||
        !HEX_DIGEST_PATTERN.test(input.baseBlockDigest) ||
        !isSafeInteger(input.expectedJournalSequence) ||
        !isSafeInteger(input.fromGrapheme) ||
        !isSafeInteger(input.toGrapheme) ||
        input.toGrapheme < input.fromGrapheme ||
        !isBoundedString(input.insertText, MAX_EDIT_CODE_UNITS, true)
      ) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'getManuscriptWindowAt': {
      const input = requireInput(value.input, ['manuscriptId', 'branchId', 'target'], tentativeId);
      if (
        !isBoundedString(input.manuscriptId, 36) ||
        !UUID_PATTERN.test(input.manuscriptId) ||
        !isBoundedString(input.branchId, 36) ||
        !UUID_PATTERN.test(input.branchId) ||
        !isRecord(input.target)
      ) {
        throw new ProtocolError(tentativeId);
      }
      const target = input.target;
      if (
        (target.kind === 'start' && hasExactKeys(target, ['kind'])) ||
        (target.kind === 'cursor' &&
          hasExactKeys(target, ['kind', 'cursor']) &&
          isBoundedString(target.cursor, 1_024)) ||
        (target.kind === 'block' &&
          hasExactKeys(target, ['kind', 'blockId']) &&
          isBoundedString(target.blockId, 28) &&
          /^blk_[0-9a-f]{24}$/.test(target.blockId)) ||
        (target.kind === 'window-start' &&
          hasExactKeys(target, ['kind', 'blockId']) &&
          isBoundedString(target.blockId, 28) &&
          /^blk_[0-9a-f]{24}$/.test(target.blockId)) ||
        (target.kind === 'character' &&
          hasExactKeys(target, ['kind', 'character']) &&
          isSafeInteger(target.character)) ||
        (target.kind === 'proportion' &&
          hasExactKeys(target, ['kind', 'proportion']) &&
          typeof target.proportion === 'number' &&
          Number.isFinite(target.proportion) &&
          target.proportion >= 0 &&
          target.proportion <= 1)
      ) {
        break;
      }
      throw new ProtocolError(tentativeId);
    }
    case 'getOutline': {
      const input = requireInput(value.input, ['manuscriptId', 'branchId', 'cursor'], tentativeId);
      if (
        !isBoundedString(input.manuscriptId, 36) ||
        !UUID_PATTERN.test(input.manuscriptId) ||
        !isBoundedString(input.branchId, 36) ||
        !UUID_PATTERN.test(input.branchId) ||
        !(input.cursor === null || isBoundedString(input.cursor, 1_024))
      ) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'startSearch': {
      const input = requireInput(value.input, ['manuscriptId', 'branchId', 'query'], tentativeId);
      if (
        !isBoundedString(input.manuscriptId, 36) ||
        !UUID_PATTERN.test(input.manuscriptId) ||
        !isBoundedString(input.branchId, 36) ||
        !UUID_PATTERN.test(input.branchId) ||
        !isBoundedString(input.query, 256)
      ) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'pollServiceJob':
    case 'cancelServiceJob': {
      const input = requireInput(value.input, ['jobId'], tentativeId);
      if (!isBoundedString(input.jobId, 36) || !UUID_PATTERN.test(input.jobId)) throw new ProtocolError(tentativeId);
      break;
    }
    case 'getSearchResults': {
      const input = requireInput(value.input, ['searchId', 'cursor'], tentativeId);
      if (
        !isBoundedString(input.searchId, 36) ||
        !UUID_PATTERN.test(input.searchId) ||
        !(input.cursor === null || isBoundedString(input.cursor, 1_024))
      ) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'prepareReplacement': {
      const input = requireInput(value.input, ['searchId', 'replacement', 'excludedMatchIds'], tentativeId);
      if (
        !isBoundedString(input.searchId, 36) ||
        !UUID_PATTERN.test(input.searchId) ||
        !isBoundedString(input.replacement, 1_024, true) ||
        !Array.isArray(input.excludedMatchIds) ||
        input.excludedMatchIds.length > MAX_REPLACEMENT_EXCLUSIONS ||
        !input.excludedMatchIds.every((id) => isBoundedString(id, 28) && /^hit_[0-9a-f]{24}$/.test(id))
      ) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'freezeReplacement': {
      const input = requireInput(value.input, ['previewId', 'excludedMatchIds'], tentativeId);
      if (
        !isBoundedString(input.previewId, 36) ||
        !UUID_PATTERN.test(input.previewId) ||
        !Array.isArray(input.excludedMatchIds) ||
        input.excludedMatchIds.length > MAX_REPLACEMENT_EXCLUSIONS ||
        !input.excludedMatchIds.every((id) => isBoundedString(id, 28) && /^hit_[0-9a-f]{24}$/.test(id))
      ) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'dismissReplacementPreview':
    case 'startReplacementCommit':
    case 'commitReplacement': {
      const input = requireInput(value.input, ['previewId'], tentativeId);
      if (!isBoundedString(input.previewId, 36) || !UUID_PATTERN.test(input.previewId)) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'saveMilestone': {
      // A frozen purpose carries no words of its own; 自行输入 carries the editor's words (Issue #414).
      const input = requireInput(value.input, ['manuscriptId', 'branchId', 'label', 'purposeKind', 'purpose', 'note'], tentativeId);
      if (
        !isBoundedString(input.manuscriptId, 36) ||
        !UUID_PATTERN.test(input.manuscriptId) ||
        !isBoundedString(input.branchId, 36) ||
        !UUID_PATTERN.test(input.branchId) ||
        !isBoundedString(input.label, 80) ||
        !MILESTONE_PURPOSE_KINDS.includes(input.purposeKind as MilestonePurposeKind) ||
        (input.purposeKind === 'custom' ? !isBoundedString(input.purpose, MAX_MILESTONE_PURPOSE_CODE_UNITS) : input.purpose !== null) ||
        !isBoundedString(input.note, 500, true)
      ) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    // ⑥ 交付物 · 发稿 (Issue #414). The milestone is named by its identity within the route's Book; whether
    // it is one of that Book's is the store's to decide. 发稿范围 and 依据 are required and bounded here
    // exactly as the store bounds them.
    case 'inspectDeliverables': {
      const input = requireInput(value.input, ['bookId'], tentativeId);
      if (!validUuid(input.bookId)) throw new ProtocolError(tentativeId);
      break;
    }
    case 'designatePublicationVersion': {
      const input = requireInput(value.input, ['bookId', 'milestoneId', 'scope', 'basis'], tentativeId);
      if (!validUuid(input.bookId) || !validUuid(input.milestoneId) ||
          !validPublicationText(input.scope, MAX_PUBLICATION_SCOPE_CHARACTERS) ||
          !validPublicationText(input.basis, MAX_PUBLICATION_BASIS_CHARACTERS)) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    // 交付 · 生产文档 (Issue #415). A house type by its identity, a material and a document by theirs, all within
    // the route's Book; whether they are that Book's is the store's to decide.
    case 'inspectBookTasks':
    case 'inspectProductionDocuments': {
      const input = requireInput(value.input, ['bookId'], tentativeId);
      if (!validUuid(input.bookId)) throw new ProtocolError(tentativeId);
      break;
    }
    // 图书交付包 (Issue #416, S67a): the route's Book, and for 准备 the purpose within its bound and the content's digest.
    case 'inspectBookDeliveryPackage': {
      const input = requireInput(value.input, ['bookId'], tentativeId);
      if (!validUuid(input.bookId)) throw new ProtocolError(tentativeId);
      break;
    }
    case 'prepareBookDeliveryPackage': {
      const input = requireInput(value.input, ['bookId', 'purpose', 'expectedContentDigest'], tentativeId);
      if (!validUuid(input.bookId) || !validPublicationText(input.purpose, MAX_BOOK_DELIVERY_PACKAGE_PURPOSE_CHARACTERS) ||
          !isBoundedString(input.expectedContentDigest, 64) || !HEX_DIGEST_PATTERN.test(input.expectedContentDigest)) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    // Its export (Issue #416, S67b): one version of the route's Book's package, the folder the dialog returned, an export.
    case 'reviewBookDeliveryPackageExport': {
      const input = requireInput(value.input, ['bookId', 'packageVersionId'], tentativeId);
      if (!validUuid(input.bookId) || !validUuid(input.packageVersionId)) throw new ProtocolError(tentativeId);
      break;
    }
    case 'prepareBookDeliveryPackageExport': {
      const input = requireInput(value.input, ['bookId', 'packageVersionId', 'reviewDigest', 'folder'], tentativeId);
      if (!validUuid(input.bookId) || !validUuid(input.packageVersionId) || !isBoundedString(input.reviewDigest, 64) ||
          !HEX_DIGEST_PATTERN.test(input.reviewDigest) || !isBoundedString(input.folder, MAX_EXPORT_DESTINATION_CODE_UNITS) ||
          !isAbsolute(input.folder)) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'approveBookDeliveryPackageExport': {
      const input = requireInput(value.input, ['bookId', 'exportId'], tentativeId);
      if (!validUuid(input.bookId) || !validUuid(input.exportId)) throw new ProtocolError(tentativeId);
      break;
    }
    // 维护事项 (Issue #426, S68a): the route's Book, one of its designations or cases, and words within their bounds.
    case 'inspectMaintenanceCase': {
      const input = requireInput(value.input, ['bookId', 'caseId'], tentativeId);
      if (!validUuid(input.bookId) || !validUuid(input.caseId)) throw new ProtocolError(tentativeId);
      break;
    }
    case 'recordMaintenanceCase': {
      const input = requireInput(value.input, ['bookId', 'publicationVersionId', 'classification', 'reason', 'evidence'], tentativeId);
      if (!validUuid(input.bookId) || !validUuid(input.publicationVersionId) || typeof input.classification !== 'string' ||
          !(MAINTENANCE_CLASSIFICATIONS as readonly string[]).includes(input.classification) ||
          !validPublicationText(input.reason, MAX_MAINTENANCE_REASON_CHARACTERS) ||
          (input.evidence !== null && !validPublicationText(input.evidence, MAX_MAINTENANCE_EVIDENCE_CHARACTERS))) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'appendMaintenanceCaseRevision': {
      const input = requireInput(value.input, ['bookId', 'caseId', 'expectedRevision', 'step'], tentativeId);
      if (!validUuid(input.bookId) || !validUuid(input.caseId) || !isSafeInteger(input.expectedRevision, 1) || !validMaintenanceStep(input.step)) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'saveMaintenanceErrata': {
      const input = requireInput(value.input, ['bookId', 'caseId', 'expectedRevision', 'body'], tentativeId);
      if (!validUuid(input.bookId) || !validUuid(input.caseId) || !isSafeInteger(input.expectedRevision, 1) ||
          !validPublicationText(input.body, MAX_MAINTENANCE_ERRATA_CHARACTERS)) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'createProductionDocument': {
      const input = requireInput(value.input, ['bookId', 'typeId', 'sourceVersionId'], tentativeId);
      if (!validUuid(input.bookId) || !validProductionDocumentTypeId(input.typeId) || !validUuid(input.sourceVersionId)) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'decideProductionDocumentType': {
      const input = requireInput(value.input, ['bookId', 'typeId', 'notForThisBook'], tentativeId);
      if (!validUuid(input.bookId) || !validProductionDocumentTypeId(input.typeId) || typeof input.notForThisBook !== 'boolean') {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'saveProductionDocumentVersion': {
      const input = requireInput(value.input, ['bookId', 'documentId', 'branchId'], tentativeId);
      if (!validUuid(input.bookId) || !validUuid(input.documentId) || !validUuid(input.branchId)) throw new ProtocolError(tentativeId);
      break;
    }
    // 交付 (Issue #415, S66b): a document's saved version, a recipient from the house's list or in the editor's own
    // words, and an optional note, bounded here exactly as the store bounds them.
    case 'recordProductionDocumentDelivery': {
      const input = requireInput(value.input, ['bookId', 'documentId', 'version', 'recipient', 'note'], tentativeId);
      const recipient = input.recipient;
      const version = input.version;
      if (!validUuid(input.bookId) || !validUuid(input.documentId) || !isRecord(version) ||
          !(version.kind === 'saved' ? hasExactKeys(version, ['kind', 'revisionId']) && validUuid(version.revisionId)
            : version.kind === 'current' && hasExactKeys(version, ['kind', 'workingDigest']) &&
              isBoundedString(version.workingDigest, 64) && HEX_DIGEST_PATTERN.test(version.workingDigest)) ||
          !isRecord(recipient) || !hasExactKeys(recipient, ['kind', 'custom']) ||
          !PRODUCTION_DOCUMENT_RECIPIENT_KINDS.includes(recipient.kind as ProductionDocumentRecipientKind) ||
          (recipient.kind === 'custom'
            ? !validPublicationText(recipient.custom, MAX_PRODUCTION_DOCUMENT_RECIPIENT_CHARACTERS)
            : recipient.custom !== null) ||
          (input.note !== null && !validPublicationText(input.note, MAX_PRODUCTION_DOCUMENT_DELIVERY_NOTE_CHARACTERS))) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    // A document's workflow phase (Issue #415, S66c): a known phase and move, the count the editor saw, and a reason — a
    // choice and optional words within their bound — or none. Which moves need a reason is the store's to decide.
    case 'transitionProductionDocumentPhase': {
      const input = requireInput(value.input, ['bookId', 'documentId', 'phaseId', 'action', 'expectedTransitions', 'reason'], tentativeId);
      const reason = input.reason;
      if (!validUuid(input.bookId) || !validUuid(input.documentId) ||
          !PRODUCTION_DOCUMENT_PHASE_IDS.includes(input.phaseId as ProductionDocumentPhaseId) ||
          !PRODUCTION_DOCUMENT_PHASE_ACTIONS.includes(input.action as ProductionDocumentPhaseAction) ||
          !isSafeInteger(input.expectedTransitions) || (input.expectedTransitions as number) < 0 || (input.expectedTransitions as number) > 1_000_000 ||
          (reason !== null && (!isRecord(reason) || !hasExactKeys(reason, ['choice', 'text']) || !isBoundedString(reason.choice, 32) ||
            !/^[a-z]+(?:-[a-z]+)*$/.test(reason.choice as string) ||
            (reason.text !== null && !validPublicationText(reason.text, MAX_PRODUCTION_DOCUMENT_PHASE_REASON_CHARACTERS))))) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    // ④ 导出 (Issue #413). The version is the current revision or one milestone of the route's Book, the options
    // are exactly the three switches, and the destination — only ever the main process's, from the system
    // dialog — is an absolute path within the bound; whether it may be written is the store's to decide.
    // The format (Issue #500, S64b) is optional: a request without it still means DOCX.
    case 'reviewManuscriptExport': {
      const input = requireInputWithOptional(value.input, ['bookId', 'target', 'options'], ['format'], tentativeId);
      if (!validUuid(input.bookId) || !validExportTarget(input.target) || !validExportOptions(input.options) ||
          (Object.hasOwn(input, 'format') && !validExportFormat(input.format))) throw new ProtocolError(tentativeId);
      break;
    }
    case 'prepareManuscriptExport': {
      const input = requireInputWithOptional(value.input, ['bookId', 'revisionId', 'target', 'options', 'reviewDigest', 'destination'], ['format'], tentativeId);
      if (!validUuid(input.bookId) || !validUuid(input.revisionId) || !validExportTarget(input.target) ||
          !validExportOptions(input.options) || !isBoundedString(input.reviewDigest, 64) || !HEX_DIGEST_PATTERN.test(input.reviewDigest) ||
          !isBoundedString(input.destination, MAX_EXPORT_DESTINATION_CODE_UNITS) || !isAbsolute(input.destination) ||
          (Object.hasOwn(input, 'format') && !validExportFormat(input.format))) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'approveManuscriptExport':
    case 'stageManuscriptExport':
    case 'inspectManuscriptExportReceipt': {
      const input = requireInput(value.input, ['bookId', 'preparationId'], tentativeId);
      if (!validUuid(input.bookId) || !validUuid(input.preparationId)) throw new ProtocolError(tentativeId);
      break;
    }
    case 'undoManuscript':
    case 'redoManuscript': {
      const input = requireInput(value.input, ['manuscriptId', 'branchId', 'expectedWorkingDigest'], tentativeId);
      if (
        !isBoundedString(input.manuscriptId, 36) ||
        !UUID_PATTERN.test(input.manuscriptId) ||
        !isBoundedString(input.branchId, 36) ||
        !UUID_PATTERN.test(input.branchId) ||
        !isBoundedString(input.expectedWorkingDigest, 64) ||
        !HEX_DIGEST_PATTERN.test(input.expectedWorkingDigest)
      ) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    default:
      throw new ProtocolError(tentativeId);
  }
  return value as ServiceRequest;
}
