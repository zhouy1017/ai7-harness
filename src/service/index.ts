import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MAX_EDIT_CODE_UNITS,
  MAX_FRAME_BYTES,
  MAX_REPLACEMENT_EXCLUSIONS,
  type ServiceFailureResponse,
  type ServiceRequest,
  type ServiceResponse,
  type ServiceSuccessResponse,
} from '../shared/protocol.js';
import { installNodeNetworkDenial } from '../shared/network-denial.js';
import type { DormantHarnessRuntime } from './runtime.js';
import type { EditorialStore } from './store.js';
import type { CooperativeJobOwner } from './cooperative-jobs.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX_DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const textDecoder = new TextDecoder('utf-8', { fatal: true });

class ProtocolError extends Error {
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

function isSafeInteger(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

function isBoundedString(value: unknown, maximum: number, allowEmpty = false): value is string {
  return typeof value === 'string' && value.isWellFormed() && value.length <= maximum && (allowEmpty || value.length > 0);
}

function requireInput(value: unknown, keys: readonly string[], requestId: string): Record<string, unknown> {
  if (!isRecord(value) || !hasExactKeys(value, keys)) throw new ProtocolError(requestId);
  return value;
}

function decodeRequest(frame: Uint8Array): ServiceRequest {
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
    case 'listPriorWork':
    case 'shutdown': {
      requireInput(value.input, [], tentativeId);
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
    case 'prepareNewBookReview': {
      const input = requireInput(
        value.input,
        ['draftId', 'expectedDraftVersion', 'targetChoiceId', 'confirmedTitle', 'acceptDegradation'],
        tentativeId,
      );
      if (
        !isBoundedString(input.draftId, 36) ||
        !UUID_PATTERN.test(input.draftId) ||
        !isSafeInteger(input.expectedDraftVersion, 1) ||
        (input.targetChoiceId !== 'new-book' && input.targetChoiceId !== 'new-book-distinct-intended-work') ||
        !isBoundedString(input.confirmedTitle, 180) ||
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
      if (!isBoundedString(input.manuscriptId, 36) || !UUID_PATTERN.test(input.manuscriptId) ||
          !isBoundedString(input.branchId, 36) || !UUID_PATTERN.test(input.branchId) || !isRecord(input.target)) {
        throw new ProtocolError(tentativeId);
      }
      const target = input.target;
      if ((target.kind === 'start' && hasExactKeys(target, ['kind'])) ||
          (target.kind === 'cursor' && hasExactKeys(target, ['kind', 'cursor']) && isBoundedString(target.cursor, 1_024)) ||
          (target.kind === 'block' && hasExactKeys(target, ['kind', 'blockId']) && isBoundedString(target.blockId, 28) && /^blk_[0-9a-f]{24}$/.test(target.blockId)) ||
          (target.kind === 'window-start' && hasExactKeys(target, ['kind', 'blockId']) && isBoundedString(target.blockId, 28) && /^blk_[0-9a-f]{24}$/.test(target.blockId)) ||
          (target.kind === 'character' && hasExactKeys(target, ['kind', 'character']) && isSafeInteger(target.character)) ||
          (target.kind === 'proportion' && hasExactKeys(target, ['kind', 'proportion']) && typeof target.proportion === 'number' && Number.isFinite(target.proportion) && target.proportion >= 0 && target.proportion <= 1)) {
        break;
      }
      throw new ProtocolError(tentativeId);
    }
    case 'getOutline': {
      const input = requireInput(value.input, ['manuscriptId', 'branchId', 'cursor'], tentativeId);
      if (!isBoundedString(input.manuscriptId, 36) || !UUID_PATTERN.test(input.manuscriptId) ||
          !isBoundedString(input.branchId, 36) || !UUID_PATTERN.test(input.branchId) ||
          !(input.cursor === null || isBoundedString(input.cursor, 1_024))) throw new ProtocolError(tentativeId);
      break;
    }
    case 'startSearch': {
      const input = requireInput(value.input, ['manuscriptId', 'branchId', 'query'], tentativeId);
      if (!isBoundedString(input.manuscriptId, 36) || !UUID_PATTERN.test(input.manuscriptId) ||
          !isBoundedString(input.branchId, 36) || !UUID_PATTERN.test(input.branchId) ||
          !isBoundedString(input.query, 256)) throw new ProtocolError(tentativeId);
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
      if (!isBoundedString(input.searchId, 36) || !UUID_PATTERN.test(input.searchId) ||
          !(input.cursor === null || isBoundedString(input.cursor, 1_024))) throw new ProtocolError(tentativeId);
      break;
    }
    case 'prepareReplacement': {
      const input = requireInput(value.input, ['searchId', 'replacement', 'excludedMatchIds'], tentativeId);
      if (!isBoundedString(input.searchId, 36) || !UUID_PATTERN.test(input.searchId) ||
          !isBoundedString(input.replacement, 1_024, true) || !Array.isArray(input.excludedMatchIds) ||
          input.excludedMatchIds.length > MAX_REPLACEMENT_EXCLUSIONS ||
          !input.excludedMatchIds.every((id) => isBoundedString(id, 28) && /^hit_[0-9a-f]{24}$/.test(id))) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'freezeReplacement': {
      const input = requireInput(value.input, ['previewId', 'excludedMatchIds'], tentativeId);
      if (!isBoundedString(input.previewId, 36) || !UUID_PATTERN.test(input.previewId) || !Array.isArray(input.excludedMatchIds) ||
          input.excludedMatchIds.length > MAX_REPLACEMENT_EXCLUSIONS || !input.excludedMatchIds.every((id) => isBoundedString(id, 28) && /^hit_[0-9a-f]{24}$/.test(id))) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    case 'startReplacementCommit': {
      const input = requireInput(value.input, ['previewId'], tentativeId);
      if (!isBoundedString(input.previewId, 36) || !UUID_PATTERN.test(input.previewId)) throw new ProtocolError(tentativeId);
      break;
    }
    case 'commitReplacement': {
      const input = requireInput(value.input, ['previewId'], tentativeId);
      if (!isBoundedString(input.previewId, 36) || !UUID_PATTERN.test(input.previewId)) throw new ProtocolError(tentativeId);
      break;
    }
    case 'saveMilestone': {
      const input = requireInput(value.input, ['manuscriptId', 'branchId', 'label', 'purpose', 'note'], tentativeId);
      if (!isBoundedString(input.manuscriptId, 36) || !UUID_PATTERN.test(input.manuscriptId) ||
          !isBoundedString(input.branchId, 36) || !UUID_PATTERN.test(input.branchId) ||
          !isBoundedString(input.label, 80) || !isBoundedString(input.purpose, 120) ||
          !isBoundedString(input.note, 500, true)) throw new ProtocolError(tentativeId);
      break;
    }
    case 'undoManuscript':
    case 'redoManuscript': {
      const input = requireInput(value.input, ['manuscriptId', 'branchId', 'expectedWorkingDigest'], tentativeId);
      if (!isBoundedString(input.manuscriptId, 36) || !UUID_PATTERN.test(input.manuscriptId) ||
          !isBoundedString(input.branchId, 36) || !UUID_PATTERN.test(input.branchId) ||
          !isBoundedString(input.expectedWorkingDigest, 64) || !HEX_DIGEST_PATTERN.test(input.expectedWorkingDigest)) {
        throw new ProtocolError(tentativeId);
      }
      break;
    }
    default:
      throw new ProtocolError(tentativeId);
  }
  return value as ServiceRequest;
}

async function* readFrames(): AsyncGenerator<Uint8Array> {
  const header = Buffer.allocUnsafe(4);
  let headerOffset = 0;
  let payload: Buffer | undefined;
  let payloadOffset = 0;

  for await (const incoming of process.stdin) {
    const chunk = Buffer.isBuffer(incoming) ? incoming : Buffer.from(incoming as Uint8Array);
    let chunkOffset = 0;
    while (chunkOffset < chunk.length) {
      if (!payload) {
        const headerBytes = Math.min(4 - headerOffset, chunk.length - chunkOffset);
        chunk.copy(header, headerOffset, chunkOffset, chunkOffset + headerBytes);
        headerOffset += headerBytes;
        chunkOffset += headerBytes;
        if (headerOffset < 4) continue;
        const length = header.readUInt32BE(0);
        if (length === 0 || length > MAX_FRAME_BYTES) throw new ProtocolError();
        payload = Buffer.allocUnsafe(length);
        payloadOffset = 0;
      }

      const payloadBytes = Math.min(payload.length - payloadOffset, chunk.length - chunkOffset);
      chunk.copy(payload, payloadOffset, chunkOffset, chunkOffset + payloadBytes);
      payloadOffset += payloadBytes;
      chunkOffset += payloadBytes;
      if (payloadOffset === payload.length) {
        yield payload;
        payload = undefined;
        payloadOffset = 0;
        headerOffset = 0;
      }
    }
  }

  if (headerOffset !== 0 || payload !== undefined) throw new ProtocolError();
}

function failureResponse(
  requestId: string,
  error: unknown,
  StoreErrorClass?: typeof import('./store.js').StoreError,
): ServiceFailureResponse {
  if ((StoreErrorClass && error instanceof StoreErrorClass) || error instanceof ProtocolError) {
    return { id: requestId, ok: false, error: { code: error.code, message: error.message } };
  }
  return { id: requestId, ok: false, error: { code: 'SERVICE_REQUEST_FAILED', message: '服务请求失败。' } };
}

async function writeResponse(response: ServiceResponse): Promise<void> {
  let selected: ServiceResponse = response;
  let payload = Buffer.from(JSON.stringify(selected), 'utf8');
  if (payload.length > MAX_FRAME_BYTES && response.ok) {
    selected = {
      id: response.id,
      ok: false,
      error: { code: 'RESPONSE_TOO_LARGE', message: '服务响应超出安全范围。' },
    };
    payload = Buffer.from(JSON.stringify(selected), 'utf8');
  }
  if (payload.length === 0 || payload.length > MAX_FRAME_BYTES) throw new ProtocolError(response.id);
  const frame = Buffer.allocUnsafe(4 + payload.length);
  frame.writeUInt32BE(payload.length, 0);
  payload.copy(frame, 4);
  await new Promise<void>((resolve, reject) => {
    process.stdout.write(frame, (error) => (error ? reject(error) : resolve()));
  });
}

async function dispatch(
  store: EditorialStore,
  harness: DormantHarnessRuntime,
  jobs: CooperativeJobOwner,
  request: ServiceRequest,
): Promise<ServiceSuccessResponse> {
  switch (request.op) {
    case 'ready':
      return { id: request.id, ok: true, op: request.op, result: harness.readiness };
    case 'stageSelectedDocx':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: await store.stageSelectedDocx(request.input.selectionToken, request.input.selectedPath),
      };
    case 'prepareNewBookReview':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.prepareNewBookReview(
          request.input.draftId,
          request.input.expectedDraftVersion,
          request.input.targetChoiceId,
          request.input.confirmedTitle,
          request.input.acceptDegradation,
        ),
      };
    case 'commitNewBookImport':
      return { id: request.id, ok: true, op: request.op, result: store.commitNewBookImport(request.input) };
    case 'getManuscriptWindow':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.getManuscriptWindow(request.input.manuscriptId, request.input.branchId, request.input.cursor),
      };
    case 'flushJournalEdit':
      return { id: request.id, ok: true, op: request.op, result: store.flushJournalEdit(request.input) };
    case 'listPriorWork':
      return { id: request.id, ok: true, op: request.op, result: store.listPriorWork() };
    case 'getManuscriptWindowAt':
      return { id: request.id, ok: true, op: request.op, result: store.getManuscriptWindowAt(request.input.manuscriptId, request.input.branchId, request.input.target) };
    case 'getOutline':
      return { id: request.id, ok: true, op: request.op, result: store.getOutline(request.input.manuscriptId, request.input.branchId, request.input.cursor) };
    case 'startSearch':
      return { id: request.id, ok: true, op: request.op, result: jobs.startSearch(request.input.manuscriptId, request.input.branchId, request.input.query) };
    case 'pollServiceJob':
      return { id: request.id, ok: true, op: request.op, result: jobs.poll(request.input.jobId) };
    case 'cancelServiceJob':
      return { id: request.id, ok: true, op: request.op, result: jobs.cancel(request.input.jobId) };
    case 'getSearchResults':
      return { id: request.id, ok: true, op: request.op, result: store.getSearchResults(request.input.searchId, request.input.cursor) };
    case 'prepareReplacement':
      return { id: request.id, ok: true, op: request.op, result: store.prepareReplacement(request.input.searchId, request.input.replacement, request.input.excludedMatchIds) };
    case 'freezeReplacement':
      return { id: request.id, ok: true, op: request.op, result: store.freezeReplacement(request.input.previewId, request.input.excludedMatchIds) };
    case 'startReplacementCommit':
      return { id: request.id, ok: true, op: request.op, result: jobs.startReplacement(request.input.previewId) };
    case 'commitReplacement':
      return { id: request.id, ok: true, op: request.op, result: store.commitReplacement(request.input.previewId) };
    case 'saveMilestone':
      return { id: request.id, ok: true, op: request.op, result: store.saveMilestone(request.input.manuscriptId, request.input.branchId, request.input.label, request.input.purpose, request.input.note) };
    case 'undoManuscript':
      return { id: request.id, ok: true, op: request.op, result: store.undoManuscript(request.input.manuscriptId, request.input.branchId, request.input.expectedWorkingDigest) };
    case 'redoManuscript':
      return { id: request.id, ok: true, op: request.op, result: store.redoManuscript(request.input.manuscriptId, request.input.branchId, request.input.expectedWorkingDigest) };
    case 'shutdown':
      return { id: request.id, ok: true, op: request.op, result: { state: 'stopping' } };
  }
}

function parseArguments(argv: string[]): { dataRoot: string; parentPid: number } {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key || !value || values.has(key) || (key !== '--data-root' && key !== '--parent-pid')) throw new ProtocolError();
    values.set(key, value);
  }
  const dataRoot = values.get('--data-root');
  const parentPidValue = values.get('--parent-pid');
  const parentPid = Number(parentPidValue);
  if (!dataRoot || !isAbsolute(dataRoot) || !Number.isSafeInteger(parentPid) || parentPid <= 0 || process.ppid !== parentPid) {
    throw new ProtocolError();
  }
  return { dataRoot, parentPid };
}

