import { randomUUID } from 'node:crypto';
import { release } from 'node:os';
import { basename, extname, isAbsolute, resolve } from 'node:path';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  session,
  shell,
  type Event as ElectronEvent,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type Session,
} from 'electron';
import {
  IPC_CHANNELS,
  MAIN_EVENTS,
  type CommitNewBookRendererInput,
  type CommitManuscriptReimportRendererInput,
  type CommitSourceImportRendererInput,
  type BookWorkbenchOpenProjection,
  type BookWorkbenchRoute,
  type ContinueImportProjection,
  type ImportDraftRecoveryProjection,
  type ImportCommitProjection,
  type J01ImportControl,
  type J08RecoveryControl,
  type ModelServiceSettingsProjection,
  type PickerReselectResult,
  type PickerStageResult,
  type ProductDataLocationProjection,
  type ProductDataLocationRevealProjection,
  type RendererCallResult,
  type ResolvedBookWorkbenchRoute,
  type ReviewBeforeManuscriptReimportProjection,
  type ServiceJobProjection,
  type ServiceOperationMap,
} from '../shared/protocol.js';
import { ServiceCallError, ServiceClient } from './service-client.js';
import { openProtectedSecretStore, type ProtectedSecretStore } from './protected-secret-store.js';
import {
  createCanonicalExternalDataRoot,
  ensureCanonicalDataDirectory,
  inspectBoundedDataFootprint,
  requireSameCanonicalDataDirectory,
} from '../shared/data-root.js';

interface LaunchArguments {
  dataRoot: string;
  injectedPickerPath: string | undefined;
  importControl: J01ImportControl | undefined;
  recoveryControl: J08RecoveryControl | undefined;
  observeJ12Reveal: boolean;
  launcherPid: number;
}

type ImportMutationKind = 'manuscript-import' | 'source-import' | 'manuscript-reimport';

type ImportTargetBinding =
  | { kind: 'new-book'; mutation: ImportMutationKind; expectedBookId?: string }
  | { kind: 'existing-book'; mutation: ImportMutationKind; bookId: string };

interface ManuscriptCapability {
  bookId: string;
  manuscriptId: string;
  branchId: string;
  routeGeneration: number;
}

interface EditorResourceCapability {
  kind: 'job' | 'search' | 'preview';
  operation: 'search' | 'replacement' | 'reimport';
  bookId: string;
  manuscriptId: string | null;
  branchId: string | null;
  routeGeneration: number;
}

interface OwnedRendererWindow {
  window: BrowserWindow;
  bookId: string | null;
  route: ResolvedBookWorkbenchRoute | null;
  routeGeneration: number;
  routeRequestSequence: number;
  closeRisk: boolean;
  injectedPickerPath: string | undefined;
  commitBindings: Map<string, {
    draftId: string;
    expectedDraftVersion: number;
    reviewDigest: string;
    commitId: string;
  }>;
  importTargets: Map<string, ImportTargetBinding>;
  importDraftIds: Set<string>;
  recoveryAttentionIds: Set<string>;
  importCommitIds: Set<string>;
  manuscriptCapabilities: Map<string, ManuscriptCapability>;
  editorResourceCapabilities: Map<string, EditorResourceCapability>;
  restorationBindings: Map<string, Map<string, {
    restorationId: string;
    bookId: string;
    bookTitle: string;
    manuscriptId: string;
    branchId: string;
  }>>;
  restorationBindingCount: number;
}

interface ApplicationAuthorityClaims {
  requireNewDraftCapacity(owned: OwnedRendererWindow): void;
  claimImportState(owned: OwnedRendererWindow, draftId: string, commitId: string | null): void;
  requireDraft(owned: OwnedRendererWindow, draftId: string): void;
  releaseDraft(owned: OwnedRendererWindow, draftId: string): void;
  claimAttentions(owned: OwnedRendererWindow, attentionIds: ReadonlyArray<string>): void;
  requireAttention(owned: OwnedRendererWindow, attentionId: string): void;
  releaseAttention(owned: OwnedRendererWindow, attentionId: string): void;
  claimCommit(owned: OwnedRendererWindow, commitId: string): void;
  requireCommit(owned: OwnedRendererWindow, commitId: string): void;
  releaseCommit(owned: OwnedRendererWindow, commitId: string): void;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireDesktop(condition: unknown, message = 'AI7_DESKTOP_STARTUP_INVALID'): asserts condition {
  if (!condition) throw new Error(message);
}

function parseArguments(argv: string[]): LaunchArguments {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    requireDesktop(
      key !== undefined &&
        value !== undefined &&
        !values.has(key) &&
        (key === '--data-root' ||
          key === '--j01-picker-path' ||
          key === '--j02-picker-path' ||
          key === '--j08-picker-path' ||
          key === '--j12-picker-path' ||
          key === '--j01-import-control' ||
          key === '--j08-recovery-control' ||
          key === '--j12-observe-reveal' ||
          key === '--launcher-pid'),
    );
    values.set(key, value);
  }
  const dataRoot = values.get('--data-root');
  requireDesktop(dataRoot !== undefined && isAbsolute(dataRoot));
  const j01PickerPath = values.get('--j01-picker-path');
  const j02PickerPath = values.get('--j02-picker-path');
  const j08PickerPath = values.get('--j08-picker-path');
  const j12PickerPath = values.get('--j12-picker-path');
  requireDesktop([j01PickerPath, j02PickerPath, j08PickerPath, j12PickerPath].filter(Boolean).length <= 1);
  requireDesktop(
    j01PickerPath === undefined ||
      (process.env.AI7_E2E_JOURNEY === 'J-01' &&
        isAbsolute(j01PickerPath) &&
        extname(j01PickerPath).toLocaleLowerCase('en-US') === '.docx'),
  );
  requireDesktop(
    j02PickerPath === undefined ||
      (process.env.AI7_E2E_JOURNEY === 'J-02' &&
        isAbsolute(j02PickerPath) &&
        extname(j02PickerPath).toLocaleLowerCase('en-US') === '.docx'),
  );
  requireDesktop(
    j08PickerPath === undefined ||
      (process.env.AI7_E2E_JOURNEY === 'J-08' &&
        isAbsolute(j08PickerPath) &&
        extname(j08PickerPath).toLocaleLowerCase('en-US') === '.docx'),
  );
  requireDesktop(
    j12PickerPath === undefined ||
      (process.env.AI7_E2E_JOURNEY === 'J-12' &&
        isAbsolute(j12PickerPath) &&
        extname(j12PickerPath).toLocaleLowerCase('en-US') === '.docx'),
  );
  const injectedPickerPath = j01PickerPath ?? j02PickerPath ?? j08PickerPath ?? j12PickerPath;
  const importControlValue = values.get('--j01-import-control');
  const importControl =
    importControlValue === 'before-commit' ||
    importControlValue === 'after-commit-before-response' ||
    importControlValue === 'legacy-result-json-without-receipt' ||
    importControlValue === 'uncertain-reconciliation' ||
    importControlValue === 'legacy-reviewed-v2' ||
    importControlValue === 'tamper-reimport-proof-before-validation' ||
    importControlValue === 'abandon-object-delete-failure' ||
    importControlValue === 'after-abandon-object-delete-before-finalize'
      ? importControlValue
      : undefined;
  const recoveryControlValue = values.get('--j08-recovery-control');
  const recoveryControl = recoveryControlValue === 'interrupt-after-journal-ack'
    ? recoveryControlValue
    : undefined;
  const observeJ12RevealValue = values.get('--j12-observe-reveal');
  const observeJ12Reveal = observeJ12RevealValue === 'true';
  const launcherPid = Number(values.get('--launcher-pid'));
  requireDesktop(
    importControlValue === undefined || (process.env.AI7_E2E_JOURNEY === 'J-01' && importControl !== undefined),
  );
  requireDesktop(
    recoveryControlValue === undefined || (process.env.AI7_E2E_JOURNEY === 'J-08' && recoveryControl !== undefined),
  );
  requireDesktop(!(importControl && recoveryControl));
  requireDesktop(
    observeJ12RevealValue === undefined ||
      (process.env.AI7_E2E_JOURNEY === 'J-12' && observeJ12RevealValue === 'true'),
  );
  requireDesktop(Number.isSafeInteger(launcherPid) && launcherPid > 0 && launcherPid === process.ppid);
  return { dataRoot, injectedPickerPath, importControl, recoveryControl, observeJ12Reveal, launcherPid };
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function validateRuntime(): void {
  requireDesktop(
    process.versions.electron === '43.4.1' &&
      process.versions.node === '24.18.1' &&
      process.versions.modules === '148' &&
      ((process.platform === 'win32' && process.arch === 'x64' && Number(release().split('.')[2]) >= 26_100) ||
        (process.platform === 'darwin' && process.arch === 'arm64' && Number(release().split('.')[0]) >= 24)),
  );
}

function installChromiumDenial(productSession: Session): void {
  productSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
    (_details, callback) => callback({ cancel: true }),
  );
  productSession.setPermissionCheckHandler(() => false);
  productSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  productSession.on('will-download', (event) => event.preventDefault());
}

function safeFailure(error: unknown): RendererCallResult<never> {
  if (error instanceof ServiceCallError) {
    return { ok: false, error: { code: error.code, message: error.message } };
  }
  return { ok: false, error: { code: 'DESKTOP_REQUEST_FAILED', message: '桌面操作未完成，请重试。' } };
}

async function envelope<Result>(operation: () => Promise<Result> | Result): Promise<RendererCallResult<Result>> {
  try {
    return { ok: true, result: await operation() };
  } catch (error) {
    return safeFailure(error);
  }
}

async function announceProductReadiness(): Promise<void> {
  await new Promise<void>((resolveReady, reject) => {
    process.stdout.write('AI7_READY\n', (error) => (error ? reject(error) : resolveReady()));
  });
}

