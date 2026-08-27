import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MAX_EDIT_CODE_UNITS,
  MAX_FRAME_BYTES,
  type J01ImportControl,
  type ServiceFailureResponse,
  type ServiceRequest,
  type ServiceResponse,
  type ServiceSuccessResponse,
} from '../shared/protocol.js';
import { installNodeNetworkDenial } from '../shared/network-denial.js';
import type { DormantHarnessRuntime } from './runtime.js';
import type { EditorialStore } from './store.js';

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
    case 'getImportStartup':
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
  request: ServiceRequest,
  importControl: J01ImportControl | undefined,
): Promise<ServiceSuccessResponse> {
  switch (request.op) {
    case 'ready':
      return { id: request.id, ok: true, op: request.op, result: harness.readiness };
    case 'getImportStartup':
      return { id: request.id, ok: true, op: request.op, result: await store.getImportStartup() };
    case 'stageSelectedDocx':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: await store.stageSelectedDocx(request.input.selectionToken, request.input.selectedPath),
      };
    case 'continueImportDraft':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: await store.continueImportDraft(request.input.draftId, request.input.expectedDraftVersion),
      };
    case 'reselectImportDraft':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: await store.reselectImportDraft(
          request.input.draftId,
          request.input.expectedDraftVersion,
          request.input.selectionToken,
          request.input.selectedPath,
        ),
      };
    case 'abandonImportDraft':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: await store.abandonImportDraft(request.input.draftId, request.input.expectedDraftVersion),
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
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: await store.commitNewBookImport(request.input, {
          interruptAfterAttempt: importControl === 'before-commit' || importControl === 'uncertain-reconciliation',
        }),
      };
    case 'acknowledgeImportCompletion':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: await store.acknowledgeImportCompletion(request.input.commitId),
      };
    case 'getManuscriptWindow':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.getManuscriptWindow(request.input.manuscriptId, request.input.branchId, request.input.cursor),
      };
    case 'flushJournalEdit':
      return { id: request.id, ok: true, op: request.op, result: store.flushJournalEdit(request.input) };
    case 'shutdown':
      return { id: request.id, ok: true, op: request.op, result: { state: 'stopping' } };
  }
}

function parseArguments(argv: string[]): {
  dataRoot: string;
  parentPid: number;
  importControl: J01ImportControl | undefined;
} {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (
      !key ||
      !value ||
      values.has(key) ||
      (key !== '--data-root' && key !== '--parent-pid' && key !== '--j01-import-control')
    ) {
      throw new ProtocolError();
    }
    values.set(key, value);
  }
  const dataRoot = values.get('--data-root');
  const parentPidValue = values.get('--parent-pid');
  const parentPid = Number(parentPidValue);
  const importControlValue = values.get('--j01-import-control');
  const importControl =
    importControlValue === 'before-commit' ||
    importControlValue === 'after-commit-before-response' ||
    importControlValue === 'uncertain-reconciliation' ||
    importControlValue === 'legacy-reviewed-v2' ||
    importControlValue === 'abandon-object-delete-failure' ||
    importControlValue === 'after-abandon-object-delete-before-finalize'
      ? importControlValue
      : undefined;
  if (
    !dataRoot ||
    !isAbsolute(dataRoot) ||
    !Number.isSafeInteger(parentPid) ||
    parentPid <= 0 ||
    process.ppid !== parentPid ||
    (importControlValue !== undefined &&
      (importControl === undefined || process.env.AI7_E2E_JOURNEY !== 'J-01'))
  ) {
    throw new ProtocolError();
  }
  return { dataRoot, parentPid, importControl };
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
  const { dataRoot, parentPid, importControl } = parseArguments(process.argv.slice(2));
  const [{ EditorialStore, StoreError, StoreFatalError }, { mountDormantHarness }] = await Promise.all([
    import('./store.js'),
    import('./runtime.js'),
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
  try {
    const codeRoot = fileURLToPath(new URL('../../', import.meta.url));
    store = await EditorialStore.open(dataRoot, codeRoot, {
      induceUnprovableReconciliation: importControl === 'uncertain-reconciliation',
      persistLegacyReviewedDraft: importControl === 'legacy-reviewed-v2',
      induceAbandonObjectRemovalFailure: importControl === 'abandon-object-delete-failure',
      interruptAfterAbandonObjectRemoval: importControl === 'after-abandon-object-delete-before-finalize',
    });
    harness = await mountDormantHarness();
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
        response = await dispatch(store, harness, request, importControl);
      } catch (error) {
        if (error instanceof StoreFatalError) {
          stop();
          throw error;
        }
        response = failureResponse(request.id, error, StoreError);
      }
      if (request.op === 'commitNewBookImport' && importControl === 'after-commit-before-response') {
        stop();
        throw new Error('E2E interruption after committed import and before response.');
      }
      await writeResponse(response);
      if (request.op === 'shutdown') break;
    }
  } finally {
    clearInterval(parentLease);
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
    try {
      await harness?.dispose();
    } finally {
      store?.close();
    }
  }
}

await run().catch(() => {
  process.exitCode = 1;
});