function parentIsAlive(parentPid: number): boolean {
  if (process.ppid !== parentPid) return false;
  try {
    process.kill(parentPid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function run(): Promise<void> {
  installNodeNetworkDenial();
  const { dataRoot, parentPid } = parseArguments(process.argv.slice(2));
  const [{ EditorialStore, StoreError, StoreFatalError }, { mountDormantHarness }, { CooperativeJobOwner }] = await Promise.all([
    import('./store.js'),
    import('./runtime.js'),
    import('./cooperative-jobs.js'),
  ]);
  let stopping = false;
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    process.stdin.destroy();
  };
  const parentLease = setInterval(() => {
    if (!parentIsAlive(parentPid)) stop();
  }, 1_000);
  parentLease.unref();
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);

  let store: EditorialStore | undefined;
  let harness: DormantHarnessRuntime | undefined;
  let jobs: CooperativeJobOwner | undefined;
  try {
    const codeRoot = fileURLToPath(new URL('../../', import.meta.url));
    store = await EditorialStore.open(dataRoot, codeRoot);
    harness = await mountDormantHarness();
    jobs = new CooperativeJobOwner(store);
    for await (const frame of readFrames()) {
      let request: ServiceRequest;
      try {
        request = decodeRequest(frame);
      } catch (error) {
        const requestId = error instanceof ProtocolError ? error.requestId : 'invalid';
        await writeResponse(failureResponse(requestId, error, StoreError));
        continue;
      }
      let response: ServiceResponse;
      try {
        response = await dispatch(store, harness, jobs, request);
      } catch (error) {
        if (error instanceof StoreFatalError) {
          stop();
          throw error;
        }
        response = failureResponse(request.id, error, StoreError);
      }
      await writeResponse(response);
      if (request.op === 'shutdown') break;
    }
  } finally {
    clearInterval(parentLease);
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
    try {
      jobs?.dispose();
      await harness?.dispose();
    } finally {
      store?.close();
    }
  }
}

await run().catch(() => {
  process.exitCode = 1;
});