function registerRendererHandlers(
  service: ServiceClient,
  getOwnedWindow: (event: IpcMainInvokeEvent | IpcMainEvent) => OwnedRendererWindow,
  authorityIsAvailable: () => boolean,
  openBookWorkbench: (
    requester: OwnedRendererWindow,
    route: BookWorkbenchRoute,
  ) => Promise<BookWorkbenchOpenProjection>,
  requestBookWorkbench: (
    requester: OwnedRendererWindow,
    route: BookWorkbenchRoute,
  ) => Promise<BookWorkbenchOpenProjection>,
  serializeEffect: <Result>(operation: () => Promise<Result>) => Promise<Result>,
  claims: ApplicationAuthorityClaims,
  bindPresentedBook: (owned: OwnedRendererWindow, bookId: string, bookTitle: string) => void,
  leaveBookWorkbench: (owned: OwnedRendererWindow) => void,
  getProductDataLocation: () => Promise<ProductDataLocationProjection>,
  revealProductDataLocation: () => ProductDataLocationRevealProjection,
  getModelServiceSettings: () => Promise<ModelServiceSettingsProjection>,
  saveModelServiceCredential: (input: { connectionName: string; secret: string }) => Promise<ModelServiceSettingsProjection>,
  removeModelServiceCredential: () => Promise<ModelServiceSettingsProjection>,
): () => void {
  const AMBIGUOUS_SERVICE_FAILURES = new Set([
    'COMMIT_PROOF_INCONCLUSIVE',
    'IMPORT_COMMIT_OUTCOME_UNCERTAIN',
    'SERVICE_TIMEOUT',
    'SERVICE_STOPPED',
    'SERVICE_WRITE_FAILED',
    'SERVICE_RESPONSE_INVALID',
    'SERVICE_PROTOCOL_FAILED',
  ]);
  const releaseNewCommitClaimAfterDeterministicFailure = (
    owned: OwnedRendererWindow,
    commitId: string,
    wasAlreadyClaimed: boolean,
    error: unknown,
  ): boolean => {
    const deterministic = error instanceof ServiceCallError && !AMBIGUOUS_SERVICE_FAILURES.has(error.code);
    if (!wasAlreadyClaimed && deterministic) {
      claims.releaseCommit(owned, commitId);
    }
    return deterministic;
  };
  const requireCurrentRouteGeneration = (owned: OwnedRendererWindow, routeGeneration: number): void => {
    if (owned.routeGeneration !== routeGeneration) {
      throw new ServiceCallError(
        'AI7_SERVICE_ROUTE_STALE',
        '图书工作台路由已经更新；较早的本地结果未显示。',
      );
    }
  };
  const requireCurrentRouteReadEpoch = (
    owned: OwnedRendererWindow,
    routeGeneration: number,
    routeRequestSequence: number,
  ): void => {
    requireCurrentRouteGeneration(owned, routeGeneration);
    if (owned.routeRequestSequence !== routeRequestSequence) {
      throw new ServiceCallError(
        'AI7_SERVICE_ROUTE_STALE',
        '图书工作台已有较新的路由请求；较早的本地结果未显示。',
      );
    }
  };
  const requireCurrentBookRoute = (owned: OwnedRendererWindow): Extract<ResolvedBookWorkbenchRoute, { kind: 'book' }> => {
    if (owned.route?.kind !== 'book' || owned.bookId !== owned.route.bookId) {
      throw new ServiceCallError(
        'AI7_EDITOR_ROUTE_INVALID',
        '当前图书工作台不是可编辑的图书路由；本次读取或写入未执行。',
      );
    }
    return owned.route;
  };
  const manuscriptCapabilityKey = (manuscriptId: string, branchId: string): string => `${manuscriptId}:${branchId}`;
  const rememberManuscriptCapability = (
    owned: OwnedRendererWindow,
    projection: ServiceOperationMap['getManuscriptWindow']['output'],
    expected: { manuscriptId: string; branchId: string },
    routeGeneration: number,
    routeRequestSequence?: number,
  ): ManuscriptCapability => {
    if (routeRequestSequence === undefined) requireCurrentRouteGeneration(owned, routeGeneration);
    else requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
    const route = requireCurrentBookRoute(owned);
    if (
      projection.bookId !== route.bookId ||
      projection.manuscriptId !== expected.manuscriptId ||
      projection.branchId !== expected.branchId
    ) {
      throw new ServiceCallError(
        'AI7_EDITOR_ROUTE_INVALID',
        '稿件读取结果不属于当前图书工作台；结果未显示。',
      );
    }
    const key = manuscriptCapabilityKey(projection.manuscriptId, projection.branchId);
    if (!owned.manuscriptCapabilities.has(key) && owned.manuscriptCapabilities.size >= 16) {
      throw new ServiceCallError('AI7_EDITOR_ROUTE_INVALID', '当前图书工作台的稿件能力已达到有界上限。');
    }
    const capability = {
      bookId: projection.bookId,
      manuscriptId: projection.manuscriptId,
      branchId: projection.branchId,
      routeGeneration,
    };
    owned.manuscriptCapabilities.set(key, capability);
    return capability;
  };
  const requireManuscriptCapability = (
    owned: OwnedRendererWindow,
    input: { manuscriptId: string; branchId: string },
  ): ManuscriptCapability => {
    const route = requireCurrentBookRoute(owned);
    const capability = owned.manuscriptCapabilities.get(manuscriptCapabilityKey(input.manuscriptId, input.branchId));
    if (
      capability === undefined ||
      capability.routeGeneration !== owned.routeGeneration ||
      capability.bookId !== route.bookId
    ) {
      throw new ServiceCallError(
        'AI7_EDITOR_CAPABILITY_INVALID',
        '当前窗口没有这份稿件与分支的可编辑能力；本次读取或写入未执行。',
      );
    }
    return capability;
  };
  const resourceCapabilityKey = (kind: EditorResourceCapability['kind'], id: string): string => `${kind}:${id}`;
  const rememberImportDraft = (owned: OwnedRendererWindow, draftId: string): void => {
    if (!UUID_PATTERN.test(draftId)) {
      throw new ServiceCallError('AI7_IMPORT_DRAFT_CAPABILITY_INVALID', '导入草稿标识无效。');
    }
    if (!owned.importDraftIds.has(draftId) && owned.importDraftIds.size >= 32) {
      throw new ServiceCallError('AI7_IMPORT_DRAFT_CAPABILITY_INVALID', '当前窗口的导入草稿能力已达到有界上限。');
    }
    claims.claimImportState(owned, draftId, null);
    owned.importDraftIds.add(draftId);
  };
  const requireImportDraft = (owned: OwnedRendererWindow, draftId: string): void => {
    if (!owned.importDraftIds.has(draftId)) {
      throw new ServiceCallError(
        'AI7_IMPORT_DRAFT_CAPABILITY_INVALID',
        '当前窗口没有这个本机选择导入草稿的能力；本次读取或写入未执行。',
      );
    }
    claims.requireDraft(owned, draftId);
  };
  const rememberEditorResource = (
    owned: OwnedRendererWindow,
    kind: EditorResourceCapability['kind'],
    id: string,
    capability: Omit<EditorResourceCapability, 'kind' | 'routeGeneration'>,
  ): EditorResourceCapability => {
    const route = requireCurrentBookRoute(owned);
    if (route.bookId !== capability.bookId) {
      throw new ServiceCallError('AI7_EDITOR_CAPABILITY_INVALID', '编辑操作结果不属于当前图书工作台。');
    }
    const key = resourceCapabilityKey(kind, id);
    if (!owned.editorResourceCapabilities.has(key) && owned.editorResourceCapabilities.size >= 128) {
      throw new ServiceCallError('AI7_EDITOR_CAPABILITY_INVALID', '当前图书工作台的编辑操作能力已达到有界上限。');
    }
    const resource = { kind, ...capability, routeGeneration: owned.routeGeneration };
    owned.editorResourceCapabilities.set(key, resource);
    return resource;
  };
  const requireEditorResource = (
    owned: OwnedRendererWindow,
    kind: EditorResourceCapability['kind'],
    id: string,
  ): EditorResourceCapability => {
    const route = requireCurrentBookRoute(owned);
    const capability = owned.editorResourceCapabilities.get(resourceCapabilityKey(kind, id));
    if (
      capability === undefined ||
      capability.routeGeneration !== owned.routeGeneration ||
      capability.bookId !== route.bookId
    ) {
      throw new ServiceCallError(
        'AI7_EDITOR_CAPABILITY_INVALID',
        '当前窗口没有这个编辑操作标识的能力；本次读取或写入未执行。',
      );
    }
    return capability;
  };
  const operationForJob = (job: ServiceJobProjection): EditorResourceCapability['operation'] =>
    job.kind === 'search'
      ? 'search'
      : job.kind === 'replacement'
        ? 'replacement'
        : 'reimport';
  const resourceSeed = (
    capability: ManuscriptCapability | EditorResourceCapability,
    operation: EditorResourceCapability['operation'] = 'operation' in capability ? capability.operation : 'search',
  ): Omit<EditorResourceCapability, 'kind' | 'routeGeneration'> => ({
    operation,
    bookId: capability.bookId,
    manuscriptId: capability.manuscriptId,
    branchId: capability.branchId,
  });
  const requireResourceIdentity = (
    capability: { manuscriptId: string | null; branchId: string | null },
    result: { manuscriptId: string; branchId: string },
  ): void => {
    if (
      capability.manuscriptId !== null && capability.manuscriptId !== result.manuscriptId ||
      capability.branchId !== null && capability.branchId !== result.branchId
    ) {
      throw new ServiceCallError(
        'AI7_EDITOR_CAPABILITY_INVALID',
        '编辑操作结果不属于发起操作的稿件与分支；结果未显示。',
      );
    }
  };
  const rememberJobResources = (
    owned: OwnedRendererWindow,
    job: ServiceJobProjection,
    capability: Omit<EditorResourceCapability, 'kind' | 'routeGeneration'>,
  ): void => {
    const actualOperation = operationForJob(job);
    if (actualOperation !== capability.operation) {
      throw new ServiceCallError('AI7_EDITOR_CAPABILITY_INVALID', '后台编辑操作类型与窗口能力不一致。');
    }
    const result = job.result;
    if (result !== null && 'previewId' in result) {
      if (actualOperation !== 'replacement') {
        throw new ServiceCallError('AI7_EDITOR_CAPABILITY_INVALID', '后台编辑操作结果类型不一致。');
      }
      requireResourceIdentity(capability, result);
    } else if (result !== null && 'searchId' in result) {
      if (actualOperation !== 'search') {
        throw new ServiceCallError('AI7_EDITOR_CAPABILITY_INVALID', '后台编辑操作结果类型不一致。');
      }
      requireResourceIdentity(capability, result);
    } else if (result !== null && 'checkpoint' in result && 'comparison' in result) {
      if (
        actualOperation !== 'reimport' ||
        result.target.bookId !== capability.bookId ||
        capability.manuscriptId !== null && result.target.manuscriptId !== capability.manuscriptId ||
        capability.branchId !== null && result.target.branchId !== capability.branchId
      ) {
        throw new ServiceCallError('AI7_EDITOR_CAPABILITY_INVALID', '稿件重新导入结果不属于当前图书工作台。');
      }
    } else if (result !== null && 'reimportRecordId' in result) {
      if (
        actualOperation !== 'reimport' ||
        result.bookId !== capability.bookId ||
        capability.manuscriptId !== null && result.manuscriptId !== capability.manuscriptId ||
        capability.branchId !== null && result.branchId !== capability.branchId
      ) {
        throw new ServiceCallError('AI7_EDITOR_CAPABILITY_INVALID', '稿件重新导入提交结果不属于当前图书工作台。');
      }
    } else if (result !== null) {
      throw new ServiceCallError('AI7_EDITOR_CAPABILITY_INVALID', '后台编辑操作返回了不适用的结果类型。');
    }
    const resourceKeys = [resourceCapabilityKey('job', job.jobId)];
    if (result !== null && 'previewId' in result) {
      resourceKeys.push(resourceCapabilityKey('preview', result.previewId));
    } else if (result !== null && 'searchId' in result) {
      resourceKeys.push(resourceCapabilityKey('search', result.searchId));
    }
    const missingResourceCount = new Set(resourceKeys.filter((key) => !owned.editorResourceCapabilities.has(key))).size;
    if (owned.editorResourceCapabilities.size + missingResourceCount > 128) {
      throw new ServiceCallError('AI7_EDITOR_CAPABILITY_INVALID', '当前图书工作台的编辑操作能力已达到有界上限。');
    }
    rememberEditorResource(owned, 'job', job.jobId, capability);
    if (result === null) return;
    if ('previewId' in result) {
      rememberEditorResource(owned, 'preview', result.previewId, {
        ...capability,
        operation: 'replacement',
        manuscriptId: result.manuscriptId,
        branchId: result.branchId,
      });
      return;
    }
    if ('searchId' in result) {
      rememberEditorResource(owned, 'search', result.searchId, {
        ...capability,
        operation: 'search',
        manuscriptId: result.manuscriptId,
        branchId: result.branchId,
      });
    }
  };
  const bindImportCommit = (
    owned: OwnedRendererWindow,
    input: CommitNewBookRendererInput | CommitSourceImportRendererInput | CommitManuscriptReimportRendererInput,
  ): ServiceOperationMap['commitNewBookImport']['input'] => {
    requireDesktop(
      input.commitAttemptId === null ||
        (typeof input.commitAttemptId === 'string' && UUID_PATTERN.test(input.commitAttemptId)),
      'AI7_RENDERER_BOUNDARY_INVALID',
    );
    let binding = owned.commitBindings.get(input.draftId);
    if (!binding) {
      binding = {
        draftId: input.draftId,
        expectedDraftVersion: input.expectedDraftVersion,
        reviewDigest: input.reviewDigest,
        commitId: input.commitAttemptId ?? randomUUID(),
      };
      owned.commitBindings.set(input.draftId, binding);
    }
    requireDesktop(
      binding.draftId === input.draftId &&
        binding.expectedDraftVersion === input.expectedDraftVersion &&
        binding.reviewDigest === input.reviewDigest &&
        (input.commitAttemptId === null || binding.commitId === input.commitAttemptId),
    );
    return {
      draftId: binding.draftId,
      expectedDraftVersion: binding.expectedDraftVersion,
      reviewDigest: binding.reviewDigest,
      commitId: binding.commitId,
    };
  };
  const releaseCommitBinding = (owned: OwnedRendererWindow, draftId: string): void => {
    const binding = owned.commitBindings.get(draftId);
    if (binding !== undefined) claims.releaseCommit(owned, binding.commitId);
    owned.commitBindings.delete(draftId);
  };
  type ImportReviewProjection = Extract<ContinueImportProjection, { state: 'review-ready' }>['review'];
  const captureImportReviewTarget = (
    owned: OwnedRendererWindow,
    review: ImportReviewProjection,
  ): void => {
    claims.claimImportState(owned, review.draftId, review.commitAttemptId);
    if (review.reviewDigest === null) {
      releaseCommitBinding(owned, review.draftId);
    } else {
      const existing = owned.commitBindings.get(review.draftId);
      const identicalExisting = existing !== undefined &&
        existing.expectedDraftVersion === review.draftVersion &&
        existing.reviewDigest === review.reviewDigest &&
        (review.commitAttemptId === null || existing.commitId === review.commitAttemptId);
      if (!identicalExisting) {
        if (existing !== undefined && existing.commitId !== review.commitAttemptId) {
          claims.releaseCommit(owned, existing.commitId);
        }
        owned.commitBindings.set(review.draftId, {
          draftId: review.draftId,
          expectedDraftVersion: review.draftVersion,
          reviewDigest: review.reviewDigest,
          commitId: review.commitAttemptId ?? randomUUID(),
        });
      }
    }
    const mutation: ImportMutationKind = 'comparison' in review
      ? 'manuscript-reimport'
      : 'retainedBoundary' in review
        ? 'source-import'
        : 'manuscript-import';
    const target: ImportTargetBinding = review.target.kind === 'existing-book'
      ? { kind: 'existing-book', mutation, bookId: review.target.bookId }
      : {
          kind: 'new-book',
          mutation,
          ...('bookId' in review.target ? { expectedBookId: review.target.bookId } : {}),
        };
    owned.importTargets.set(review.draftId, target);
  };
  const importTargetFromCommittedResult = (result: ImportCommitProjection): ImportTargetBinding => ({
    kind: 'existing-book',
    mutation: 'reimportRecordId' in result
      ? 'manuscript-reimport'
      : 'sourceImportRecordId' in result
        ? 'source-import'
        : 'manuscript-import',
    bookId: result.overview.book.bookId,
  });
  const bindCommittedImport = (
    owned: OwnedRendererWindow,
    result: ImportCommitProjection,
    draftId?: string,
  ): void => {
    const alreadyClaimed = owned.importCommitIds.has(result.commitId);
    claims.claimCommit(owned, result.commitId);
    try {
      bindPresentedBook(owned, result.overview.book.bookId, result.overview.book.title);
    } catch (error) {
      if (!alreadyClaimed) claims.releaseCommit(owned, result.commitId);
      throw error;
    }
    owned.importCommitIds.add(result.commitId);
    if ('firstWindow' in result) {
      rememberManuscriptCapability(
        owned,
        result.firstWindow,
        { manuscriptId: result.manuscriptId, branchId: result.branchId },
        owned.routeGeneration,
      );
    } else if ('window' in result) {
      rememberManuscriptCapability(
        owned,
        result.window,
        { manuscriptId: result.manuscriptId, branchId: result.branchId },
        owned.routeGeneration,
      );
    }
    if (draftId !== undefined) owned.importTargets.set(draftId, importTargetFromCommittedResult(result));
  };
  const captureImportRecoveryTarget = (
    owned: OwnedRendererWindow,
    recovery: ImportDraftRecoveryProjection,
  ): void => {
    claims.claimImportState(owned, recovery.draftId, recovery.commitAttemptId);
    const mutation: ImportMutationKind | null = recovery.relationshipLabel === '作为首份稿件导入'
      ? 'manuscript-import'
      : recovery.relationshipLabel === '作为来源材料导入'
        ? 'source-import'
        : recovery.relationshipLabel === '重新导入主稿件'
          ? 'manuscript-reimport'
          : null;
    if (mutation === null) {
      owned.importTargets.delete(recovery.draftId);
      return;
    }
    owned.importTargets.set(
      recovery.draftId,
      recovery.targetBookId === null
        ? { kind: 'new-book', mutation }
        : { kind: 'existing-book', mutation, bookId: recovery.targetBookId },
    );
  };
  const priorWorkAttentionIds = (
    priorWork: ServiceOperationMap['listPriorWork']['output'],
  ): ReadonlyArray<string> =>
    priorWork.flatMap((item) => item.recoveryAttention === null ? [] : [item.recoveryAttention.attentionId]);
  const claimPriorWorkAttentions = (
    owned: OwnedRendererWindow,
    priorWork: ServiceOperationMap['listPriorWork']['output'],
  ): void => claims.claimAttentions(owned, priorWorkAttentionIds(priorWork));
  const captureImportContinuation = (
    owned: OwnedRendererWindow,
    continuation: ContinueImportProjection,
    draftId: string,
  ): void => {
    rememberImportDraft(owned, draftId);
    if (continuation.state === 'review-ready') {
      captureImportReviewTarget(owned, continuation.review);
      return;
    }
    if (continuation.state === 'committed-recovered') {
      bindCommittedImport(owned, continuation.result, draftId);
      return;
    }
    if (continuation.state === 'reselection-required' || continuation.state === 'outcome-uncertain') {
      if (continuation.state === 'reselection-required') releaseCommitBinding(owned, draftId);
      captureImportRecoveryTarget(owned, continuation.recovery);
    } else {
      releaseCommitBinding(owned, draftId);
      owned.importTargets.delete(draftId);
    }
    leaveBookWorkbench(owned);
  };
  const captureReimportJob = (owned: OwnedRendererWindow, job: ServiceJobProjection): void => {
    const result = job.result;
    if (result === null) return;
    if ('checkpoint' in result && 'comparison' in result) {
      captureImportReviewTarget(owned, result as ReviewBeforeManuscriptReimportProjection);
      return;
    }
    if ('reimportRecordId' in result && 'overview' in result) {
      requireDesktop(owned.bookId === result.overview.book.bookId, 'AI7_SERVICE_ROUTE_INVALID');
      bindCommittedImport(owned, result);
    }
  };
  const reserveAcknowledgedManuscriptReimportReplay = async (
    owned: OwnedRendererWindow,
    input: CommitManuscriptReimportRendererInput,
  ): Promise<{ bookId: string; commitWasClaimed: boolean } | null> => {
    if (owned.importDraftIds.has(input.draftId)) return null;
    if (
      input.commitAttemptId === null ||
      owned.route !== null ||
      owned.bookId !== null ||
      owned.commitBindings.has(input.draftId) ||
      owned.importTargets.has(input.draftId)
    ) {
      throw new ServiceCallError(
        'AI7_IMPORT_DRAFT_CAPABILITY_INVALID',
        '当前窗口没有这个稿件重新导入重放能力；本次重放未执行。',
      );
    }
    const proof = await service.call('resolveAcknowledgedManuscriptReimportReplay', {
      draftId: input.draftId,
      expectedDraftVersion: input.expectedDraftVersion,
      reviewDigest: input.reviewDigest,
      commitId: input.commitAttemptId,
    });
    if (
      proof.draftId !== input.draftId ||
      proof.commitId !== input.commitAttemptId ||
      !UUID_PATTERN.test(proof.bookId)
    ) {
      throw new ServiceCallError('AI7_IMPORT_DRAFT_CAPABILITY_INVALID', '稿件重新导入重放证明不一致。');
    }
    const commitWasClaimed = owned.importCommitIds.has(proof.commitId);
    claims.claimImportState(owned, proof.draftId, proof.commitId);
    owned.commitBindings.set(proof.draftId, {
      draftId: proof.draftId,
      expectedDraftVersion: input.expectedDraftVersion,
      reviewDigest: input.reviewDigest,
      commitId: proof.commitId,
    });
    owned.importTargets.set(proof.draftId, {
      kind: 'existing-book',
      mutation: 'manuscript-reimport',
      bookId: proof.bookId,
    });
    try {
      const opened = await openBookWorkbench(owned, { kind: 'book', bookId: proof.bookId });
      if (opened.target !== 'requesting-window') {
        throw new ServiceCallError(
          'BOOK_WORKBENCH_ALREADY_OPEN',
          '已显示这本图书现有的工作台；稿件重新导入重放未执行。',
        );
      }
      requireDesktop(opened.route.bookId === proof.bookId, 'AI7_SERVICE_ROUTE_INVALID');
    } catch (error) {
      owned.commitBindings.delete(proof.draftId);
      owned.importTargets.delete(proof.draftId);
      claims.releaseDraft(owned, proof.draftId);
      if (!commitWasClaimed) claims.releaseCommit(owned, proof.commitId);
      if (owned.bookId === proof.bookId) leaveBookWorkbench(owned);
      throw error;
    }
    return { bookId: proof.bookId, commitWasClaimed };
  };
  const rollbackAcknowledgedManuscriptReimportReplay = (
    owned: OwnedRendererWindow,
    input: CommitManuscriptReimportRendererInput,
    reservation: { bookId: string; commitWasClaimed: boolean },
  ): void => {
    owned.commitBindings.delete(input.draftId);
    owned.importTargets.delete(input.draftId);
    claims.releaseDraft(owned, input.draftId);
    if (!reservation.commitWasClaimed && input.commitAttemptId !== null) {
      claims.releaseCommit(owned, input.commitAttemptId);
    }
    if (owned.bookId === reservation.bookId) leaveBookWorkbench(owned);
  };
  const requireImportTarget = async (
    owned: OwnedRendererWindow,
    input: { draftId: string; expectedDraftVersion: number },
    mutation: ImportMutationKind,
  ): Promise<ImportTargetBinding> => {
    requireImportDraft(owned, input.draftId);
    let target = owned.importTargets.get(input.draftId);
    if (!target) {
      const routeGeneration = owned.routeGeneration;
      const continuation = await service.call('continueImportDraft', input);
      requireCurrentRouteGeneration(owned, routeGeneration);
      captureImportContinuation(owned, continuation, input.draftId);
      target = owned.importTargets.get(input.draftId);
    }
    if (!target || target.mutation !== mutation) {
      throw new ServiceCallError('IMPORT_REVIEW_REQUIRED', '导入目标需要重新复核；本次未提交。');
    }
    return target;
  };
  const reserveExistingImportTarget = async (
    owned: OwnedRendererWindow,
    target: ImportTargetBinding,
  ): Promise<void> => {
    if (target.kind === 'new-book') return;
    const opened = await openBookWorkbench(owned, { kind: 'book', bookId: target.bookId });
    if (opened.target !== 'requesting-window') {
      const consequence = target.mutation === 'source-import'
        ? '来源材料未提交。'
        : target.mutation === 'manuscript-reimport'
          ? '稿件重新导入未提交。'
          : '首份稿件未提交。';
      throw new ServiceCallError(
        'BOOK_WORKBENCH_ALREADY_OPEN',
        `已显示这本图书现有的工作台；${consequence}`,
      );
    }
    requireDesktop(opened.route.bookId === target.bookId, 'AI7_SERVICE_ROUTE_INVALID');
  };
  const reserveReimportContinuationTarget = async (
    owned: OwnedRendererWindow,
    continuation: ContinueImportProjection,
  ): Promise<void> => {
    if (continuation.state !== 'review-ready' || !('comparison' in continuation.review)) return;
    const target = owned.importTargets.get(continuation.review.draftId);
    if (target?.kind !== 'existing-book' || target.mutation !== 'manuscript-reimport') {
      throw new ServiceCallError('AI7_IMPORT_DRAFT_CAPABILITY_INVALID', '稿件重新导入目标能力无效。');
    }
    await reserveExistingImportTarget(owned, target);
  };
  const requireReimportDraftBook = (
    owned: OwnedRendererWindow,
    draftId: string,
  ): Extract<ImportTargetBinding, { kind: 'existing-book' }> => {
    requireImportDraft(owned, draftId);
    const target = owned.importTargets.get(draftId);
    const route = requireCurrentBookRoute(owned);
    if (
      target?.kind !== 'existing-book' ||
      target.mutation !== 'manuscript-reimport' ||
      target.bookId !== route.bookId
    ) {
      throw new ServiceCallError(
        'AI7_IMPORT_DRAFT_CAPABILITY_INVALID',
        '稿件重新导入草稿不属于当前图书工作台；本次读取或写入未执行。',
      );
    }
    return target;
  };
  const requireSender = (event: IpcMainInvokeEvent | IpcMainEvent): OwnedRendererWindow => {
    const owned = getOwnedWindow(event);
    requireDesktop(
      !owned.window.isDestroyed() &&
        event.sender.id === owned.window.webContents.id &&
        event.senderFrame === owned.window.webContents.mainFrame,
      'AI7_RENDERER_BOUNDARY_INVALID',
    );
    return owned;
  };
  const requireAuthority = (): void => {
    if (!authorityIsAvailable()) {
      throw new ServiceCallError('SERVICE_INTERRUPTED', '本地业务服务已中断；当前业务操作不可继续。');
    }
  };
  const closeRiskListener = (event: IpcMainEvent, input: unknown): void => {
    const owned = requireSender(event);
    requireDesktop(typeof input === 'boolean', 'AI7_RENDERER_BOUNDARY_INVALID');
    owned.closeRisk = input;
  };
  const chooseDocx = async (owned: OwnedRendererWindow): Promise<string | undefined> => {
    let selectedPath = owned.injectedPickerPath;
    owned.injectedPickerPath = undefined;
    if (!selectedPath) {
      const selected = await dialog.showOpenDialog(owned.window, {
        title: '选择要导入的 DOCX 稿件',
        buttonLabel: '选择稿件',
        properties: ['openFile'],
        filters: [{ name: 'Word 文档', extensions: ['docx'] }],
      });
      if (selected.canceled || selected.filePaths.length !== 1) return undefined;
      selectedPath = selected.filePaths[0];
    }
    requireDesktop(
      selectedPath !== undefined &&
        isAbsolute(selectedPath) &&
        extname(basename(selectedPath)).toLocaleLowerCase('en-US') === '.docx',
    );
    return selectedPath;
  };

  ipcMain.on(MAIN_EVENTS.closeRiskChanged, closeRiskListener);

  ipcMain.handle(IPC_CHANNELS.getStartup, (event) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        const routeGeneration = owned.routeGeneration;
        const result = await service.call('getStartup', {});
        requireCurrentRouteGeneration(owned, routeGeneration);
        if (result.state === 'manuscript-recovery') {
          claims.claimAttentions(owned, [
            result.recovery.attentionId,
            ...priorWorkAttentionIds(result.recovery.otherPriorWork),
          ]);
          leaveBookWorkbench(owned);
        } else if (result.state === 'import') {
          if (result.startup.state === 'committed-recovered') {
            bindCommittedImport(owned, result.startup.result);
          } else {
            if (result.startup.state !== 'none') captureImportRecoveryTarget(owned, result.startup.recovery);
            leaveBookWorkbench(owned);
          }
        } else {
          claimPriorWorkAttentions(owned, result.priorWork);
          leaveBookWorkbench(owned);
        }
        return result;
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.getRecoveryComparison,
    (event, input: ServiceOperationMap['getRecoveryComparison']['input']) =>
      envelope(async () => {
        const owned = requireSender(event);
        requireAuthority();
        claims.requireAttention(owned, input.attentionId);
        const routeGeneration = owned.routeGeneration;
        const routeRequestSequence = owned.routeRequestSequence;
        const result = await service.call('getRecoveryComparison', input);
        requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
        if (result.attentionId !== input.attentionId) {
          throw new ServiceCallError('AI7_RECOVERY_BINDING_INVALID', '恢复待确认结果标识不一致。');
        }
        claims.claimAttentions(owned, [result.attentionId, ...priorWorkAttentionIds(result.otherPriorWork)]);
        return result;
      }),
  );
  ipcMain.handle(
    IPC_CHANNELS.viewRecoveryCandidate,
    (event, input: ServiceOperationMap['viewRecoveryCandidate']['input']) =>
      envelope(async () => {
        const owned = requireSender(event);
        requireAuthority();
        claims.requireAttention(owned, input.attentionId);
        const routeGeneration = owned.routeGeneration;
        const routeRequestSequence = owned.routeRequestSequence;
        const result = await service.call('viewRecoveryCandidate', input);
        requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
        if (result.attentionId !== input.attentionId) {
          throw new ServiceCallError('AI7_RECOVERY_BINDING_INVALID', '恢复候选结果标识不一致。');
        }
        return result;
      }),
  );

  ipcMain.handle(IPC_CHANNELS.deferRecovery, (event, input: ServiceOperationMap['deferRecovery']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        claims.requireAttention(owned, input.attentionId);
        const pendingImport = await service.call('getImportStartup', {});
        if (pendingImport.state === 'committed-recovered') {
          claims.claimCommit(owned, pendingImport.result.commitId);
        } else if (pendingImport.state !== 'none') {
          captureImportRecoveryTarget(owned, pendingImport.recovery);
        } else {
          claimPriorWorkAttentions(owned, await service.call('listPriorWork', {}));
        }
        const result = await service.call('deferRecovery', input);
        if (result.next.state === 'import') {
          if (result.next.startup.state === 'committed-recovered') {
            bindCommittedImport(owned, result.next.startup.result);
          } else {
            if (result.next.startup.state !== 'none') captureImportRecoveryTarget(owned, result.next.startup.recovery);
            leaveBookWorkbench(owned);
          }
        } else {
          claimPriorWorkAttentions(owned, result.next.priorWork);
          leaveBookWorkbench(owned);
        }
        return result;
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.restoreRecovery,
    (event, input: Omit<ServiceOperationMap['restoreRecovery']['input'], 'restorationId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          claims.requireAttention(owned, input.attentionId);
          const fingerprint = JSON.stringify(input);
          let bindings = owned.restorationBindings.get(input.attentionId);
          let binding = bindings?.get(fingerprint);
          if (!binding) {
            requireDesktop((bindings?.size ?? 0) < 16 && owned.restorationBindingCount < 64, 'AI7_RENDERER_BOUNDARY_INVALID');
            const comparison = await service.call('getRecoveryComparison', { attentionId: input.attentionId });
            requireDesktop(
              comparison.attentionId === input.attentionId &&
                comparison.attentionVersion === input.expectedAttentionVersion,
              'AI7_RECOVERY_BINDING_INVALID',
            );
            const selectionValid = input.selection.kind === 'journal' || input.selection.kind === 'checkpoint' ||
              (input.selection.kind === 'snapshot' &&
                comparison.snapshot.state === 'eligible' &&
                comparison.snapshot.candidate.snapshotId === input.selection.snapshotId);
            if (!selectionValid) {
              throw new ServiceCallError('RECOVERY_SNAPSHOT_INELIGIBLE', '所选恢复快照不属于当前恢复比较。');
            }
            const opened = await openBookWorkbench(owned, { kind: 'book', bookId: comparison.bookId });
            if (opened.target !== 'requesting-window') {
              throw new ServiceCallError(
                'BOOK_WORKBENCH_ALREADY_OPEN',
                '已显示这本图书现有的工作台；恢复未提交。',
              );
            }
            requireDesktop(opened.route.bookId === comparison.bookId, 'AI7_RECOVERY_BINDING_INVALID');
            if (!bindings) {
              requireDesktop(owned.restorationBindings.size < 32, 'AI7_RENDERER_BOUNDARY_INVALID');
              bindings = new Map();
              owned.restorationBindings.set(input.attentionId, bindings);
            }
            binding = {
              restorationId: randomUUID(),
              bookId: comparison.bookId,
              bookTitle: comparison.bookTitle,
              manuscriptId: comparison.manuscriptId,
              branchId: comparison.branchId,
            };
            bindings.set(fingerprint, binding);
            owned.restorationBindingCount += 1;
          } else {
            const opened = await openBookWorkbench(owned, { kind: 'book', bookId: binding.bookId });
            if (opened.target !== 'requesting-window') {
              throw new ServiceCallError(
                'BOOK_WORKBENCH_ALREADY_OPEN',
                '已显示这本图书现有的工作台；恢复未提交。',
              );
            }
            requireDesktop(opened.route.bookId === binding.bookId, 'AI7_RECOVERY_BINDING_INVALID');
          }
          const result = await service.call('restoreRecovery', { ...input, restorationId: binding.restorationId });
          requireDesktop(
            result.window.bookId === binding.bookId &&
              result.window.manuscriptId === binding.manuscriptId &&
              result.window.branchId === binding.branchId,
            'AI7_RECOVERY_BINDING_INVALID',
          );
          rememberManuscriptCapability(
            owned,
            result.window,
            { manuscriptId: binding.manuscriptId, branchId: binding.branchId },
            owned.routeGeneration,
          );
          claims.releaseAttention(owned, input.attentionId);
          return result;
        });
      }),
  );

  ipcMain.handle(IPC_CHANNELS.getImportStartup, (event) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        const result = await service.call('getImportStartup', {});
        if (result.state === 'committed-recovered') bindCommittedImport(owned, result.result);
        else {
          if (result.state !== 'none') captureImportRecoveryTarget(owned, result.recovery);
          leaveBookWorkbench(owned);
        }
        return result;
      });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.selectAndStageDocx, (event) =>
    envelope<PickerStageResult>(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        claims.requireNewDraftCapacity(owned);
        const selectedPath = await chooseDocx(owned);
        if (!selectedPath) return { status: 'cancelled' as const };
        const staged = await service.call('stageSelectedDocx', { selectionToken: randomUUID(), selectedPath });
        rememberImportDraft(owned, staged.draftId);
        return { status: 'staged' as const, staged };
      });
    }),
  );
  ipcMain.handle(IPC_CHANNELS.continueImportDraft, (event, input: ServiceOperationMap['continueImportDraft']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        requireImportDraft(owned, input.draftId);
        const result = await service.call('continueImportDraft', input);
        captureImportContinuation(owned, result, input.draftId);
        await reserveReimportContinuationTarget(owned, result);
        return result;
      });
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.reselectImportDraft,
    (event, input: { draftId: string; expectedDraftVersion: number }) =>
      envelope<PickerReselectResult>(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          requireImportDraft(owned, input.draftId);
          requireDesktop(
            input !== null &&
              typeof input === 'object' &&
              UUID_PATTERN.test(input.draftId) &&
              Number.isSafeInteger(input.expectedDraftVersion) &&
              input.expectedDraftVersion >= 1,
            'AI7_RENDERER_BOUNDARY_INVALID',
          );
          const selectedPath = await chooseDocx(owned);
          if (!selectedPath) return { status: 'cancelled' as const };
          const target = owned.importTargets.get(input.draftId);
          if (target) await reserveExistingImportTarget(owned, target);
          const continuation = await service.call('reselectImportDraft', {
            ...input,
            selectionToken: randomUUID(),
            selectedPath,
          });
          captureImportContinuation(owned, continuation, input.draftId);
          await reserveReimportContinuationTarget(owned, continuation);
          return { status: 'reselected' as const, continuation };
        });
      }),
  );
  ipcMain.handle(IPC_CHANNELS.abandonImportDraft, (event, input: ServiceOperationMap['abandonImportDraft']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        requireImportDraft(owned, input.draftId);
        const priorBinding = owned.commitBindings.get(input.draftId);
        const commitWasClaimed = priorBinding !== undefined && owned.importCommitIds.has(priorBinding.commitId);
        if (priorBinding !== undefined) claims.claimCommit(owned, priorBinding.commitId);
        let result: ServiceOperationMap['abandonImportDraft']['output'];
        try {
          result = await service.call('abandonImportDraft', input);
        } catch (error) {
          if (priorBinding !== undefined) {
            releaseNewCommitClaimAfterDeterministicFailure(owned, priorBinding.commitId, commitWasClaimed, error);
          }
          throw error;
        }
        owned.importTargets.delete(input.draftId);
        owned.importDraftIds.delete(input.draftId);
        claims.releaseDraft(owned, input.draftId);
        if (result.state === 'committed-recovered') {
          bindCommittedImport(owned, result.result, input.draftId);
          if (priorBinding !== undefined && priorBinding.commitId !== result.result.commitId) {
            claims.releaseCommit(owned, priorBinding.commitId);
          }
        } else {
          if (priorBinding !== undefined) claims.releaseCommit(owned, priorBinding.commitId);
          leaveBookWorkbench(owned);
        }
        owned.commitBindings.delete(input.draftId);
        return result;
      });
    }),
  );
  ipcMain.handle(IPC_CHANNELS.prepareNewBookReview, (event, input: ServiceOperationMap['prepareNewBookReview']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        requireImportDraft(owned, input.draftId);
        const result = await service.call('prepareNewBookReview', input);
        captureImportReviewTarget(owned, result);
        return result;
      });
    }),
  );
  ipcMain.handle(IPC_CHANNELS.commitNewBookImport, (event, input: CommitNewBookRendererInput) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        requireImportDraft(owned, input.draftId);
        const commit = bindImportCommit(owned, input);
        const target = await requireImportTarget(owned, input, 'manuscript-import');
        await reserveExistingImportTarget(owned, target);
        const commitWasClaimed = owned.importCommitIds.has(commit.commitId);
        claims.claimCommit(owned, commit.commitId);
        let result: ServiceOperationMap['commitNewBookImport']['output'];
        try {
          result = await service.call('commitNewBookImport', commit);
        } catch (error) {
          releaseNewCommitClaimAfterDeterministicFailure(owned, commit.commitId, commitWasClaimed, error);
          throw error;
        }
        requireDesktop(
          target.kind === 'new-book' || result.overview.book.bookId === target.bookId,
          'AI7_SERVICE_ROUTE_INVALID',
        );
        bindCommittedImport(owned, result, input.draftId);
        return result;
      });
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.prepareSourceImportReview,
    (event, input: ServiceOperationMap['prepareSourceImportReview']['input']) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          requireImportDraft(owned, input.draftId);
          const result = await service.call('prepareSourceImportReview', input);
          captureImportReviewTarget(owned, result);
          return result;
        });
      }),
  );
  ipcMain.handle(IPC_CHANNELS.commitSourceImport, (event, input: CommitSourceImportRendererInput) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        requireImportDraft(owned, input.draftId);
        const commit = bindImportCommit(owned, input);
        const target = await requireImportTarget(owned, input, 'source-import');
        await reserveExistingImportTarget(owned, target);
        const commitWasClaimed = owned.importCommitIds.has(commit.commitId);
        claims.claimCommit(owned, commit.commitId);
        let result: ServiceOperationMap['commitSourceImport']['output'];
        try {
          result = await service.call('commitSourceImport', commit);
        } catch (error) {
          releaseNewCommitClaimAfterDeterministicFailure(owned, commit.commitId, commitWasClaimed, error);
          throw error;
        }
        requireDesktop(
          (target.kind === 'new-book' &&
            (target.expectedBookId === undefined || result.overview.book.bookId === target.expectedBookId)) ||
            (target.kind === 'existing-book' && result.overview.book.bookId === target.bookId),
          'AI7_SERVICE_ROUTE_INVALID',
        );
        bindCommittedImport(owned, result, input.draftId);
        return result;
      });
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.prepareManuscriptReimport,
    (event, input: ServiceOperationMap['prepareManuscriptReimport']['input']) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          requireImportDraft(owned, input.draftId);
          const target: ImportTargetBinding = {
            kind: 'existing-book',
            mutation: 'manuscript-reimport',
            bookId: input.target.bookId,
          };
          await reserveExistingImportTarget(owned, target);
          const result = await service.call('prepareManuscriptReimport', input);
          owned.importTargets.set(input.draftId, target);
          rememberJobResources(owned, result, {
            operation: 'reimport',
            bookId: target.bookId,
            manuscriptId: null,
            branchId: null,
          });
          captureReimportJob(owned, result);
          return result;
        });
      }),
  );
  ipcMain.handle(
    IPC_CHANNELS.getReimportMappingPage,
    (event, input: ServiceOperationMap['getReimportMappingPage']['input']) =>
      envelope(async () => {
        const owned = requireSender(event);
        requireAuthority();
        requireReimportDraftBook(owned, input.draftId);
        const routeGeneration = owned.routeGeneration;
        const routeRequestSequence = owned.routeRequestSequence;
        const result = await service.call('getReimportMappingPage', input);
        requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
        if (result.draftId !== input.draftId || result.draftVersion !== input.expectedDraftVersion) {
          throw new ServiceCallError('AI7_IMPORT_DRAFT_CAPABILITY_INVALID', '稿件重新导入映射页标识不一致。');
        }
        return result;
      }),
  );
  ipcMain.handle(
    IPC_CHANNELS.getReimportIdentityCandidatePage,
    (event, input: ServiceOperationMap['getReimportIdentityCandidatePage']['input']) =>
      envelope(async () => {
        const owned = requireSender(event);
        requireAuthority();
        requireReimportDraftBook(owned, input.draftId);
        const routeGeneration = owned.routeGeneration;
        const routeRequestSequence = owned.routeRequestSequence;
        const result = await service.call('getReimportIdentityCandidatePage', input);
        requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
        if (
          result.draftId !== input.draftId ||
          result.draftVersion !== input.expectedDraftVersion ||
          result.mappingId !== input.mappingId
        ) {
          throw new ServiceCallError('AI7_IMPORT_DRAFT_CAPABILITY_INVALID', '稿件重新导入身份候选页标识不一致。');
        }
        return result;
      }),
  );
  ipcMain.handle(
    IPC_CHANNELS.getReimportLineageSourceVersionPage,
    (event, input: ServiceOperationMap['getReimportLineageSourceVersionPage']['input']) =>
      envelope(async () => {
        const owned = requireSender(event);
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        if (route.bookId !== input.bookId) {
          throw new ServiceCallError(
            'AI7_EDITOR_ROUTE_INVALID',
            '来源版本页不属于当前图书工作台；结果未读取。',
          );
        }
        const routeGeneration = owned.routeGeneration;
        const routeRequestSequence = owned.routeRequestSequence;
        const result = await service.call('getReimportLineageSourceVersionPage', input);
        requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
        if (result.bookId !== input.bookId) {
          throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '来源版本页的图书标识不一致。');
        }
        return result;
      }),
  );
  ipcMain.handle(
    IPC_CHANNELS.acceptReimportDegradation,
    (event, input: ServiceOperationMap['acceptReimportDegradation']['input']) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const target = await requireImportTarget(owned, input, 'manuscript-reimport');
          requireDesktop(target.kind === 'existing-book', 'AI7_SERVICE_ROUTE_INVALID');
          await reserveExistingImportTarget(owned, target);
          const result = await service.call('acceptReimportDegradation', input);
          captureImportReviewTarget(owned, result);
          return result;
        });
      }),
  );
  ipcMain.handle(
    IPC_CHANNELS.resolveReimportMapping,
    (event, input: ServiceOperationMap['resolveReimportMapping']['input']) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const target = await requireImportTarget(owned, input, 'manuscript-reimport');
          requireDesktop(target.kind === 'existing-book', 'AI7_SERVICE_ROUTE_INVALID');
          await reserveExistingImportTarget(owned, target);
          const result = await service.call('resolveReimportMapping', input);
          rememberJobResources(owned, result, {
            operation: 'reimport',
            bookId: target.bookId,
            manuscriptId: null,
            branchId: null,
          });
          captureReimportJob(owned, result);
          return result;
        });
      }),
  );
  ipcMain.handle(IPC_CHANNELS.commitManuscriptReimport, (event, input: CommitManuscriptReimportRendererInput) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        const replayReservation = await reserveAcknowledgedManuscriptReimportReplay(owned, input);
        const commit = bindImportCommit(owned, input);
        const target = await requireImportTarget(owned, input, 'manuscript-reimport');
        requireDesktop(target.kind === 'existing-book', 'AI7_SERVICE_ROUTE_INVALID');
        await reserveExistingImportTarget(owned, target);
        const commitWasClaimed = replayReservation?.commitWasClaimed ?? owned.importCommitIds.has(commit.commitId);
        claims.claimCommit(owned, commit.commitId);
        let result: ServiceOperationMap['commitManuscriptReimport']['output'];
        try {
          result = await service.call('commitManuscriptReimport', commit);
        } catch (error) {
          const deterministic = releaseNewCommitClaimAfterDeterministicFailure(
            owned,
            commit.commitId,
            commitWasClaimed,
            error,
          );
          if (deterministic && replayReservation !== null) {
            rollbackAcknowledgedManuscriptReimportReplay(owned, input, replayReservation);
          }
          throw error;
        }
        rememberJobResources(owned, result, {
          operation: 'reimport',
          bookId: target.bookId,
          manuscriptId: null,
          branchId: null,
        });
        captureReimportJob(owned, result);
        return result;
      });
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.acknowledgeImportCompletion,
    (event, input: ServiceOperationMap['acknowledgeImportCompletion']['input']) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          claims.requireCommit(owned, input.commitId);
          const result = await service.call('acknowledgeImportCompletion', input);
          owned.importCommitIds.delete(input.commitId);
          claims.releaseCommit(owned, input.commitId);
          for (const binding of owned.commitBindings.values()) {
            if (binding.commitId !== input.commitId) claims.releaseCommit(owned, binding.commitId);
          }
          owned.commitBindings.clear();
          owned.importTargets.clear();
          for (const draftId of owned.importDraftIds) claims.releaseDraft(owned, draftId);
          owned.importDraftIds.clear();
          return result;
        });
      }),
  );
  ipcMain.handle(IPC_CHANNELS.getManuscriptWindow, (event, input: ServiceOperationMap['getManuscriptWindow']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      requireCurrentBookRoute(owned);
      const routeGeneration = owned.routeGeneration;
      const routeRequestSequence = owned.routeRequestSequence;
      const result = await service.call('getManuscriptWindow', input);
      rememberManuscriptCapability(owned, result, input, routeGeneration, routeRequestSequence);
      return result;
    }),
  );
  ipcMain.handle(IPC_CHANNELS.getManuscriptWindowAt, (event, input: ServiceOperationMap['getManuscriptWindowAt']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      requireCurrentBookRoute(owned);
      const routeGeneration = owned.routeGeneration;
      const routeRequestSequence = owned.routeRequestSequence;
      const result = await service.call('getManuscriptWindowAt', input);
      rememberManuscriptCapability(owned, result, input, routeGeneration, routeRequestSequence);
      return result;
    }),
  );
  ipcMain.handle(IPC_CHANNELS.getOutline, (event, input: ServiceOperationMap['getOutline']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      const capability = requireManuscriptCapability(owned, input);
      const routeGeneration = owned.routeGeneration;
      const routeRequestSequence = owned.routeRequestSequence;
      const result = await service.call('getOutline', input);
      requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
      requireResourceIdentity(capability, result);
      return result;
    }),
  );
  ipcMain.handle(IPC_CHANNELS.flushJournalEdit, (event, input: ServiceOperationMap['flushJournalEdit']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        requireManuscriptCapability(owned, input);
        const result = await service.call('flushJournalEdit', input);
        if (result.branchId !== input.branchId) {
          throw new ServiceCallError('AI7_EDITOR_CAPABILITY_INVALID', '编辑日志结果不属于当前稿件分支。');
        }
        rememberManuscriptCapability(owned, result.window, input, owned.routeGeneration);
        return result;
      });
    }),
  );
  ipcMain.handle(IPC_CHANNELS.openBookWorkbench, (event, input: BookWorkbenchRoute) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      return requestBookWorkbench(owned, input);
    }),
  );
  ipcMain.handle(IPC_CHANNELS.getBookWorkbenchRoute, (event) =>
    envelope(() => requireSender(event).route),
  );
  ipcMain.handle(IPC_CHANNELS.leaveBookWorkbench, (event) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        leaveBookWorkbench(owned);
        return { state: 'library' as const };
      });
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.getHistoricalRevision,
    (event, input: ServiceOperationMap['getHistoricalRevision']['input']) =>
      envelope(async () => {
        const owned = requireSender(event);
        requireAuthority();
        const route = owned.route;
        const routeGeneration = owned.routeGeneration;
        const routeRequestSequence = owned.routeRequestSequence;
        requireDesktop(
          owned.bookId !== null &&
            route?.kind === 'revision' &&
            route.revisionId === input.revisionId,
          'AI7_RENDERER_BOUNDARY_INVALID',
        );
        const projection = await service.call('getHistoricalRevision', input);
        requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
        if (!(owned.route?.kind === 'revision' && owned.route.revisionId === input.revisionId)) {
          throw new ServiceCallError(
            'AI7_SERVICE_ROUTE_STALE',
            '图书工作台路由已经更新；较早的本地结果未显示。',
          );
        }
        requireDesktop(
          projection.revisionId === input.revisionId &&
            projection.bookId === route.bookId &&
            projection.bookId === owned.bookId &&
            projection.manuscriptId === route.manuscriptId &&
            projection.branchId === route.branchId,
          'AI7_SERVICE_ROUTE_INVALID',
        );
        return projection;
      }),
  );
  ipcMain.handle(IPC_CHANNELS.getProductDataLocation, (event) =>
    envelope(async () => {
      requireSender(event);
      return getProductDataLocation();
    }),
  );
  ipcMain.handle(IPC_CHANNELS.revealProductDataLocation, (event) =>
    envelope(() => {
      requireSender(event);
      return revealProductDataLocation();
    }),
  );
  ipcMain.handle(IPC_CHANNELS.getModelServiceSettings, (event) =>
    envelope(async () => {
      requireSender(event);
      requireAuthority();
      return getModelServiceSettings();
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.saveModelServiceCredential,
    (event, input: { connectionName: string; secret: string }) =>
      envelope(async () => {
        requireSender(event);
        requireAuthority();
        return serializeEffect(() => saveModelServiceCredential(input));
      }),
  );
  ipcMain.handle(IPC_CHANNELS.removeModelServiceCredential, (event) =>
    envelope(async () => {
      requireSender(event);
      requireAuthority();
      return serializeEffect(removeModelServiceCredential);
    }),
  );
  ipcMain.handle(IPC_CHANNELS.commitBookCreation, (event, input: ServiceOperationMap['commitBookCreation']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        const result = await service.call('commitBookCreation', input);
        bindPresentedBook(owned, result.overview.book.bookId, result.overview.book.title);
        return result;
      });
    }),
  );
  ipcMain.handle(IPC_CHANNELS.getBookOverview, (event, input: ServiceOperationMap['getBookOverview']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      const serializeBinding = owned.route === null;
      const operation = async (): Promise<ServiceOperationMap['getBookOverview']['output']> => {
        requireAuthority();
        const route = owned.route;
        const routeGeneration = owned.routeGeneration;
        const routeRequestSequence = owned.routeRequestSequence;
        requireDesktop(
          route === null || (route.kind === 'book' && route.bookId === input.bookId),
          'AI7_RENDERER_BOUNDARY_INVALID',
        );
        const result = await service.call('getBookOverview', input);
        if (serializeBinding) requireCurrentRouteGeneration(owned, routeGeneration);
        else requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
        requireDesktop(result.book.bookId === input.bookId, 'AI7_SERVICE_ROUTE_INVALID');
        if (route === null) {
          if (owned.route !== null || owned.bookId !== null) {
            throw new ServiceCallError(
              'AI7_SERVICE_ROUTE_STALE',
              '图书工作台路由已经更新；较早的本地结果未显示。',
            );
          }
          bindPresentedBook(owned, result.book.bookId, result.book.title);
        } else if (!(owned.route?.kind === 'book' && owned.route.bookId === route.bookId && owned.bookId === route.bookId)) {
          throw new ServiceCallError(
            'AI7_SERVICE_ROUTE_STALE',
            '图书工作台路由已经更新；较早的本地结果未显示。',
          );
        }
        return result;
      };
      return serializeBinding ? serializeEffect(operation) : operation();
    }),
  );
  ipcMain.handle(IPC_CHANNELS.startSearch, (event, input: ServiceOperationMap['startSearch']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        const manuscript = requireManuscriptCapability(owned, input);
        const result = await service.call('startSearch', input);
        rememberJobResources(owned, result, resourceSeed(manuscript, 'search'));
        return result;
      });
    }),
  );
  ipcMain.handle(IPC_CHANNELS.pollServiceJob, (event, input: ServiceOperationMap['pollServiceJob']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        const capability = requireEditorResource(owned, 'job', input.jobId);
        const result = await service.call('pollServiceJob', input);
        if (result.jobId !== input.jobId) {
          throw new ServiceCallError('AI7_EDITOR_CAPABILITY_INVALID', '后台编辑操作结果标识不一致。');
        }
        rememberJobResources(owned, result, resourceSeed(capability));
        captureReimportJob(owned, result);
        return result;
      });
    }),
  );
  ipcMain.handle(IPC_CHANNELS.cancelServiceJob, (event, input: ServiceOperationMap['cancelServiceJob']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        const capability = requireEditorResource(owned, 'job', input.jobId);
        const result = await service.call('cancelServiceJob', input);
        if (result.jobId !== input.jobId) {
          throw new ServiceCallError('AI7_EDITOR_CAPABILITY_INVALID', '后台编辑操作结果标识不一致。');
        }
        rememberJobResources(owned, result, resourceSeed(capability));
        captureReimportJob(owned, result);
        return result;
      });
    }),
  );
  ipcMain.handle(IPC_CHANNELS.getSearchResults, (event, input: ServiceOperationMap['getSearchResults']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      const capability = requireEditorResource(owned, 'search', input.searchId);
      const routeGeneration = owned.routeGeneration;
      const routeRequestSequence = owned.routeRequestSequence;
      const result = await service.call('getSearchResults', input);
      requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
      if (result.searchId !== input.searchId) {
        throw new ServiceCallError('AI7_EDITOR_CAPABILITY_INVALID', '搜索结果标识不一致。');
      }
      requireResourceIdentity(capability, result);
      return result;
    }),
  );
  ipcMain.handle(IPC_CHANNELS.prepareReplacement, (event, input: ServiceOperationMap['prepareReplacement']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        const capability = requireEditorResource(owned, 'search', input.searchId);
        const result = await service.call('prepareReplacement', input);
        if (result.searchId !== input.searchId) {
          throw new ServiceCallError('AI7_EDITOR_CAPABILITY_INVALID', '替换预览的搜索标识不一致。');
        }
        requireResourceIdentity(capability, result);
        rememberEditorResource(owned, 'preview', result.previewId, {
          ...resourceSeed(capability, 'replacement'),
          manuscriptId: result.manuscriptId,
          branchId: result.branchId,
        });
        return result;
      });
    }),
  );
  ipcMain.handle(IPC_CHANNELS.freezeReplacement, (event, input: ServiceOperationMap['freezeReplacement']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        const capability = requireEditorResource(owned, 'preview', input.previewId);
        const result = await service.call('freezeReplacement', input);
        if (result.previewId !== input.previewId) {
          throw new ServiceCallError('AI7_EDITOR_CAPABILITY_INVALID', '冻结替换预览标识不一致。');
        }
        requireResourceIdentity(capability, result);
        rememberEditorResource(owned, 'preview', result.previewId, {
          ...resourceSeed(capability, 'replacement'),
          manuscriptId: result.manuscriptId,
          branchId: result.branchId,
        });
        return result;
      });
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.dismissReplacementPreview,
    (event, input: ServiceOperationMap['dismissReplacementPreview']['input']) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          requireEditorResource(owned, 'preview', input.previewId);
          const result = await service.call('dismissReplacementPreview', input);
          if (result.previewId !== input.previewId) {
            throw new ServiceCallError('AI7_EDITOR_CAPABILITY_INVALID', '取消替换预览标识不一致。');
          }
          owned.editorResourceCapabilities.delete(resourceCapabilityKey('preview', input.previewId));
          return result;
        });
      }),
  );
  ipcMain.handle(
    IPC_CHANNELS.startReplacementCommit,
    (event, input: ServiceOperationMap['startReplacementCommit']['input']) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const capability = requireEditorResource(owned, 'preview', input.previewId);
          const result = await service.call('startReplacementCommit', input);
          rememberJobResources(owned, result, resourceSeed(capability, 'replacement'));
          return result;
        });
      }),
  );
  ipcMain.handle(IPC_CHANNELS.commitReplacement, (event, input: ServiceOperationMap['commitReplacement']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        const capability = requireEditorResource(owned, 'preview', input.previewId);
        const result = await service.call('commitReplacement', input);
        if (result.previewId !== input.previewId || capability.branchId !== result.branchId) {
          throw new ServiceCallError('AI7_EDITOR_CAPABILITY_INVALID', '替换提交结果不属于当前稿件分支。');
        }
        return result;
      });
    }),
  );
  ipcMain.handle(IPC_CHANNELS.saveMilestone, (event, input: ServiceOperationMap['saveMilestone']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        const capability = requireManuscriptCapability(owned, input);
        const result = await service.call('saveMilestone', input);
        requireResourceIdentity(capability, result);
        return result;
      });
    }),
  );
  ipcMain.handle(IPC_CHANNELS.undoManuscript, (event, input: ServiceOperationMap['undoManuscript']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        requireManuscriptCapability(owned, input);
        const result = await service.call('undoManuscript', input);
        if (result.branchId !== input.branchId) {
          throw new ServiceCallError('AI7_EDITOR_CAPABILITY_INVALID', '撤销结果不属于当前稿件分支。');
        }
        return result;
      });
    }),
  );
  ipcMain.handle(IPC_CHANNELS.redoManuscript, (event, input: ServiceOperationMap['redoManuscript']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        requireManuscriptCapability(owned, input);
        const result = await service.call('redoManuscript', input);
        if (result.branchId !== input.branchId) {
          throw new ServiceCallError('AI7_EDITOR_CAPABILITY_INVALID', '重做结果不属于当前稿件分支。');
        }
        return result;
      });
    }),
  );
  const serviceHandlers = [
    ['prepareBookCreation', IPC_CHANNELS.prepareBookCreation],
    ['listBooks', IPC_CHANNELS.listBooks],
  ] as const;
  for (const [operation, channel] of serviceHandlers) {
    ipcMain.handle(channel, (event, input: ServiceOperationMap[typeof operation]['input']) =>
      envelope(async () => {
        requireSender(event);
        requireAuthority();
        return service.call(operation, input);
      }),
    );
  }

  ipcMain.handle(IPC_CHANNELS.listPriorWork, (event) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        const result = await service.call('listPriorWork', {});
        claimPriorWorkAttentions(owned, result);
        return result;
      });
    }),
  );

  return () => {
    for (const channel of Object.values(IPC_CHANNELS)) ipcMain.removeHandler(channel);
    ipcMain.removeListener(MAIN_EVENTS.closeRiskChanged, closeRiskListener);
  };
}

