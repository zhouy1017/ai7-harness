import { isAbsolute } from 'node:path';
import {
  MAX_EDIT_CODE_UNITS,
  MAX_REPLACEMENT_EXCLUSIONS,
  J03_TASK_GOAL,
  type ServiceRequest,
} from '../shared/protocol.js';

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
      const input = requireInput(value.input, ['after'], tentativeId);
      const after = input.after;
      if (
        !(after === null || (isRecord(after) && hasExactKeys(after, ['title', 'bookId']) &&
          isBoundedString(after.title, 180) && isBoundedString(after.bookId, 36) && UUID_PATTERN.test(after.bookId)))
      ) throw new ProtocolError(tentativeId);
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
    case 'stageSelectedDocx': {
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
    case 'authorizeTaskAuthorization': {
      const input = requireInput(value.input, ['bookId', 'taskIntentId', 'planEnvelopeDigest'], tentativeId);
      if (!isBoundedString(input.bookId, 36) || !UUID_PATTERN.test(input.bookId) ||
          !isBoundedString(input.taskIntentId, 36) || !UUID_PATTERN.test(input.taskIntentId) ||
          !isBoundedString(input.planEnvelopeDigest, 64) || !HEX_DIGEST_PATTERN.test(input.planEnvelopeDigest)) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'prepareNewBookReview': {
      const input = requireInput(
        value.input,
        ['draftId', 'expectedDraftVersion', 'target', 'acceptDegradation'],
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
        typeof input.acceptDegradation !== 'boolean'
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
    case 'getReimportIdentityCandidatePage': {
      const input = requireInput(value.input, ['draftId', 'expectedDraftVersion', 'mappingId', 'after'], tentativeId);
      if (!isBoundedString(input.draftId, 36) || !UUID_PATTERN.test(input.draftId) ||
          !isSafeInteger(input.expectedDraftVersion, 1) ||
          !isBoundedString(input.mappingId, 36) || !UUID_PATTERN.test(input.mappingId) ||
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
    case 'resolveReimportMapping': {
      const input = requireInput(
        value.input,
        ['draftId', 'expectedDraftVersion', 'mappingId', 'resolution', 'currentBlockId'],
        tentativeId,
      );
      if (!isBoundedString(input.draftId, 36) || !UUID_PATTERN.test(input.draftId) ||
          !isSafeInteger(input.expectedDraftVersion, 1) ||
          !isBoundedString(input.mappingId, 36) || !UUID_PATTERN.test(input.mappingId) ||
          !['preserve-current-identity', 'create-new-identity', 'retire-current-identity'].includes(input.resolution as string) ||
          !(input.currentBlockId === null ||
            (isBoundedString(input.currentBlockId, 28) && /^blk_[0-9a-f]{24}$/.test(input.currentBlockId)))) {
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
      const input = requireInput(value.input, ['manuscriptId', 'branchId', 'label', 'purpose', 'note'], tentativeId);
      if (
        !isBoundedString(input.manuscriptId, 36) ||
        !UUID_PATTERN.test(input.manuscriptId) ||
        !isBoundedString(input.branchId, 36) ||
        !UUID_PATTERN.test(input.branchId) ||
        !isBoundedString(input.label, 80) ||
        !isBoundedString(input.purpose, 120) ||
        !isBoundedString(input.note, 500, true)
      ) {
        throw new ProtocolError(tentativeId);
      }
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