export async function runApplication(): Promise<void> {
  let startupLocation = 'runtime';
  let service: ServiceClient | undefined;
  let serviceInterrupted = false;
  let productReady = false;
  let quitting = false;
  let quitReady = false;
  let shutdown: Promise<void> | undefined;
  let unregisterHandlers: (() => void) | undefined;
  let launcherLease: NodeJS.Timeout | undefined;
  const ownedWindows = new Map<number, OwnedRendererWindow>();
  const bookWindows = new Map<string, OwnedRendererWindow>();
  const draftOwners = new Map<string, OwnedRendererWindow>();
  const attentionOwners = new Map<string, OwnedRendererWindow>();
  const commitOwners = new Map<string, OwnedRendererWindow>();
  let mainEffectQueue: Promise<void> = Promise.resolve();
  const serializeEffect = <Result>(operation: () => Promise<Result>): Promise<Result> => {
    const result = mainEffectQueue.then(operation, operation);
    mainEffectQueue = result.then(() => undefined, () => undefined);
    return result;
  };
  const claimAuthority = (
    owners: Map<string, OwnedRendererWindow>,
    owned: OwnedRendererWindow,
    id: string,
    code: string,
    label: string,
  ): void => {
    if (owned.window.isDestroyed()) throw new ServiceCallError(code, `${label}所属窗口已经关闭。`);
    const existing = owners.get(id);
    if (existing !== undefined && existing !== owned) {
      throw new ServiceCallError(code, `${label}已由另一图书工作台窗口持有。`);
    }
    if (existing === undefined && owners.size >= 128) {
      throw new ServiceCallError(code, `${label}的应用级能力已达到有界上限。`);
    }
    owners.set(id, owned);
  };
  const requireAuthorityOwner = (
    owners: Map<string, OwnedRendererWindow>,
    owned: OwnedRendererWindow,
    id: string,
    code: string,
    label: string,
  ): void => {
    if (owners.get(id) !== owned) throw new ServiceCallError(code, `当前窗口不持有${label}。`);
  };
  const releaseAuthority = (
    owners: Map<string, OwnedRendererWindow>,
    owned: OwnedRendererWindow,
    id: string,
  ): void => {
    if (owners.get(id) === owned) owners.delete(id);
  };
  const claims: ApplicationAuthorityClaims = {
    requireNewDraftCapacity: (owned) => {
      if (owned.window.isDestroyed()) {
        throw new ServiceCallError('AI7_IMPORT_DRAFT_CAPABILITY_INVALID', '导入草稿所属窗口已经关闭。');
      }
      if (owned.importDraftIds.size >= 32 || draftOwners.size >= 128) {
        throw new ServiceCallError('AI7_IMPORT_DRAFT_CAPABILITY_INVALID', '导入草稿能力已达到有界上限。');
      }
    },
    claimImportState: (owned, draftId, commitId) => {
      if (owned.window.isDestroyed()) {
        throw new ServiceCallError('AI7_IMPORT_DRAFT_CAPABILITY_INVALID', '导入状态所属窗口已经关闭。');
      }
      if (!UUID_PATTERN.test(draftId) || (commitId !== null && !UUID_PATTERN.test(commitId))) {
        throw new ServiceCallError('AI7_IMPORT_DRAFT_CAPABILITY_INVALID', '导入状态标识无效。');
      }
      const draftOwner = draftOwners.get(draftId);
      if (draftOwner !== undefined && draftOwner !== owned) {
        throw new ServiceCallError('AI7_IMPORT_DRAFT_CAPABILITY_INVALID', '导入草稿已由另一图书工作台窗口持有。');
      }
      const commitOwner = commitId === null ? undefined : commitOwners.get(commitId);
      if (commitOwner !== undefined && commitOwner !== owned) {
        throw new ServiceCallError('AI7_IMPORT_COMMIT_CAPABILITY_INVALID', '导入完成状态已由另一图书工作台窗口持有。');
      }
      if (!owned.importDraftIds.has(draftId) && owned.importDraftIds.size >= 32 ||
          draftOwner === undefined && draftOwners.size >= 128) {
        throw new ServiceCallError('AI7_IMPORT_DRAFT_CAPABILITY_INVALID', '导入草稿能力已达到有界上限。');
      }
      if (commitId !== null && (
        !owned.importCommitIds.has(commitId) && owned.importCommitIds.size >= 64 ||
        commitOwner === undefined && commitOwners.size >= 128
      )) {
        throw new ServiceCallError('AI7_IMPORT_COMMIT_CAPABILITY_INVALID', '导入完成状态能力已达到有界上限。');
      }
      draftOwners.set(draftId, owned);
      owned.importDraftIds.add(draftId);
      if (commitId !== null) {
        commitOwners.set(commitId, owned);
        owned.importCommitIds.add(commitId);
      }
    },
    requireDraft: (owned, draftId) =>
      requireAuthorityOwner(draftOwners, owned, draftId, 'AI7_IMPORT_DRAFT_CAPABILITY_INVALID', '这个导入草稿能力'),
    releaseDraft: (owned, draftId) => {
      releaseAuthority(draftOwners, owned, draftId);
      owned.importDraftIds.delete(draftId);
    },
    claimAttentions: (owned, attentionIds) => {
      const uniqueAttentionIds = [...new Set(attentionIds)];
      if (owned.window.isDestroyed()) {
        throw new ServiceCallError('AI7_RECOVERY_BINDING_INVALID', '恢复待确认状态所属窗口已经关闭。');
      }
      if (uniqueAttentionIds.some((attentionId) => !UUID_PATTERN.test(attentionId))) {
        throw new ServiceCallError('AI7_RECOVERY_BINDING_INVALID', '恢复待确认状态标识无效。');
      }
      const newOwnedCount = uniqueAttentionIds.filter((attentionId) => !owned.recoveryAttentionIds.has(attentionId)).length;
      if (owned.recoveryAttentionIds.size + newOwnedCount > 32) {
        throw new ServiceCallError('AI7_RECOVERY_BINDING_INVALID', '当前窗口的恢复待确认能力已达到有界上限。');
      }
      for (const attentionId of uniqueAttentionIds) {
        const existing = attentionOwners.get(attentionId);
        if (existing !== undefined && existing !== owned) {
          throw new ServiceCallError('AI7_RECOVERY_BINDING_INVALID', '恢复待确认状态已由另一图书工作台窗口持有。');
        }
      }
      const newApplicationCount = uniqueAttentionIds.filter((attentionId) => !attentionOwners.has(attentionId)).length;
      if (attentionOwners.size + newApplicationCount > 128) {
        throw new ServiceCallError('AI7_RECOVERY_BINDING_INVALID', '恢复待确认状态的应用级能力已达到有界上限。');
      }
      for (const attentionId of uniqueAttentionIds) {
        attentionOwners.set(attentionId, owned);
        owned.recoveryAttentionIds.add(attentionId);
      }
    },
    requireAttention: (owned, attentionId) =>
      requireAuthorityOwner(attentionOwners, owned, attentionId, 'AI7_RECOVERY_BINDING_INVALID', '这个恢复待确认能力'),
    releaseAttention: (owned, attentionId) => {
      releaseAuthority(attentionOwners, owned, attentionId);
      owned.recoveryAttentionIds.delete(attentionId);
    },
    claimCommit: (owned, commitId) => {
      if (!owned.importCommitIds.has(commitId) && owned.importCommitIds.size >= 64) {
        throw new ServiceCallError('AI7_IMPORT_COMMIT_CAPABILITY_INVALID', '当前窗口的导入完成能力已达到有界上限。');
      }
      claimAuthority(commitOwners, owned, commitId, 'AI7_IMPORT_COMMIT_CAPABILITY_INVALID', '导入完成状态');
      owned.importCommitIds.add(commitId);
    },
    requireCommit: (owned, commitId) =>
      requireAuthorityOwner(commitOwners, owned, commitId, 'AI7_IMPORT_COMMIT_CAPABILITY_INVALID', '这个导入完成能力'),
    releaseCommit: (owned, commitId) => {
      releaseAuthority(commitOwners, owned, commitId);
      owned.importCommitIds.delete(commitId);
    },
  };
  const releaseOwnedClaims = (owned: OwnedRendererWindow): void => {
    for (const draftId of owned.importDraftIds) claims.releaseDraft(owned, draftId);
    for (const attentionId of owned.recoveryAttentionIds) claims.releaseAttention(owned, attentionId);
    for (const commitId of owned.importCommitIds) claims.releaseCommit(owned, commitId);
  };
  const stop = (): Promise<void> =>
    (shutdown ??= (async () => {
      if (launcherLease) clearInterval(launcherLease);
      launcherLease = undefined;
      unregisterHandlers?.();
      unregisterHandlers = undefined;
      await service?.stop();
      quitReady = true;
    })());
  const terminate = (): void => {
    if (quitting) return;
    quitting = true;
    for (const owned of ownedWindows.values()) owned.window.destroy();
    void stop().then(
      () => app.exit(1),
      () => app.exit(1),
    );
  };
  const beforeQuit = (event: ElectronEvent): void => {
    if (quitReady) return;
    event.preventDefault();
    const riskyWindows = [...ownedWindows.values()].filter(
      (owned) => owned.closeRisk && !owned.window.isDestroyed(),
    );
    if (!quitting && riskyWindows.length > 0) {
      for (const owned of riskyWindows) owned.window.webContents.send(MAIN_EVENTS.closeBlocked);
      return;
    }
    if (quitting) return;
    quitting = true;
    void stop().then(() => app.quit(), () => app.exit(1));
  };
  const allWindowsClosed = (): void => app.quit();

  try {
    validateRuntime();
    startupLocation = 'arguments';
    const entryIndex = process.argv.findIndex((value) => resolve(value) === resolve(__filename));
    requireDesktop(entryIndex > 0);
    const launch = parseArguments(process.argv.slice(entryIndex + 1));
    requireDesktop(processIsAlive(launch.launcherPid));
    launcherLease = setInterval(() => {
      if (process.ppid !== launch.launcherPid || !processIsAlive(launch.launcherPid)) terminate();
    }, 1_000);
    launcherLease.unref();
    app.enableSandbox();
    startupLocation = 'data-root';
    const codeRoot = resolve(__dirname, '..', '..');
    const dataRoot = await createCanonicalExternalDataRoot(launch.dataRoot, codeRoot);
    startupLocation = 'shell-root';
    const shellRoot = await ensureCanonicalDataDirectory(dataRoot, 'shell');
    const earlyUserDataSwitch = app.commandLine.getSwitchValue('user-data-dir');
    requireDesktop(isAbsolute(earlyUserDataSwitch));
    await requireSameCanonicalDataDirectory(shellRoot, earlyUserDataSwitch, app.getPath('userData'));
    app.setPath('userData', shellRoot);
    await requireSameCanonicalDataDirectory(shellRoot, app.getPath('userData'));
    startupLocation = 'single-instance';
    if (!app.requestSingleInstanceLock()) {
      await stop();
      app.exit(0);
      return;
    }
    startupLocation = 'electron-ready';
    await app.whenReady();
    Menu.setApplicationMenu(null);

    const productSession = session.defaultSession;
    installChromiumDenial(productSession);
    startupLocation = 'service-ready';
    const serviceEntry = resolve(__dirname, '..', 'service', 'index.mjs');
    service = await ServiceClient.start(
      process.execPath, serviceEntry, dataRoot, launch.importControl, launch.recoveryControl,
    );
    service.onUnexpectedExit(() => {
      serviceInterrupted = true;
      if (!productReady) {
        terminate();
      } else {
        for (const owned of ownedWindows.values()) {
          if (!owned.window.isDestroyed()) owned.window.webContents.send(MAIN_EVENTS.serviceInterrupted);
        }
      }
    });
    requireDesktop(!serviceInterrupted);
    app.on('before-quit', beforeQuit);
    app.on('window-all-closed', allWindowsClosed);

    const getOwnedWindow = (event: IpcMainInvokeEvent | IpcMainEvent): OwnedRendererWindow => {
      const owned = ownedWindows.get(event.sender.id);
      requireDesktop(owned !== undefined, 'AI7_RENDERER_BOUNDARY_INVALID');
      return owned;
    };
    const focusOwnedWindow = (owned: OwnedRendererWindow): void => {
      requireDesktop(!owned.window.isDestroyed(), 'AI7_WORKBENCH_WINDOW_INVALID');
      if (owned.window.isMinimized()) owned.window.restore();
      if (!owned.window.isVisible()) owned.window.show();
      owned.window.focus();
    };
    const assignRoute = (owned: OwnedRendererWindow, route: ResolvedBookWorkbenchRoute): void => {
      requireDesktop(
        owned.bookId === null || owned.bookId === route.bookId,
        'AI7_WORKBENCH_BOOK_CONFLICT',
      );
      owned.manuscriptCapabilities.clear();
      owned.editorResourceCapabilities.clear();
      owned.bookId = route.bookId;
      owned.route = route;
      owned.routeGeneration += 1;
      bookWindows.set(route.bookId, owned);
    };
    const createOwnedWindow = async (
      route: ResolvedBookWorkbenchRoute | null,
      injectedPickerPath: string | undefined,
      revealAndFocus: boolean,
    ): Promise<OwnedRendererWindow> => {
      const window = new BrowserWindow({
        width: 1180,
        height: 820,
        minWidth: 920,
        minHeight: 680,
        show: false,
        title: 'AI7 编辑工作台',
        backgroundColor: '#f3efe5',
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          devTools: false,
          session: productSession,
          preload: resolve(__dirname, 'preload.cjs'),
        },
      });
      const owned: OwnedRendererWindow = {
        window,
        bookId: null,
        route: null,
        routeGeneration: 0,
        routeRequestSequence: 0,
        closeRisk: false,
        injectedPickerPath,
        commitBindings: new Map(),
        importTargets: new Map(),
        importDraftIds: new Set(),
        recoveryAttentionIds: new Set(),
        importCommitIds: new Set(),
        manuscriptCapabilities: new Map(),
        editorResourceCapabilities: new Map(),
        restorationBindings: new Map(),
        restorationBindingCount: 0,
      };
      ownedWindows.set(window.webContents.id, owned);
      if (route) {
        requireDesktop(!bookWindows.has(route.bookId), 'AI7_WORKBENCH_DUPLICATE_BOOK');
        assignRoute(owned, route);
      }
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (event) => event.preventDefault());
      window.webContents.on('will-attach-webview', (event) => event.preventDefault());
      window.webContents.on('render-process-gone', terminate);
      window.on('close', (event: ElectronEvent) => {
        if (!quitting && owned.closeRisk) {
          event.preventDefault();
          window.webContents.send(MAIN_EVENTS.closeBlocked);
        }
      });
      window.on('closed', () => {
        releaseOwnedClaims(owned);
        ownedWindows.delete(window.webContents.id);
        if (owned.bookId !== null && bookWindows.get(owned.bookId) === owned) bookWindows.delete(owned.bookId);
      });
      const firstPaint = new Promise<void>((resolvePaint, reject) => {
        const timeout = setTimeout(() => reject(new Error('AI7_RENDERER_FIRST_PAINT_TIMEOUT')), 30_000);
        timeout.unref();
        window.once('ready-to-show', () => {
          clearTimeout(timeout);
          resolvePaint();
        });
      });
      await Promise.all([window.loadFile(resolve(__dirname, '..', 'renderer', 'index.html')), firstPaint]);
      if (productReady) window.webContents.send(MAIN_EVENTS.productReady);
      if (revealAndFocus) focusOwnedWindow(owned);
      return owned;
    };
    let routeQueue: Promise<void> = Promise.resolve();
    const serializeRoute = <Result>(operation: () => Promise<Result>): Promise<Result> => {
      const result = routeQueue.then(operation, operation);
      routeQueue = result.then(() => undefined, () => undefined);
      return result;
    };
    const applyBookWorkbench = (
      requester: OwnedRendererWindow,
      route: BookWorkbenchRoute,
      requestSequence: number | null,
    ): Promise<BookWorkbenchOpenProjection> => {
      return serializeRoute(async () => {
      const resolved = await service!.call('resolveBookWorkbenchRoute', route);
      if (requestSequence !== null && requester.routeRequestSequence !== requestSequence) {
        throw new ServiceCallError(
          'AI7_SERVICE_ROUTE_STALE',
          '图书工作台路由已经更新；较早的本地结果未显示。',
        );
      }
      const existing = bookWindows.get(resolved.bookId);
      if (existing && !existing.window.isDestroyed()) {
        if (existing.closeRisk) {
          throw new ServiceCallError(
            'AI7_WORKBENCH_CLOSE_RISK',
            '未切换、未聚焦这本图书的工作台；目标窗口仍有未确认的本地编辑，请先完成或处理这些编辑。',
          );
        }
        assignRoute(existing, resolved);
        focusOwnedWindow(existing);
        if (existing === requester) return { route: resolved, target: 'requesting-window' };
        existing.window.webContents.send(MAIN_EVENTS.bookWorkbenchRouteChanged);
        return { route: resolved, target: 'existing-window' };
      }
      if (existing) bookWindows.delete(resolved.bookId);
      if (requester.bookId === null) {
        assignRoute(requester, resolved);
        focusOwnedWindow(requester);
        return { route: resolved, target: 'requesting-window' };
      }
      await createOwnedWindow(resolved, undefined, true);
      return { route: resolved, target: 'new-window' };
      });
    };
    const openBookWorkbench = (
      requester: OwnedRendererWindow,
      route: BookWorkbenchRoute,
    ): Promise<BookWorkbenchOpenProjection> => applyBookWorkbench(requester, route, null);
    const requestBookWorkbench = (
      requester: OwnedRendererWindow,
      route: BookWorkbenchRoute,
    ): Promise<BookWorkbenchOpenProjection> => {
      const requestSequence = requester.routeRequestSequence + 1;
      requester.routeRequestSequence = requestSequence;
      return serializeEffect(() => applyBookWorkbench(requester, route, requestSequence));
    };
    const bindPresentedBook = (owned: OwnedRendererWindow, bookId: string, bookTitle: string): void => {
      requireDesktop(UUID_PATTERN.test(bookId) && bookTitle.length > 0, 'AI7_WORKBENCH_ROUTE_INVALID');
      const existing = bookWindows.get(bookId);
      requireDesktop(existing === undefined || existing === owned, 'AI7_WORKBENCH_DUPLICATE_BOOK');
      assignRoute(owned, { kind: 'book', bookId, bookTitle });
    };
    const leaveBookWorkbench = (owned: OwnedRendererWindow): void => {
      if (owned.bookId !== null && bookWindows.get(owned.bookId) === owned) bookWindows.delete(owned.bookId);
      owned.manuscriptCapabilities.clear();
      owned.editorResourceCapabilities.clear();
      owned.bookId = null;
      owned.route = null;
      owned.routeGeneration += 1;
    };
    const getProductDataLocation = async (): Promise<ProductDataLocationProjection> => {
      const footprint = await inspectBoundedDataFootprint(dataRoot);
      const measured = `${footprint.measuredBytes.toLocaleString('zh-CN')} 字节 · ${footprint.measuredEntries} 项`;
      const windows = process.platform === 'win32';
      return {
        platform: windows ? 'windows' : 'macos',
        platformLabel: windows ? 'Windows' : 'macOS',
        runtimeForm: 'source-checkout',
        runtimeFormLabel: '源码检出运行',
        locationLabel: '本机产品数据位置',
        canonicalRoot: dataRoot,
        footprint: {
          kind: 'bounded-measurement',
          ...footprint,
          label: footprint.complete ? `本机占用：${measured}` : `本机占用：至少 ${measured}（有界核对前 128 项）`,
        },
        protectedSecretStore: windows ? 'windows-credential-manager' : 'macos-keychain',
        protectedSecretStoreLabel: windows ? 'Windows 凭据管理器' : 'macOS 钥匙串',
        separationLabel: '模型服务凭据由操作系统单独保护，不在产品数据中，也不随产品数据复制。',
      };
    };
    const revealProductDataLocation = (): ProductDataLocationRevealProjection => {
      if (launch.observeJ12Reveal) return { state: 'requested', nativeRevealSuppressedForE2e: true };
      shell.showItemInFolder(dataRoot);
      return { state: 'requested', nativeRevealSuppressedForE2e: false };
    };
    let protectedSecretStore: ProtectedSecretStore | undefined;
    try {
      protectedSecretStore = await openProtectedSecretStore();
    } catch {
      protectedSecretStore = undefined;
    }
    const settingsProjection = async (): Promise<ModelServiceSettingsProjection> => {
      let state = await service!.call('getModelServiceStoredState', {});
      let connection = state.connection;
      if (connection?.credentialOperationState === 'ready') {
        let present = false;
        if (protectedSecretStore !== undefined) {
          try {
            present = await protectedSecretStore.has(connection.credentialReference);
          } catch {
            present = false;
          }
        }
        if (!present) {
          try {
            connection = await service!.call('setModelServiceCredentialState', {
              credentialReference: connection.credentialReference,
              credentialOperationState: 'needs-attention',
            });
            state = { ...state, connection };
          } catch {
            connection = { ...connection, credentialOperationState: 'needs-attention' };
          }
        }
      }
      const mainStatus = protectedSecretStore === undefined
        ? 'unavailable' as const
        : connection === null || connection.credentialOperationState === 'missing'
          ? 'setup-required' as const
          : connection.credentialOperationState === 'ready'
            ? 'available' as const
            : 'needs-attention' as const;
      const mainStatusLabel = mainStatus === 'available' ? '可用' as const
        : mainStatus === 'setup-required' ? '需设置' as const
          : mainStatus === 'needs-attention' ? '需处理' as const
            : '不可用' as const;
      const unconfigured = (
        roleId: 'fast-interaction' | 'difficult-escalation' | 'frontier',
        roleLabel: '快速交互角色' | '疑难升级角色' | '前沿模型角色',
        purposeLabel: string,
      ) => ({
        roleId,
        roleLabel,
        purposeLabel,
        status: 'setup-required' as const,
        statusLabel: '需设置' as const,
        statusDetail: '当前版本未配置此角色的模型服务绑定。',
        binding: null,
        connection: null,
      });
      return {
        roles: [
          unconfigured('fast-interaction', '快速交互角色', '快速交互与低风险候选生成'),
          {
            roleId: 'main-editorial',
            roleLabel: '主编辑角色',
            purposeLabel: '中文长篇写作、编辑建议与复杂指令处理',
            status: mainStatus,
            statusLabel: mainStatusLabel,
            statusDetail: protectedSecretStore === undefined
              ? '当前操作系统安全凭据库不可用；未启用替代存储。'
              : mainStatus === 'available'
                ? '连接名称与凭据已由操作系统安全凭据库保护。'
                : mainStatus === 'needs-attention'
                  ? '凭据状态无法确认；请重新输入或移除。'
                  : '请输入连接名称与凭据。',
            binding: {
              providerId: 'deepseek-open-platform',
              providerLabel: 'DeepSeek 开放平台（官方）',
              modelId: 'deepseek-v4-pro',
              modelLabel: 'DeepSeek V4 Pro High',
              adapterRevision: 1,
              configurationRevision: 1,
              approvedFallbackChain: [],
              credentialSlot: 'deepseek-api-key',
            },
            connection,
          },
          unconfigured('difficult-escalation', '疑难升级角色', '疑难或高后果工作升级'),
          unconfigured('frontier', '前沿模型角色', '挑战性或明确授权的高后果工作'),
        ],
        protectedSecretStore: {
          backend: process.platform === 'win32' ? 'windows-credential-manager' : 'macos-keychain',
          label: process.platform === 'win32' ? 'Windows 凭据管理器' : 'macOS 钥匙串',
          availability: protectedSecretStore === undefined ? 'unavailable' : 'available',
        },
        launchPolicy: state.launchPolicy,
        authorityStatement: '凭据就绪不授予模型处理、对外导出、运行、受控动作或公开发布权限。',
      };
    };
    const saveModelServiceCredential = async (input: {
      connectionName: string;
      secret: string;
    }): Promise<ModelServiceSettingsProjection> => {
      if (protectedSecretStore === undefined) {
        throw new ServiceCallError('PROTECTED_SECRET_STORE_UNAVAILABLE', '操作系统安全凭据库当前不可用。');
      }
      if (input === null || typeof input !== 'object' || Object.keys(input).sort().join(',') !== 'connectionName,secret' ||
          typeof input.connectionName !== 'string' || typeof input.secret !== 'string' ||
          !input.connectionName.isWellFormed() || input.connectionName.trim().length < 1 || input.connectionName.trim().length > 80 ||
          !input.secret.isWellFormed() || input.secret.length < 1 || input.secret.length > 16_384) {
        throw new ServiceCallError('MODEL_SERVICE_CREDENTIAL_INVALID', '连接名称或凭据输入无效。');
      }
      const current = (await service!.call('getModelServiceStoredState', {})).connection;
      const credentialReference = current?.credentialReference ?? randomUUID();
      await service!.call('saveModelServiceConnection', {
        connectionName: input.connectionName.trim(),
        credentialReference,
        credentialOperationState: 'needs-attention',
      });
      try {
        await protectedSecretStore.set(credentialReference, input.secret);
      } catch {
        throw new ServiceCallError('PROTECTED_SECRET_WRITE_FAILED', '凭据未能写入操作系统安全凭据库。');
      }
      try {
        await service!.call('saveModelServiceConnection', {
          connectionName: input.connectionName.trim(),
          credentialReference,
          credentialOperationState: 'ready',
        });
      } catch {
        throw new ServiceCallError('MODEL_SERVICE_STATE_UNCERTAIN', '凭据已受保护，但连接状态需要处理。');
      }
      return settingsProjection();
    };
    const removeModelServiceCredential = async (): Promise<ModelServiceSettingsProjection> => {
      if (protectedSecretStore === undefined) {
        throw new ServiceCallError('PROTECTED_SECRET_STORE_UNAVAILABLE', '操作系统安全凭据库当前不可用。');
      }
      const current = (await service!.call('getModelServiceStoredState', {})).connection;
      if (current === null) return settingsProjection();
      await service!.call('setModelServiceCredentialState', {
        credentialReference: current.credentialReference,
        credentialOperationState: 'needs-attention',
      });
      try {
        await protectedSecretStore.remove(current.credentialReference);
      } catch {
        throw new ServiceCallError('PROTECTED_SECRET_REMOVE_FAILED', '凭据未能从操作系统安全凭据库移除。');
      }
      await service!.call('setModelServiceCredentialState', {
        credentialReference: current.credentialReference,
        credentialOperationState: 'missing',
      });
      return settingsProjection();
    };
    unregisterHandlers = registerRendererHandlers(
      service,
      getOwnedWindow,
      () => !serviceInterrupted,
      openBookWorkbench,
      requestBookWorkbench,
      serializeEffect,
      claims,
      bindPresentedBook,
      leaveBookWorkbench,
      getProductDataLocation,
      revealProductDataLocation,
      settingsProjection,
      saveModelServiceCredential,
      removeModelServiceCredential,
    );
    startupLocation = 'renderer-first-paint';
    const initialWindow = await createOwnedWindow(null, launch.injectedPickerPath, true);
    startupLocation = 'readiness-signal';
    requireDesktop(!serviceInterrupted);
    await announceProductReadiness();
    requireDesktop(!serviceInterrupted);
    productReady = true;
    initialWindow.window.webContents.send(MAIN_EVENTS.productReady);
    requireDesktop(!serviceInterrupted);
  } catch {
    process.stderr.write(`AI7_STARTUP_FAILED/${startupLocation}\n`);
    quitting = true;
    app.removeListener('before-quit', beforeQuit);
    app.removeListener('window-all-closed', allWindowsClosed);
    unregisterHandlers?.();
    unregisterHandlers = undefined;
    for (const owned of ownedWindows.values()) owned.window.destroy();
    try {
      await stop();
    } catch {
      // The product process exits nonzero after best-effort exact-child teardown.
    }
    app.exit(1);
  }
}
