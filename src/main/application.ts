import { registerProductionAndPackageHandlers, registerDeliverablesHandlers } from './deliverables-handlers.js';
import { registerReviewHandlers } from './review-handlers.js';
import { registerReviewGuidelineVersionHandlers, registerKnowledgeBaseHandlers } from './knowledge-base-handlers.js';
import { registerLearningDecisionHandlers, registerLibraryLearningHandlers } from './library-learning-handlers.js';
import { registerDataVersionHandler, registerDataStorageHandlers } from './data-storage-handlers.js';
import { registerSeriesKnowledgeHandlers, registerSeriesHandlers } from './series-handlers.js';
import { registerEvaluationHandlers } from './evaluation-handlers.js';
import { createFilePickers } from './file-pickers.js';
import { randomUUID } from 'node:crypto';
import { registerModelConnectionTestHandler } from './model-connection-test-handler.js';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, resolve } from 'node:path';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  Notification,
  session,
  shell,
  type Event as ElectronEvent,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type Session,
} from 'electron';
import {
  IPC_CHANNELS,
  SERVICE_PROTOCOL_VERSION,
  MAIN_EVENTS,
  EDIT_JOURNAL_FAULT_REFUSED_CODE,
  type AgentWorkspaceProjection,
  type AgentWorkspaceProposalSetInput,
  type AskAboutSelectionInput,
  type InspectFastInteractionRequestInput,
  type InspectAiEditLocksInput,
  type SetAiEditLocksInput,
  type StartScopedAiEditInput,
  type InspectScopedAiEditInput,
  type PolishSelectionInput,
  type ConvertDialogueToChangeSuggestionInput,
  type DialogueAttemptInput,
  type DialogueProjection,
  type InspectDialogueInput,
  type InspectTaskIntentDraftsInput,
  type PromoteAnswerToTaskIntentDraftInput,
  type ProposeAgentWorkspaceChangeSetInput,
  type PromoteTaskIntentDraftInput,
  type SaveTaskIntentDraftInput,
  type TaskIntentDraftProjection,
  type CommitNewBookRendererInput,
  type CommitManuscriptReimportRendererInput,
  type CommitSourceImportRendererInput,
  type BookWorkbenchOpenProjection,
  type BookWorkbenchRoute,
  type ContinueImportProjection,
  type ImportDraftRecoveryProjection,
  type ImportCommitProjection,
  type ModelServiceSettingsProjection,
  modelServiceModels,
  type ModelServiceConnectionProjection,
  type ModelServiceCredentialInput,
  type ModelServiceRouteId,
  type ModelServiceUnsupportedProviderProjection,
  type ModelRoleStatus,
  type ModelRoleStatusLabel,
  MODEL_SERVICE_ROUTE_BINDINGS,
  MODEL_SERVICE_ROUTE_EFFECT_LABEL,
  MODEL_SERVICE_ROUTES,
  type PickerReselectResult,
  type PickerStageResult,
  type EditorClipboardCommand,
  type ProductDataLocationProjection,
  type ProductDataLocationRevealProjection,
  type RendererApi,
  type ResolvedBookWorkbenchRoute,
  type ReviewBeforeManuscriptReimportProjection,
  type ServiceWireJobProjection as ServiceJobProjection,
  type WireServiceOperationMap as ServiceOperationMap,
} from '../shared/protocol.js';
import { CrashRecords, crashHook, installCrashHooks } from './crash-records.js';
import { DIAGNOSTICS_CHANNELS, writeDiagnosticsBundle } from './diagnostics.js';
import { CONFIGURED_PROVIDER_LABELS, CONFIGURED_ROUTE_IDS } from '../shared/provider-configuration.generated.js';
import { journeyClose, journeyStartupRelay, ServiceCallError, ServiceClient } from './service-client.js';
import {
  DATA_VERSION_STARTUP_CLOSE,
  DATA_VERSION_STARTUP_TITLE,
  dataVersionStartupRefusal,
} from '../shared/data-version-labels.js';
import { readApplicationBuildIdentity } from '../shared/read-build-identity.js';
import { openProtectedSecretStore, type ProtectedSecretStore } from './protected-secret-store.js';
import { createPreferenceStore, PreferenceError, type PreferenceStore } from './preferences.js';
import { chooseStartupDataRoot, type StartupLocationChoice } from './startup-data-root.js';
import {
  CHANNEL_LABELS,
  channelDescription,
  dataLocationSyncWarning,
  packagedLaunchForm,
  readDistributionChannel,
  requireWritableDataRoot,
  resolvePackagedDataLocation,
  type PackagedDataLocation,
} from './channel.js';
import { createNotifier, NOTIFICATION_CHANNELS } from './notifications.js';
import { isOrdinaryOutcome } from '../renderer/notification-labels.js';
import { STARTUP_LOCATION_LABELS } from '../renderer/onboarding-labels.js';
import { PREFERENCE_IPC_CHANNELS } from '../shared/preferences.js';
import { APPEARANCE_IPC_CHANNEL, type AppearanceState } from '../shared/appearance.js';
import {
  createCanonicalExternalDataRoot,
  createCanonicalProductionDataRoot,
  ensureCanonicalDataDirectory,
  inspectBoundedDataFootprint,
  requireSameCanonicalDataDirectory,
  resolveDevelopmentSampleBook,
  defaultProductionDataRoot,
  readStartupDataChoice,
  requireStartupChoiceOutsideDataRoot,
  storeStartupDataChoice,
} from '../shared/data-root.js';
import { UUID_PATTERN, envelope, requireDesktop } from './handler-guards.js';
import type {
  ApplicationAuthorityClaims,
  EditorResourceCapability,
  ImportMutationKind,
  ImportTargetBinding,
  ManuscriptCapability,
  OwnedRendererWindow,
} from './application-types.js';
import { parseArguments, processIsAlive, type LaunchArguments, validateRuntime } from './launch-arguments.js';

/**
 * Print one staged export page to PDF (Issue #500, S64b): a hidden window on its own in-memory session with every
 * network scheme cancelled, no script, no devtools and no navigation, loads the page from AI7's own staging folder —
 * and only from there — and prints it as the fixed layout the page states. The printed file goes beside the page,
 * never over an existing one; the service then writes it to the chosen place and records its receipt.
 */
async function printStagedPage(stagingRoot: string, printSession: Session, pagePath: string, pdfPath: string): Promise<void> {
  requireDesktop(isAbsolute(pagePath) && isAbsolute(pdfPath) && dirname(pagePath) === stagingRoot && dirname(pdfPath) === stagingRoot &&
    extname(pagePath) === '.html' && extname(pdfPath) === '.pdf');
  const printer = new BrowserWindow({
    show: false,
    webPreferences: {
      session: printSession,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: false,
      devTools: false,
      spellcheck: false,
      webgl: false,
    },
  });
  printer.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  printer.webContents.on('will-navigate', (event) => event.preventDefault());
  try {
    await printer.loadFile(pagePath);
    const pdf = await printer.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true });
    await writeFile(pdfPath, pdf, { flag: 'wx' });
  } finally {
    if (!printer.isDestroyed()) printer.destroy();
  }
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

async function announceProductReadiness(): Promise<void> {
  await new Promise<void>((resolveReady, reject) => {
    process.stdout.write('AI7_READY\n', (error) => (error ? reject(error) : resolveReady()));
  });
}

export function registerRendererHandlers(
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
  saveModelServiceProxy: (input: ServiceOperationMap['saveModelServiceProxy']['input']) => Promise<ModelServiceSettingsProjection>,
  saveModelServiceCredential: (input: ModelServiceCredentialInput) => Promise<ModelServiceSettingsProjection>,
  removeModelServiceCredential: (input?: { route: ModelServiceRouteId }) => Promise<ModelServiceSettingsProjection>,
  modelOps: Pick<RendererApi, 'selectFastRoleModel' | 'selectMainRoleModel' | 'selectBothRoleModels' | 'refreshModelServiceModels'> & {
    startConnectionTest(input: Parameters<RendererApi['testModelServiceConnection']>[0]): Promise<unknown>;
    connectionTestSettings(): Promise<ModelServiceSettingsProjection>;
  },
  searchOps: Pick<RendererApi, 'selectSearchBackend' | 'probeSearchBackend' | 'saveSearchBackendCredential' | 'removeSearchBackendCredential'>,
  consumeLostApplyAcknowledgement: () => boolean,
  consumeInjectedSavePath: () => string | undefined,
  printExportPage: (pagePath: string, pdfPath: string) => Promise<void>,
  consumeInjectedFolderPath: () => string | undefined,
  quitApplication: () => 'quitting' | 'blocked',
  unsavedWindows: () => boolean,
  preferences: PreferenceStore,
  appearanceWindows: () => Iterable<OwnedRendererWindow>,
  notificationWindows: () => ReadonlyArray<OwnedRendererWindow>,
  journalFaultArmed: boolean,
): () => void {
  const notifier = createNotifier({
    preferences: () => preferences.read().values,
    focused: () => BrowserWindow.getAllWindows().some((window) => window.isFocused()),
    factory: (input) => process.env.AI7_E2E_JOURNEY ? { show() {}, close() {}, on() {} } : new Notification(input),
    navigate: (target) => {
      const owners = notificationWindows();
      const window = (owners.find((entry) => entry.bookId === target.bookId && !entry.window.isDestroyed()) ??
        owners.find((entry) => !entry.window.isDestroyed()))?.window;
      if (!window) return;
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
      window.webContents.send(NOTIFICATION_CHANNELS.navigate, target);
    },
  });
  ipcMain.handle(NOTIFICATION_CHANNELS.notify, (event, input: unknown) => envelope(async () => {
    requireSender(event);
    requireAuthority();
    requireDesktop(typeof input === 'object' && input !== null);
    const { eventId, bookId } = input as { eventId?: unknown; bookId?: unknown };
    requireDesktop(typeof eventId === 'string' && eventId.length <= 300 && (bookId === null || typeof bookId === 'string'));
    const projection = await service.call('inspectGlobalAttention', {});
    const items = projection.groups.flatMap((group) => group.items);
    const item = items.find((entry) => entry.itemId === eventId && entry.book.bookId === bookId);
    if (item && (item.group !== 'recent' || isOrdinaryOutcome(item, projection))) notifier.accept(item, items);
  }));
  const requireNothingUnsaved = (): void => {
    if (unsavedWindows()) throw new ServiceCallError('DATABASE_REPLACEMENT_UNSAVED', '还有窗口里的修改没有保存；请先保存或关闭那个窗口，再替换本机数据。');
  };
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
        : job.kind === 'task-authorization-preparation'
          ? 'task-authorization'
          : job.kind === 'baseline-analysis-preparation'
            ? 'baseline-analysis'
            : job.kind === 'review-run-preparation'
              ? 'review-run'
              : job.kind === 'initial-evaluation-preparation'
                ? 'initial-evaluation'
                : job.kind === 'readers-report-preparation'
                  ? 'readers-report'
                  : job.kind === 'evaluation-rewrite-preparation'
                    ? 'evaluation-rewrite'
                    : job.kind === 'writing-preparation'
                      ? 'writing'
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
    } else if (result !== null && 'coverageManifest' in result) {
      if (actualOperation !== 'baseline-analysis' || result.bookId !== capability.bookId) {
        throw new ServiceCallError('AI7_EDITOR_CAPABILITY_INVALID', '基线稿件分析准备结果不属于当前图书工作台。');
      }
    } else if (result !== null && 'scopeOptions' in result && 'coverage' in result) {
      if (actualOperation !== 'review-run' || result.bookId !== capability.bookId) {
        throw new ServiceCallError('AI7_EDITOR_CAPABILITY_INVALID', '审阅计划准备结果不属于当前图书工作台。');
      }
    } else if (result !== null && 'recordCount' in result && 'initial' in result) {
      // 评估 answers AI7 初评's preparation, 审稿意见's (Issue #429, S81c) and 按我的评分重写评语's (S81b2).
      if ((actualOperation !== 'initial-evaluation' && actualOperation !== 'readers-report' && actualOperation !== 'evaluation-rewrite') ||
          result.bookId !== capability.bookId) {
        throw new ServiceCallError('AI7_EDITOR_CAPABILITY_INVALID', 'AI7 初评准备结果不属于当前图书工作台。');
      }
    } else if (result !== null && 'taskIntent' in result) {
      if (actualOperation !== 'task-authorization' || result.bookId !== capability.bookId) {
        throw new ServiceCallError('AI7_EDITOR_CAPABILITY_INVALID', '任务授权准备结果不属于当前图书工作台。');
      }
    } else if (result !== null && 'consequences' in result && 'types' in result) {
      // 新建文档 · 写作任务 answers a writing Task's preparation (Issue #432, S84a).
      if (actualOperation !== 'writing' || result.bookId !== capability.bookId) {
        throw new ServiceCallError('AI7_EDITOR_CAPABILITY_INVALID', '写作任务准备结果不属于当前图书工作台。');
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
    completeOnboarding();
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
  const { chooseManuscript, chooseGuidelineFile, chooseLibraryMaterialFile, chooseExportDestination, chooseDeveloperProposalFile, chooseDatabaseExportFile, chooseUsageCsvFile, chooseDatabaseImportFile, chooseExportFolder, choosePackageArchiveFile } = createFilePickers({ consumeInjectedSavePath, consumeInjectedFolderPath });


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
        // Opened from 待我处理 (Issue #424): the state it showed this window is claimed for it now, and only
        // while no other window holds it — then the claim refuses, naming the window that does.
        if (!owned.recoveryAttentionIds.has(input.attentionId) && owned.attentionOffers.has(input.attentionId)) {
          claims.claimAttentions(owned, [input.attentionId]);
        }
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

  ipcMain.handle(IPC_CHANNELS.selectAndStageManuscript, (event, input?: { droppedPath: string }) =>
    envelope<PickerStageResult>(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        claims.requireNewDraftCapacity(owned);
        if (input !== undefined) requireDesktop(typeof input === 'object' && input !== null && Object.keys(input).join() === 'droppedPath' &&
          typeof input.droppedPath === 'string' && input.droppedPath.length > 0 && /\.docx$/iu.test(input.droppedPath), 'AI7_RENDERER_BOUNDARY_INVALID');
        const selectedPath = input?.droppedPath ?? await chooseManuscript(owned);
        if (!selectedPath) return { status: 'cancelled' as const };
        const staged = await service.call('stageSelectedManuscript', { selectionToken: randomUUID(), selectedPath });
        rememberImportDraft(owned, staged.draftId);
        return { status: 'staged' as const, staged };
      });
    }),
  );
  ipcMain.handle(IPC_CHANNELS.importBundledSampleBook, (event, ...args: unknown[]) =>
    envelope<PickerStageResult>(async () => {
      const owned = requireSender(event);
      // The shared preload invoke helper sends one `undefined` for a zero-input operation.
      requireDesktop(args.length <= 1 && args[0] === undefined, 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        claims.requireNewDraftCapacity(owned);
        const selectedPath = await resolveDevelopmentSampleBook(resolve(__dirname, '..', '..'), app.isPackaged ? 'packaged' : 'source-checkout');
        const staged = await service.call('importBundledSampleBook', { selectionToken: randomUUID(), selectedPath });
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
          const selectedPath = await chooseManuscript(owned);
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
  ipcMain.handle(IPC_CHANNELS.abandonImportDraft, (event, input: Parameters<RendererApi['abandonImportDraft']>[0]) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        requireImportDraft(owned, input.draftId);
        requireDesktop(input.preserveBookRoute === undefined || input.preserveBookRoute === true, 'AI7_RENDERER_BOUNDARY_INVALID');
        // Same-page document intake may discard an unreviewed file without leaving its already owned Book.
        // Reviewed/recovered imports keep their existing exit and commit-recovery semantics.
        if (input.preserveBookRoute) {
          requireCurrentBookRoute(owned);
          requireDesktop(!owned.importTargets.has(input.draftId) && !owned.commitBindings.has(input.draftId), 'AI7_RENDERER_BOUNDARY_INVALID');
        }
        const priorBinding = owned.commitBindings.get(input.draftId);
        const commitWasClaimed = priorBinding !== undefined && owned.importCommitIds.has(priorBinding.commitId);
        if (priorBinding !== undefined) claims.claimCommit(owned, priorBinding.commitId);
        let result: ServiceOperationMap['abandonImportDraft']['output'];
        try {
          result = await service.call('abandonImportDraft', { draftId: input.draftId, expectedDraftVersion: input.expectedDraftVersion });
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
          if (!input.preserveBookRoute) leaveBookWorkbench(owned);
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
  ipcMain.handle(IPC_CHANNELS.readManuscriptImageChunk, (event, input: ServiceOperationMap['readManuscriptImageChunk']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      requireCurrentBookRoute(owned);
      requireManuscriptCapability(owned, input);
      return service.call('readManuscriptImageChunk', input);
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
  // J-02's Edit Journal write-failure injection (Issue #951, T0-1): refused here unless the launch armed it, and refused again by the
  // service. It is serialized with the journal writes it governs, so a mode takes effect between two writes, never inside one.
  ipcMain.handle(IPC_CHANNELS.setEditJournalFault, (event, input: ServiceOperationMap['setEditJournalFault']['input']) =>
    envelope(async () => {
      requireSender(event);
      if (!journalFaultArmed) throw new ServiceCallError(EDIT_JOURNAL_FAULT_REFUSED_CODE, '写入故障注入只在开发测试启动中可用。');
      return serializeEffect(async () => service.call('setEditJournalFault', input));
    }),
  );
  // Editorial Marks (Issue #407) are records about one manuscript, so each command is gated exactly
  // as reading or writing that manuscript is, and the ones that write are serialized with every other
  // effect of this window's authority.
  ipcMain.handle(IPC_CHANNELS.createEditorialMark, (event, input: ServiceOperationMap['createEditorialMark']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        requireManuscriptCapability(owned, input);
        return service.call('createEditorialMark', input);
      });
    }),
  );
  ipcMain.handle(IPC_CHANNELS.getEditorialMarkCard, (event, input: ServiceOperationMap['getEditorialMarkCard']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      requireManuscriptCapability(owned, input);
      return service.call('getEditorialMarkCard', input);
    }),
  );
  ipcMain.handle(IPC_CHANNELS.updateEditorialMark, (event, input: ServiceOperationMap['updateEditorialMark']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        requireManuscriptCapability(owned, input);
        return service.call('updateEditorialMark', input);
      });
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.recordChangeSuggestionDecision,
    (event, input: ServiceOperationMap['recordChangeSuggestionDecision']['input']) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          requireManuscriptCapability(owned, input);
          return service.call('recordChangeSuggestionDecision', input);
        });
      }),
  );
  ipcMain.handle(
    IPC_CHANNELS.recordProposalDecisionReason,
    (event, input: ServiceOperationMap['recordProposalDecisionReason']['input']) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          requireManuscriptCapability(owned, input);
          return service.call('recordProposalDecisionReason', input);
        });
      }),
  );
  // 不说明 and 改原因 after a decision (Issue #61, S26a) are the same window's record of the same mark, gated the same way.
  ipcMain.handle(
    IPC_CHANNELS.recordProposalDecisionFeedback,
    (event, input: ServiceOperationMap['recordProposalDecisionFeedback']['input']) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          requireManuscriptCapability(owned, input);
          return service.call('recordProposalDecisionFeedback', input);
        });
      }),
  );
  // AI7 Apply (Issue #408) writes the manuscript, so it is gated as a journal write is and serialized
  // with every other effect; the window's capability is re-read from the window the Apply answers with.
  ipcMain.handle(IPC_CHANNELS.applyChangeSuggestion, (event, input: ServiceOperationMap['applyChangeSuggestion']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        requireManuscriptCapability(owned, input);
        const result = await service.call('applyChangeSuggestion', input);
        rememberManuscriptCapability(owned, result.window, input, owned.routeGeneration);
        // J-05's launch control: the Apply is committed and its answer never reaches the renderer, which
        // must then learn the outcome from the records by the same Effect identity and never send a second.
        if (consumeLostApplyAcknowledgement()) throw new ServiceCallError('AI7_APPLY_ACKNOWLEDGEMENT_LOST', '应用的确认没有送达。');
        return result;
      });
    }),
  );
  // 确认应用 on 审阅's batch confirmation strip (Issue #417): the same gate as one Apply — the window's
  // manuscript capability, serialized with every other effect — over the exact suggestions the strip
  // named, and the capability is re-read from the window the Effect answers with. J-05's lost
  // acknowledgement control speaks for the single Apply only and is not consumed here.
  ipcMain.handle(IPC_CHANNELS.applyChangeSuggestionBatch, (event, input: ServiceOperationMap['applyChangeSuggestionBatch']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        requireManuscriptCapability(owned, input);
        const result = await service.call('applyChangeSuggestionBatch', input);
        rememberManuscriptCapability(owned, result.window, input, owned.routeGeneration);
        return result;
      });
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.reverseAppliedChangeSuggestion,
    (event, input: ServiceOperationMap['reverseAppliedChangeSuggestion']['input']) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          requireManuscriptCapability(owned, input);
          const result = await service.call('reverseAppliedChangeSuggestion', input);
          rememberManuscriptCapability(owned, result.window, input, owned.routeGeneration);
          return result;
        });
      }),
  );
  ipcMain.handle(IPC_CHANNELS.inspectProposalWorkspace, (event, input: ServiceOperationMap['inspectProposalWorkspace']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        const capability = requireManuscriptCapability(owned, input);
        const result = await service.call('inspectProposalWorkspace', input);
        const resource = result;
        if ('manuscriptId' in resource) requireResourceIdentity(capability, resource as { manuscriptId: string; branchId: string });
        if ('bookId' in resource && resource.bookId !== capability.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '提案记录不属于当前图书。');
        return result;
      });
    }),
  );
  ipcMain.handle(IPC_CHANNELS.saveProposalDecisionDraft, (event, input: ServiceOperationMap['saveProposalDecisionDraft']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        const capability = requireManuscriptCapability(owned, input);
        const result = await service.call('saveProposalDecisionDraft', input);
        const resource = result;
        if ('manuscriptId' in resource) requireResourceIdentity(capability, resource as { manuscriptId: string; branchId: string });
        if ('bookId' in resource && resource.bookId !== capability.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '提案记录不属于当前图书。');
        return result;
      });
    }),
  );
  ipcMain.handle(IPC_CHANNELS.batchProposalDecisionDraft, (event, input: ServiceOperationMap['batchProposalDecisionDraft']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        const capability = requireManuscriptCapability(owned, input);
        const result = await service.call('batchProposalDecisionDraft', input);
        const resource = result.workspace;
        if ('manuscriptId' in resource) requireResourceIdentity(capability, resource as { manuscriptId: string; branchId: string });
        if ('bookId' in resource && resource.bookId !== capability.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '提案记录不属于当前图书。');
        return result;
      });
    }),
  );
  ipcMain.handle(IPC_CHANNELS.recordProposalDecision, (event, input: ServiceOperationMap['recordProposalDecision']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        const capability = requireManuscriptCapability(owned, input);
        const result = await service.call('recordProposalDecision', input);
        const resource = result;
        if ('manuscriptId' in resource) requireResourceIdentity(capability, resource as { manuscriptId: string; branchId: string });
        if ('bookId' in resource && resource.bookId !== capability.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '提案记录不属于当前图书。');
        return result;
      });
    }),
  );
  ipcMain.handle(IPC_CHANNELS.inspectApplyReceipt, (event, input: ServiceOperationMap['inspectApplyReceipt']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        const capability = requireManuscriptCapability(owned, input);
        const result = await service.call('inspectApplyReceipt', input);
        const resource = result;
        if ('manuscriptId' in resource) requireResourceIdentity(capability, resource as { manuscriptId: string; branchId: string });
        if ('bookId' in resource && resource.bookId !== capability.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '提案记录不属于当前图书。');
        return result;
      });
    }),
  );
  ipcMain.handle(IPC_CHANNELS.prepareReverseApply, (event, input: ServiceOperationMap['prepareReverseApply']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        const capability = requireManuscriptCapability(owned, input);
        const result = await service.call('prepareReverseApply', input);
        const resource = result;
        if ('manuscriptId' in resource) requireResourceIdentity(capability, resource as { manuscriptId: string; branchId: string });
        if ('bookId' in resource && resource.bookId !== capability.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '提案记录不属于当前图书。');
        return result;
      });
    }),
  );
  ipcMain.handle(IPC_CHANNELS.getManuscriptApplyOutcome, (event, input: ServiceOperationMap['getManuscriptApplyOutcome']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      requireManuscriptCapability(owned, input);
      return service.call('getManuscriptApplyOutcome', input);
    }),
  );
  // 稿件冲突 (Issue #57, plan slice S22) is a record about one manuscript's 修改建议, so each operation is gated
  // exactly as the mark commands are — the window's manuscript capability within the route's Book — and
  // the two that record are serialized with every other effect of this window's authority. The answer
  // must be of that Book and that manuscript. None of them writes the manuscript.
  const requireConflictOfCapability = <T extends { manuscriptId: string; branchId: string }>(
    capability: { bookId: string; manuscriptId: string; branchId: string },
    result: T & { bookId?: string },
  ): T => {
    if (result.bookId !== undefined && result.bookId !== capability.bookId) {
      throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '稿件冲突不属于当前图书工作台。');
    }
    requireResourceIdentity(capability, result);
    return result;
  };
  ipcMain.handle(IPC_CHANNELS.inspectProposalConflict, (event, input: ServiceOperationMap['inspectProposalConflict']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      const capability = requireManuscriptCapability(owned, input);
      return requireConflictOfCapability(capability, await service.call('inspectProposalConflict', input));
    }),
  );
  ipcMain.handle(IPC_CHANNELS.saveProposalConflictDraft, (event, input: ServiceOperationMap['saveProposalConflictDraft']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        const capability = requireManuscriptCapability(owned, input);
        const result = await service.call('saveProposalConflictDraft', input);
        if (result.markId !== input.markId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '解决草稿不属于这处冲突。');
        requireConflictOfCapability(capability, { manuscriptId: input.manuscriptId, branchId: input.branchId });
        return result;
      });
    }),
  );
  ipcMain.handle(IPC_CHANNELS.resolveProposalConflict, (event, input: ServiceOperationMap['resolveProposalConflict']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        requireManuscriptCapability(owned, input);
        const result = await service.call('resolveProposalConflict', input);
        if (result.markId !== input.markId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '处理结果不属于这处冲突。');
        return result;
      });
    }),
  );
  // 基于当前稿件重新生成建议 (Issue #842): gated as 保存解决草稿 is; the service checks it at once and answers it beside its loop,
  // so this returns the request in flight, which the surface reads again through inspectFastInteractionRequest.
  ipcMain.handle(IPC_CHANNELS.regenerateProposalConflictUnit, (event, input: ServiceOperationMap['regenerateProposalConflictUnit']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        const capability = requireManuscriptCapability(owned, input);
        const result = await service.call('regenerateProposalConflictUnit', input);
        if (result.markId !== input.markId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '重新生成的结果不属于这处冲突。');
        requireConflictOfCapability(capability, result);
        return result;
      });
    }),
  );
  ipcMain.handle(IPC_CHANNELS.getManuscriptRail, (event, input: ServiceOperationMap['getManuscriptRail']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      requireManuscriptCapability(owned, input);
      return service.call('getManuscriptRail', input);
    }),
  );
  // The selection menu's 文字处理 group. The page holds no clipboard permission, so the window that
  // owns the focused editor runs the command itself; it reaches no service and takes nothing but the
  // command's name, and the editor's own paste and cut handling still decides what enters the text.
  ipcMain.handle(IPC_CHANNELS.runEditorClipboardCommand, (event, input: { command: EditorClipboardCommand }) =>
    envelope(async () => {
      const owned = requireSender(event);
      const contents = owned.window.webContents;
      if (input?.command === 'cut') contents.cut();
      else if (input?.command === 'copy') contents.copy();
      else if (input?.command === 'paste') contents.paste();
      else if (input?.command === 'paste-plain-text') contents.pasteAndMatchStyle();
      else throw new ServiceCallError('AI7_RENDERER_BOUNDARY_INVALID', '文字处理命令无效。');
      return { state: 'done' as const };
    }),
  );
  // The remembered position is editor state about a manuscript, so it is gated exactly as reading or
  // writing that manuscript is: only the window that holds this manuscript's capability under the
  // current route may move it, and a window that lost the route moves nothing.
  ipcMain.handle(
    IPC_CHANNELS.recordManuscriptEntryPosition,
    (event, input: ServiceOperationMap['recordManuscriptEntryPosition']['input']) =>
      envelope(async () => {
        const owned = requireSender(event);
        requireAuthority();
        requireManuscriptCapability(owned, input);
        return service.call('recordManuscriptEntryPosition', input);
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
  // Local view and input configuration (Issue #934, slice 11a): main's own file, read and written without the service, so
  // it answers while the service is interrupted as well; a refusal keeps its own words.
  const preferenceCall = <Result>(operation: () => Result): Result => {
    try {
      return operation();
    } catch (error) {
      if (error instanceof PreferenceError) throw new ServiceCallError(error.code, error.message);
      throw error;
    }
  };
  ipcMain.handle(PREFERENCE_IPC_CHANNELS.getPreferences, (event) =>
    envelope(() => {
      requireSender(event);
      return preferenceCall(() => preferences.read());
    }),
  );
  // Application Theme Preference (Issue #935, VIS-004/005): the chosen theme with nativeTheme's reading, sent to every owned
  // window when either changes; native frames, menus and dialogs follow the same choice. Under 'system' the reading is the
  // operating system's state.
  const appearanceState = (): AppearanceState => {
    const preference = preferences.read().values['appearance.theme'];
    if (nativeTheme.themeSource !== preference) nativeTheme.themeSource = preference;
    return { preference, systemDark: nativeTheme.shouldUseDarkColors };
  };
  const broadcastAppearance = (): void => {
    const state = appearanceState();
    for (const owned of appearanceWindows()) {
      if (!owned.window.isDestroyed()) owned.window.webContents.send(APPEARANCE_IPC_CHANNEL, state);
    }
  };
  nativeTheme.on('updated', broadcastAppearance);
  broadcastAppearance();
  ipcMain.handle(PREFERENCE_IPC_CHANNELS.savePreference, (event, input: unknown) =>
    envelope(() => {
      requireSender(event);
      const saved = preferenceCall(() => preferences.save(input));
      // Every window hears the new theme before the choosing window's answer arrives.
      if ((input as { key?: unknown }).key === 'appearance.theme') broadcastAppearance();
      return saved;
    }),
  );
  ipcMain.handle(APPEARANCE_IPC_CHANNEL, (event) =>
    envelope(() => {
      requireSender(event);
      return appearanceState();
    }),
  );
  ipcMain.handle(IPC_CHANNELS.revealProductDataLocation, (event) =>
    envelope(() => {
      requireSender(event);
      return revealProductDataLocation();
    }),
  );
  ipcMain.handle(IPC_CHANNELS.saveModelServiceProxy, (event, input: ServiceOperationMap['saveModelServiceProxy']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireAuthority();
      return serializeEffect(() => saveModelServiceProxy(input));
    }),
  );
  for (const op of ['selectFastRoleModel', 'selectMainRoleModel', 'selectBothRoleModels'] as const) {
    ipcMain.handle(IPC_CHANNELS[op], (event, input: Parameters<RendererApi[typeof op]>[0]) => envelope(async () => {
      requireSender(event); requireAuthority();
      return serializeEffect(() => modelOps[op](input));
    }));
  }
  ipcMain.handle(IPC_CHANNELS.refreshModelServiceModels, (event, input: { route: ModelServiceRouteId }) => envelope(async () => {
    requireSender(event); requireAuthority();
    return serializeEffect(() => modelOps.refreshModelServiceModels(input));
  }));
  const disposeConnectionTest = registerModelConnectionTestHandler<IpcMainInvokeEvent, ModelServiceSettingsProjection>({
    ipc: ipcMain, requireSender, requireAuthority, serializeEffect, envelope,
    start: modelOps.startConnectionTest, project: modelOps.connectionTestSettings,
  });
  ipcMain.handle(IPC_CHANNELS.getModelServiceSettings, (event) =>
    envelope(async () => {
      requireSender(event);
      requireAuthority();
      return getModelServiceSettings();
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.saveModelServiceCredential,
    (event, input: ModelServiceCredentialInput) =>
      envelope(async () => {
        requireSender(event);
        requireAuthority();
        return serializeEffect(() => saveModelServiceCredential(input));
      }),
  );
  ipcMain.handle(IPC_CHANNELS.removeModelServiceCredential, (event, input?: { route: ModelServiceRouteId }) =>
    envelope(async () => {
      requireSender(event);
      requireAuthority();
      return serializeEffect(() => removeModelServiceCredential(input));
    }),
  );
  for (const op of ['selectSearchBackend', 'probeSearchBackend', 'saveSearchBackendCredential', 'removeSearchBackendCredential'] as const) {
    ipcMain.handle(IPC_CHANNELS[op], (event, input: { backendId: string; secret: string }) => envelope(async () => {
      requireSender(event);
      requireAuthority();
      return serializeEffect<unknown>(() => searchOps[op](input));
    }));
  }
  const completeOnboarding = (): void => {
    try {
      if (preferences.read().values['onboarding.state'] !== 'completed') preferences.save({ key: 'onboarding.state', value: 'completed' });
    } catch {
      // The Book has already committed; a local preference write must never turn that success into a retry.
      process.stderr.write('AI7_ONBOARDING/preference-write-failed\n');
    }
  };
  ipcMain.handle(IPC_CHANNELS.commitBookCreation, (event, input: ServiceOperationMap['commitBookCreation']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        const result = await service.call('commitBookCreation', input);
        completeOnboarding();
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
  ipcMain.handle(IPC_CHANNELS.inspectEditorialWorkspaceProfile, (event) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      const route = requireCurrentBookRoute(owned);
      const routeGeneration = owned.routeGeneration;
      const routeRequestSequence = owned.routeRequestSequence;
      const result = await service.call('inspectEditorialWorkspaceProfile', { bookId: route.bookId });
      requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
      if (result.bookId !== route.bookId) {
        throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '原生构件状态不属于当前图书工作台。');
      }
      return result;
    }),
  );
  ipcMain.handle(IPC_CHANNELS.installEditorialWorkspaceProfile, (event) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const routeGeneration = owned.routeGeneration;
        const result = await service.call('installEditorialWorkspaceProfile', { bookId: route.bookId });
        requireCurrentRouteGeneration(owned, routeGeneration);
        if (result.bookId !== route.bookId) {
          throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '原生构件安装结果不属于当前图书工作台。');
        }
        return result;
      });
    }),
  );
  ipcMain.handle(IPC_CHANNELS.enableEditorialWorkspaceProfile, (event) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const routeGeneration = owned.routeGeneration;
        const result = await service.call('enableEditorialWorkspaceProfile', { bookId: route.bookId });
        requireCurrentRouteGeneration(owned, routeGeneration);
        if (result.bookId !== route.bookId) {
          throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '原生构件启用结果不属于当前图书工作台。');
        }
        return result;
      });
    }),
  );
  ipcMain.handle(IPC_CHANNELS.inspectTaskAuthorization, (event) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      const route = requireCurrentBookRoute(owned);
      const routeGeneration = owned.routeGeneration;
      const routeRequestSequence = owned.routeRequestSequence;
      const result = await service.call('inspectTaskAuthorization', { bookId: route.bookId });
      requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
      if (result.bookId !== route.bookId) {
        throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '任务授权记录不属于当前图书工作台。');
      }
      return result;
    }),
  );
  // The Task Drawer (Issue #418, plan slice S72) reads one Task's plan of the route's Book: the renderer
  // names the kind and the Task, never the Book, and the answer must be that Book's plan of that Task. The
  // kind and the Task travel as the renderer gave them; the request frame decides whether they are well
  // formed. It is a read, held to the route's read epoch like every other.
  ipcMain.handle(IPC_CHANNELS.inspectTaskPlan, (event, input?: Omit<ServiceOperationMap['inspectTaskPlan']['input'], 'bookId'>) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      const route = requireCurrentBookRoute(owned);
      const routeGeneration = owned.routeGeneration;
      const routeRequestSequence = owned.routeRequestSequence;
      const kind = input?.kind as ServiceOperationMap['inspectTaskPlan']['input']['kind'];
      const ref = typeof input?.ref === 'string' ? input.ref : null;
      const result = await service.call('inspectTaskPlan', { bookId: route.bookId, kind, ref });
      requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
      if (result.bookId !== route.bookId || result.kind !== kind || (ref !== null && result.ref !== ref)) {
        throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '任务计划不属于当前图书工作台。');
      }
      return result;
    }),
  );
  // 保留为缺口 (Issue #757): an effect on the route's Book, named by the kind and the Task as the plan read is, and the digest of
  // the list the editor read; the answer is that Book's plan of that kind again.
  ipcMain.handle(
    IPC_CHANNELS.resolveUnconfirmedOutcomes,
    (event, input?: Omit<ServiceOperationMap['resolveUnconfirmedOutcomes']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const kind = input?.kind as ServiceOperationMap['resolveUnconfirmedOutcomes']['input']['kind'];
          const ref = typeof input?.ref === 'string' ? input.ref : null;
          const digest = input?.digest as string;
          const result = await service.call('resolveUnconfirmedOutcomes', { bookId: route.bookId, kind, ref, digest });
          requireCurrentRouteGeneration(owned, routeGeneration);
          if (result.bookId !== route.bookId || result.kind !== kind || (ref !== null && result.ref !== ref)) {
            throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '人工结果确认的结果不属于当前图书工作台。');
          }
          return result;
        });
      }),
  );
  ipcMain.handle(
    IPC_CHANNELS.inspectForegroundExecutionBoundary,
    (event, input: Omit<ServiceOperationMap['inspectForegroundExecutionBoundary']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const routeGeneration = owned.routeGeneration;
        const routeRequestSequence = owned.routeRequestSequence;
        const result = await service.call('inspectForegroundExecutionBoundary', {
          bookId: route.bookId,
          runRecordId: input.runRecordId,
        });
        requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
        if (result.bookId !== route.bookId || result.runRecordId !== input.runRecordId) {
          throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '前台执行边界核对结果不属于当前图书或运行。');
        }
        return result;
      }),
  );
  ipcMain.handle(
    IPC_CHANNELS.prepareTaskAuthorization,
    (event, input: Omit<ServiceOperationMap['prepareTaskAuthorization']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const result = await service.call('prepareTaskAuthorization', {
            goal: input.goal,
            bookId: route.bookId,
          });
          if (result.kind !== 'task-authorization-preparation') {
            throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '任务授权准备结果类型无效。');
          }
          rememberEditorResource(owned, 'job', result.jobId, {
            operation: 'task-authorization',
            bookId: route.bookId,
            manuscriptId: null,
            branchId: null,
          });
          return result;
        });
      }),
  );
  ipcMain.handle(
    IPC_CHANNELS.authorizeTaskAuthorization,
    (event, input: Omit<ServiceOperationMap['authorizeTaskAuthorization']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('authorizeTaskAuthorization', {
            taskIntentId: input.taskIntentId,
            planEnvelopeDigest: input.planEnvelopeDigest,
            bookId: route.bookId,
          });
          requireCurrentRouteGeneration(owned, routeGeneration);
          if (result.bookId !== route.bookId) {
            throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '任务运行授权结果不属于当前图书工作台。');
          }
          return result;
        });
      }),
  );
  ipcMain.handle(IPC_CHANNELS.inspectBookFindings, (event, input?: { offset: number }) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      const route = requireCurrentBookRoute(owned);
      const generation = owned.routeGeneration;
      const sequence = owned.routeRequestSequence;
      const result = await service.call('inspectBookFindings', { bookId: route.bookId, offset: input?.offset ?? 0 });
      requireCurrentRouteReadEpoch(owned, generation, sequence);
      if (result.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '发现不属于当前图书。');
      return result;
    }),
  );
  ipcMain.handle(IPC_CHANNELS.inspectParagraphAnalysis, (event, input: Omit<ServiceOperationMap['inspectParagraphAnalysis']['input'], 'bookId'>) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      const route = requireCurrentBookRoute(owned);
      const generation = owned.routeGeneration;
      const sequence = owned.routeRequestSequence;
      const result = await service.call('inspectParagraphAnalysis', { manuscriptId: input?.manuscriptId, blockId: input?.blockId, radius: input?.radius, bookId: route.bookId });
      requireCurrentRouteReadEpoch(owned, generation, sequence);
      if (result.bookId !== route.bookId || result.manuscriptId !== input.manuscriptId || result.blockId !== input.blockId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '段落分析不属于当前稿件。');
      return result;
    }),
  );
  ipcMain.handle(IPC_CHANNELS.getTaskPlanPage, (event, input: Omit<ServiceOperationMap['getTaskPlanPage']['input'], 'bookId'>) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      const route = requireCurrentBookRoute(owned);
      const generation = owned.routeGeneration;
      const sequence = owned.routeRequestSequence;
      const result = await service.call('getTaskPlanPage', { ...input, bookId: route.bookId });
      requireCurrentRouteReadEpoch(owned, generation, sequence);
      // A page answers the list it was asked for, and retained drafts are this Book's, as the whole read is checked.
      if (result.path !== input.path || result.digest !== input.digest || input.kind === 'task-intent-drafts' &&
          (!Array.isArray(result.items) || result.items.some((draft) => (draft as TaskIntentDraftProjection).bookId !== route.bookId))) {
        throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '任务计划不属于当前图书工作台。');
      }
      return result;
    }),
  );
  ipcMain.handle(IPC_CHANNELS.getBaselineAnalysisPage, (event, input: Omit<ServiceOperationMap['getBaselineAnalysisPage']['input'], 'bookId'>) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      const route = requireCurrentBookRoute(owned);
      const generation = owned.routeGeneration;
      const sequence = owned.routeRequestSequence;
      const result = await service.call('getBaselineAnalysisPage', { ...input, bookId: route.bookId });
      requireCurrentRouteReadEpoch(owned, generation, sequence);
      return result;
    }),
  );
  ipcMain.handle(IPC_CHANNELS.getCoverageManifestUnits, (event, input: Omit<ServiceOperationMap['getCoverageManifestUnits']['input'], 'bookId'>) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      const route = requireCurrentBookRoute(owned);
      const generation = owned.routeGeneration;
      const sequence = owned.routeRequestSequence;
      const result = await service.call('getCoverageManifestUnits', { ...input, bookId: route.bookId });
      requireCurrentRouteReadEpoch(owned, generation, sequence);
      return result;
    }),
  );
  ipcMain.handle(IPC_CHANNELS.getAnalysisRevisionUnits, (event, input: Omit<ServiceOperationMap['getAnalysisRevisionUnits']['input'], 'bookId'>) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      const route = requireCurrentBookRoute(owned);
      const generation = owned.routeGeneration;
      const sequence = owned.routeRequestSequence;
      const result = await service.call('getAnalysisRevisionUnits', { ...input, bookId: route.bookId });
      requireCurrentRouteReadEpoch(owned, generation, sequence);
      return result;
    }),
  );
  ipcMain.handle(IPC_CHANNELS.getAnalysisRevisionOverview, (event, input: Omit<ServiceOperationMap['getAnalysisRevisionOverview']['input'], 'bookId'>) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      const route = requireCurrentBookRoute(owned);
      const generation = owned.routeGeneration;
      const sequence = owned.routeRequestSequence;
      const result = await service.call('getAnalysisRevisionOverview', { ...input, bookId: route.bookId });
      requireCurrentRouteReadEpoch(owned, generation, sequence);
      return result;
    }),
  );
  ipcMain.handle(IPC_CHANNELS.getAnalysisRunReportRows, (event, input: Omit<ServiceOperationMap['getAnalysisRunReportRows']['input'], 'bookId'>) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      const route = requireCurrentBookRoute(owned);
      const generation = owned.routeGeneration;
      const sequence = owned.routeRequestSequence;
      const result = await service.call('getAnalysisRunReportRows', { ...input, bookId: route.bookId });
      requireCurrentRouteReadEpoch(owned, generation, sequence);
      return result;
    }),
  );
  ipcMain.handle(IPC_CHANNELS.getBaselineAnalysisRangePlan, (event, input: Omit<ServiceOperationMap['getBaselineAnalysisRangePlan']['input'], 'bookId'>) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      const route = requireCurrentBookRoute(owned);
      const generation = owned.routeGeneration;
      const sequence = owned.routeRequestSequence;
      const result = await service.call('getBaselineAnalysisRangePlan', { ...input, bookId: route.bookId });
      requireCurrentRouteReadEpoch(owned, generation, sequence);
      return result;
    }),
  );
  ipcMain.handle(IPC_CHANNELS.inspectBaselineAnalysis, (event, input?: Omit<ServiceOperationMap['inspectBaselineAnalysis']['input'], 'bookId'>) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      const route = requireCurrentBookRoute(owned);
      const routeGeneration = owned.routeGeneration;
      const routeRequestSequence = owned.routeRequestSequence;
      const revisionId = typeof input?.revisionId === 'string' ? input.revisionId : null;
      const result = await service.call('inspectBaselineAnalysis', { bookId: route.bookId, revisionId });
      requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
      if (result.bookId !== route.bookId) {
        throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '基线稿件分析记录不属于当前图书工作台。');
      }
      return result;
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.prepareBaselineAnalysis,
    (event, input: Omit<ServiceOperationMap['prepareBaselineAnalysis']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const result = await service.call('prepareBaselineAnalysis', {
            goal: input.goal,
            update: input.update,
            reconfirm: input.reconfirm === true,
            // 改计划重做 (Issue #422, S76c) names the cancelled Run it redoes; every other preparation names none.
            ...(input.redoOf === undefined || input.redoOf === null ? {} : { redoOf: input.redoOf }),
            bookId: route.bookId,
          });
          if (result.kind !== 'baseline-analysis-preparation') {
            throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '基线稿件分析准备结果类型无效。');
          }
          rememberEditorResource(owned, 'job', result.jobId, {
            operation: 'baseline-analysis',
            bookId: route.bookId,
            manuscriptId: null,
            branchId: null,
          });
          return result;
        });
      }),
  );
  ipcMain.handle(
    IPC_CHANNELS.authorizeBaselineAnalysis,
    (event, input: Omit<ServiceOperationMap['authorizeBaselineAnalysis']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('authorizeBaselineAnalysis', {
            taskIntentId: input.taskIntentId,
            planEnvelopeDigest: input.planEnvelopeDigest,
            bookId: route.bookId,
          });
          requireCurrentRouteGeneration(owned, routeGeneration);
          if (result.bookId !== route.bookId) {
            throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '基线稿件分析授权结果不属于当前图书工作台。');
          }
          return result;
        });
      }),
  );
  // 联网后开始任务 and 取消 while waiting (Issue #502) are the baseline Task's own, exactly as its immediate start is:
  // the renderer never names a Book, the service is asked within the route's, and the answer must be that Book's.
  ipcMain.handle(
    IPC_CHANNELS.startBaselineAnalysisWhenOnline,
    (event, input: Omit<ServiceOperationMap['startBaselineAnalysisWhenOnline']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('startBaselineAnalysisWhenOnline', {
            taskIntentId: input.taskIntentId,
            planEnvelopeDigest: input.planEnvelopeDigest,
            bookId: route.bookId,
          });
          requireCurrentRouteGeneration(owned, routeGeneration);
          if (result.bookId !== route.bookId) {
            throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '联网后开始任务的结果不属于当前图书工作台。');
          }
          return result;
        });
      }),
  );
  ipcMain.handle(
    IPC_CHANNELS.cancelWaitingBaselineAnalysis,
    (event, input: Omit<ServiceOperationMap['cancelWaitingBaselineAnalysis']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('cancelWaitingBaselineAnalysis', { taskIntentId: input.taskIntentId, bookId: route.bookId });
          requireCurrentRouteGeneration(owned, routeGeneration);
          if (result.bookId !== route.bookId) {
            throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '取消等待中任务的结果不属于当前图书工作台。');
          }
          return result;
        });
      }),
  );
  // 联网后开始任务 and its 取消 for every other kind with a plan (Issue #760, S74c), as the baseline's: the renderer names the
  // kind and the Task, never a Book; the service is asked within the route's, and the plan it answers must be that Book's.
  ipcMain.handle(
    IPC_CHANNELS.startTaskWhenOnline,
    (event, input: Omit<ServiceOperationMap['startTaskWhenOnline']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('startTaskWhenOnline', {
            kind: input.kind,
            ref: input.ref,
            planEnvelopeDigest: input.planEnvelopeDigest,
            planDigests: input.planDigests,
            bookId: route.bookId,
          });
          requireCurrentRouteGeneration(owned, routeGeneration);
          if (result.bookId !== route.bookId || result.kind !== input.kind || result.ref !== input.ref) {
            throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '联网后开始任务的结果不属于当前图书工作台。');
          }
          return result;
        });
      }),
  );
  // 空闲时处理 (Issue #1089): the same exact authorization as 开始任务 within the route's Book, started when AI7 is idle.
  ipcMain.handle(
    IPC_CHANNELS.startTaskWhenIdle,
    (event, input: Omit<ServiceOperationMap['startTaskWhenIdle']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('startTaskWhenIdle', {
            kind: input.kind,
            ref: input.ref,
            planEnvelopeDigest: input.planEnvelopeDigest,
            planDigests: input.planDigests,
            bookId: route.bookId,
          });
          requireCurrentRouteGeneration(owned, routeGeneration);
          if (result.bookId !== route.bookId || result.kind !== input.kind || result.ref !== input.ref) {
            throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '空闲时处理的结果不属于当前图书工作台。');
          }
          return result;
        });
      }),
  );
  ipcMain.handle(
    IPC_CHANNELS.cancelWaitingTask,
    (event, input: Omit<ServiceOperationMap['cancelWaitingTask']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('cancelWaitingTask', { kind: input.kind, ref: input.ref, bookId: route.bookId });
          requireCurrentRouteGeneration(owned, routeGeneration);
          if (result.bookId !== route.bookId || result.kind !== input.kind || result.ref !== input.ref) {
            throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '取消等待中任务的结果不属于当前图书工作台。');
          }
          return result;
        });
      }),
  );
  // 取消任务 (Issue #422) is the baseline Task's own as well: the renderer names the Task Intent and never a Book, and
  // the answer must be the route Book's. It is serialized with every other effect, since it records a Run state.
  ipcMain.handle(
    IPC_CHANNELS.cancelBaselineAnalysisRun,
    (event, input: Omit<ServiceOperationMap['cancelBaselineAnalysisRun']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('cancelBaselineAnalysisRun', { taskIntentId: input.taskIntentId, bookId: route.bookId });
          requireCurrentRouteGeneration(owned, routeGeneration);
          if (result.bookId !== route.bookId) {
            throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '取消任务的结果不属于当前图书工作台。');
          }
          return result;
        });
      }),
  );
  // 更新计划 (Issue #419, plan slice S73) is the baseline Task's own too: the Task Intent, the version the editor read
  // and what the plan leaves out, answered by the route Book and serialized with every other effect.
  ipcMain.handle(
    IPC_CHANNELS.editBaselineAnalysisPlan,
    (event, input: Omit<ServiceOperationMap['editBaselineAnalysisPlan']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('editBaselineAnalysisPlan', {
            bookId: route.bookId,
            taskIntentId: input.taskIntentId,
            planEnvelopeDigest: input.planEnvelopeDigest,
            removedSteps: input.removedSteps,
            disallowedAdaptations: input.disallowedAdaptations,
            // 先问你 (Issue #422, S76d) and the editor's ceiling (Issue #51, S16a) ride along only when the renderer names them.
            ...(input.askFirstAdaptations === undefined ? {} : { askFirstAdaptations: input.askFirstAdaptations }),
            ...(input.runBudgetCeiling === undefined ? {} : { runBudgetCeiling: input.runBudgetCeiling }),
          });
          requireCurrentRouteGeneration(owned, routeGeneration);
          if (result.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '更新计划的结果不属于当前图书工作台。');
          return result;
        });
      }),
  );
  // 提交回答 (Issue #422, plan slice S76d) is the baseline Task's own too: the question, the Task it belongs to, the option
  // and the note, answered by the route Book and serialized with every other effect — a Run that waits for it goes on.
  ipcMain.handle(
    IPC_CHANNELS.answerBaselineAnalysisClarification,
    (event, input: Omit<ServiceOperationMap['answerBaselineAnalysisClarification']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('answerBaselineAnalysisClarification', {
            bookId: route.bookId,
            taskIntentId: input.taskIntentId,
            requestId: input.requestId,
            optionId: input.optionId,
            note: input.note,
          });
          requireCurrentRouteGeneration(owned, routeGeneration);
          if (result.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '回答的结果不属于当前图书工作台。');
          return result;
        });
      }),
  );
  // 暂停 and 续行 (Issue #422, S76b) are the baseline Task's own the same way: named by the Task Intent, answered by the
  // route Book, and serialized with every other effect — 续行 dispatches.
  for (const [channel, operation, words] of [
    [IPC_CHANNELS.pauseBaselineAnalysisRun, 'pauseBaselineAnalysisRun', '暂停任务的结果不属于当前图书工作台。'],
    [IPC_CHANNELS.resumeBaselineAnalysisRun, 'resumeBaselineAnalysisRun', '续行的结果不属于当前图书工作台。'],
  ] as const) {
    ipcMain.handle(
      channel,
      (event, input: Omit<ServiceOperationMap[typeof operation]['input'], 'bookId'>) =>
        envelope(async () => {
          const owned = requireSender(event);
          return serializeEffect(async () => {
            requireAuthority();
            const route = requireCurrentBookRoute(owned);
            const routeGeneration = owned.routeGeneration;
            const result = await service.call(operation, { taskIntentId: input.taskIntentId, bookId: route.bookId });
            requireCurrentRouteGeneration(owned, routeGeneration);
            if (result.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', words);
            return result;
          });
        }),
    );
  }
  // Shared controls are bound to the sender's current Book and serialized with its other effects.
  ipcMain.handle(IPC_CHANNELS.quickStartReviewRun, (event, input: Omit<ServiceOperationMap['quickStartReviewRun']['input'], 'bookId'>) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const routeGeneration = owned.routeGeneration;
        const result = await service.call('quickStartReviewRun', { ...input, bookId: route.bookId });
        requireCurrentRouteGeneration(owned, routeGeneration);
        if (result.projection.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '审阅结果不属于当前图书工作台。');
        return result;
      });
    }));
  for (const operation of ['controlTaskRun', 'editTaskPlan'] as const) {
    ipcMain.handle(IPC_CHANNELS[operation], (event, input: Omit<ServiceOperationMap['controlTaskRun']['input'], 'bookId'> | Omit<ServiceOperationMap['editTaskPlan']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call(operation, { ...input, bookId: route.bookId });
          requireCurrentRouteGeneration(owned, routeGeneration);
          if ('bookId' in result && result.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '任务控制的结果不属于当前图书工作台。');
          return result;
        });
      }));
  }
  // 改计划重做 prepares through the kind's own cooperative job, which this window then polls and may cancel as its own.
  ipcMain.handle(IPC_CHANNELS.redoTaskPlan, (event, input: Omit<ServiceOperationMap['redoTaskPlan']['input'], 'bookId'>) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const routeGeneration = owned.routeGeneration;
        const job = await service.call('redoTaskPlan', { kind: input.kind, ref: input.ref, bookId: route.bookId });
        requireCurrentRouteGeneration(owned, routeGeneration);
        rememberEditorResource(owned, 'job', job.jobId, { operation: operationForJob(job), bookId: route.bookId, manuscriptId: null, branchId: null });
        return job;
      });
    }));
  // Reconnect Preflight names no Book: it only ever admits Runs the editor already authorized to start when
  // online. It is serialized with every other effect, because an admission dispatches.
  ipcMain.handle(
    IPC_CHANNELS.runReconnectPreflight,
    (event) =>
      envelope(async () => {
        requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          return service.call('runReconnectPreflight', {});
        });
      }),
  );
  // 快速开始 and `设为快速开始默认…` (Issue #421) are the baseline Task's own, exactly as its immediate start is: the
  // renderer never names a Book, the service is asked within the route's, and the answer must be that Book's.
  ipcMain.handle(
    IPC_CHANNELS.quickStartBaselineAnalysis,
    (event, input: Omit<ServiceOperationMap['quickStartBaselineAnalysis']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('quickStartBaselineAnalysis', {
            taskIntentId: input.taskIntentId,
            planEnvelopeDigest: input.planEnvelopeDigest,
            ruleVersionId: input.ruleVersionId,
            bookId: route.bookId,
          });
          requireCurrentRouteGeneration(owned, routeGeneration);
          if (result.projection.bookId !== route.bookId) {
            throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '快速开始的结果不属于当前图书工作台。');
          }
          return result;
        });
      }),
  );
  ipcMain.handle(
    IPC_CHANNELS.setDefaultExecutionRule,
    (event, input: Omit<ServiceOperationMap['setDefaultExecutionRule']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('setDefaultExecutionRule', {
            taskIntentId: input.taskIntentId,
            planEnvelopeDigest: input.planEnvelopeDigest,
            bookId: route.bookId,
          });
          requireCurrentRouteGeneration(owned, routeGeneration);
          if (result.bookId !== route.bookId) {
            throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '设定的默认执行规则不属于当前图书工作台。');
          }
          return result;
        });
      }),
  );
  // 知识库 › 工序与规则 names no Book: it lists every Book's rules, and 停用 names the rule itself. Turning one off is
  // serialized with every other effect of this window's authority.
  ipcMain.handle(IPC_CHANNELS.inspectDefaultExecutionRules, (event) =>
    envelope(async () => {
      requireSender(event);
      requireAuthority();
      return service.call('inspectDefaultExecutionRules', {});
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.deactivateDefaultExecutionRule,
    (event, input: ServiceOperationMap['deactivateDefaultExecutionRule']['input']) =>
      envelope(async () => {
        requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          return service.call('deactivateDefaultExecutionRule', { ruleId: input.ruleId });
        });
      }),
  );
  // 后台分析登记 (Issue #95, S39) is the route's Book's: read, `登记` and `撤销登记`, the two decisions serialized with every other
  // effect of this window's authority.
  ipcMain.handle(IPC_CHANNELS.inspectBackgroundAnalysisEnrollment, (event, input?: { kind?: string }) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      const route = requireCurrentBookRoute(owned);
      const routeGeneration = owned.routeGeneration;
      const routeRequestSequence = owned.routeRequestSequence;
      const result = await service.call('inspectBackgroundAnalysisEnrollment', { bookId: route.bookId, ...(input?.kind === undefined ? {} : { kind: input.kind }) });
      requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
      if (result.bookId !== route.bookId) {
        throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '后台分析登记不属于当前图书工作台。');
      }
      return result;
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.enrollBackgroundAnalysis,
    (event, input: Omit<ServiceOperationMap['enrollBackgroundAnalysis']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('enrollBackgroundAnalysis', {
            ...(input.kind === undefined ? {} : { kind: input.kind }),
            disclosureDigest: input.disclosureDigest,
            startingPoint: input.startingPoint,
            // The scope and the required tokens ceiling (Issue #864), copied field by field.
            scope: { kind: input.scope?.kind, seriesId: input.scope?.seriesId } as ServiceOperationMap['enrollBackgroundAnalysis']['input']['scope'],
            ceilingTokens: input.ceilingTokens,
            bookId: route.bookId,
          });
          requireCurrentRouteGeneration(owned, routeGeneration);
          if (result.bookId !== route.bookId) {
            throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '后台分析登记不属于当前图书工作台。');
          }
          return result;
        });
      }),
  );
  ipcMain.handle(
    IPC_CHANNELS.revokeBackgroundAnalysisEnrollment,
    (event, input: Omit<ServiceOperationMap['revokeBackgroundAnalysisEnrollment']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('revokeBackgroundAnalysisEnrollment', { enrollmentId: input.enrollmentId, bookId: route.bookId });
          requireCurrentRouteGeneration(owned, routeGeneration);
          if (result.bookId !== route.bookId) {
            throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '后台分析登记不属于当前图书工作台。');
          }
          return result;
        });
      }),
  );
  // `暂停` / `续行` of the route's Book's Enrollment (Issue #864), serialized like its other two decisions.
  ipcMain.handle(
    IPC_CHANNELS.holdBackgroundAnalysisEnrollment,
    (event, input: Omit<ServiceOperationMap['holdBackgroundAnalysisEnrollment']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('holdBackgroundAnalysisEnrollment', { enrollmentId: input.enrollmentId, hold: input.hold, bookId: route.bookId });
          requireCurrentRouteGeneration(owned, routeGeneration);
          if (result.bookId !== route.bookId) {
            throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '后台分析登记不属于当前图书工作台。');
          }
          return result;
        });
      }),
  );
  registerKnowledgeBaseHandlers({ chooseDeveloperProposalFile, requireSender, requireAuthority, service, serializeEffect, requireCurrentBookRoute, requireCurrentRouteReadEpoch, requireCurrentRouteGeneration });
  registerEvaluationHandlers({ requireSender, requireAuthority, service, requireCurrentBookRoute, requireCurrentRouteReadEpoch, serializeEffect, requireCurrentRouteGeneration, rememberEditorResource });
  registerLibraryLearningHandlers({ chooseLibraryMaterialFile, requireSender, requireAuthority, service, serializeEffect, preferences });
  registerSeriesHandlers({ requireSender, requireAuthority, service, serializeEffect });
  registerDataStorageHandlers({ chooseDatabaseExportFile, chooseUsageCsvFile, chooseDatabaseImportFile, requireSender, serializeEffect, requireAuthority, service, preferences, requireNothingUnsaved, quitApplication });
  registerSeriesKnowledgeHandlers({ requireSender, serializeEffect, requireAuthority, requireManuscriptCapability, service });
  registerDataVersionHandler({ requireSender, requireAuthority, service });
  registerLearningDecisionHandlers({ requireSender, requireAuthority, service, serializeEffect });
  registerReviewGuidelineVersionHandlers({ chooseGuidelineFile, requireSender, serializeEffect, requireAuthority, service });
  registerReviewHandlers({ requireSender, serializeEffect, requireAuthority, requireCurrentBookRoute, service, requireCurrentRouteReadEpoch, rememberEditorResource, requireCurrentRouteGeneration, requireManuscriptCapability });
  registerDeliverablesHandlers({ requireSender, requireAuthority, requireCurrentBookRoute, service, requireCurrentRouteReadEpoch, serializeEffect, requireCurrentRouteGeneration });

  // ① 任务面 (Issue #423, S77a): a read of the route's Book's Tasks, bound to its read epoch like every route read.
  ipcMain.handle(IPC_CHANNELS.inspectBookTasks, (event) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      const route = requireCurrentBookRoute(owned);
      const routeGeneration = owned.routeGeneration;
      const routeRequestSequence = owned.routeRequestSequence;
      const result = await service.call('inspectBookTasks', { bookId: route.bookId });
      requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
      if (result.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '任务不属于当前图书工作台。');
      return result;
    }),
  );
  // 就这段提问… (Issue #52, S17a; UI ADR 0014): a dialogue of the route's Book. Asking takes the exact selection of the
  // manuscript this window holds and the question; the renderer names neither the Book nor anything sent.
  const requireDialogueOfRoute = (route: { bookId: string }, result: DialogueProjection): DialogueProjection => {
    if (result.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '对话不属于当前图书工作台。');
    return result;
  };
  ipcMain.handle(IPC_CHANNELS.askAboutSelection, (event, input: AskAboutSelectionInput) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object' && input.selection !== null && typeof input.selection === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const routeGeneration = owned.routeGeneration;
        requireManuscriptCapability(owned, input.selection);
        const result = await service.call('askAboutSelection', { bookId: route.bookId, selection: input.selection, question: input.question });
        requireCurrentRouteGeneration(owned, routeGeneration);
        return requireDialogueOfRoute(route, result);
      });
    }),
  );
  ipcMain.handle(IPC_CHANNELS.inspectDialogue, (event, input: InspectDialogueInput) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      const route = requireCurrentBookRoute(owned);
      const routeGeneration = owned.routeGeneration;
      const routeRequestSequence = owned.routeRequestSequence;
      const result = await service.call('inspectDialogue', { bookId: route.bookId, dialogueId: input.dialogueId, afterFragment: input.afterFragment });
      requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
      return requireDialogueOfRoute(route, result);
    }),
  );
  for (const operation of ['stopDialogueAnswer', 'continueDialogueAnswer', 'regenerateDialogueAnswer'] as const) {
    ipcMain.handle(IPC_CHANNELS[operation], (event, input: DialogueAttemptInput) =>
      envelope(async () => {
        const owned = requireSender(event);
        requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call(operation, { bookId: route.bookId, dialogueId: input.dialogueId, attemptId: input.attemptId,
            ...(operation === 'continueDialogueAnswer' && input.question !== undefined ? { question: input.question } : {}) });
          requireCurrentRouteGeneration(owned, routeGeneration);
          return requireDialogueOfRoute(route, result);
        });
      }),
    );
  }
  ipcMain.handle(IPC_CHANNELS.convertDialogueToChangeSuggestion, (event, input: ConvertDialogueToChangeSuggestionInput) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const routeGeneration = owned.routeGeneration;
        const result = await service.call('convertDialogueToChangeSuggestion', {
          bookId: route.bookId, dialogueId: input.dialogueId, attemptId: input.attemptId, proposedText: input.proposedText, rationale: input.rationale,
        });
        requireCurrentRouteGeneration(owned, routeGeneration);
        requireDialogueOfRoute(route, result.dialogue);
        return result;
      });
    }),
  );
  // Task Intent Drafts (Issue #423, wave 10 slice 7a; #52 S17b): the route's Book always, never the renderer's; a draft read or
  // saved is the route's Book's, and 准备计划 starts the existing preparation job of the kind the draft resolves to.
  const requireDraftOfRoute = (route: { bookId: string }, draft: TaskIntentDraftProjection): TaskIntentDraftProjection => {
    if (draft.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '任务意图草稿不属于当前图书工作台。');
    return draft;
  };
  ipcMain.handle(IPC_CHANNELS.inspectTaskIntentDrafts, (event, input: Omit<InspectTaskIntentDraftsInput, 'bookId'>) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      const route = requireCurrentBookRoute(owned);
      const routeGeneration = owned.routeGeneration;
      const routeRequestSequence = owned.routeRequestSequence;
      const result = await service.call('inspectTaskIntentDrafts', { bookId: route.bookId, draftId: input.draftId });
      requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
      if (result.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '任务意图草稿不属于当前图书工作台。');
      for (const draft of result.drafts) requireDraftOfRoute(route, draft);
      return result;
    }),
  );
  ipcMain.handle(IPC_CHANNELS.saveTaskIntentDraft, (event, input: Omit<SaveTaskIntentDraftInput, 'bookId'>) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object' && input.target !== null && typeof input.target === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const routeGeneration = owned.routeGeneration;
        // A newly pinned range is the exact selection of the manuscript this window holds (TASK-003).
        if (input.target.kind === 'ranges') {
          for (const range of input.target.ranges) if (range !== null && typeof range === 'object' && range.kind === 'new') requireManuscriptCapability(owned, range.span);
        }
        const result = await service.call('saveTaskIntentDraft', {
          bookId: route.bookId, draftId: input.draftId, expectedOrdinal: input.expectedOrdinal, origin: input.origin, goal: input.goal,
          target: input.target, outcomeClass: input.outcomeClass, ...(input.procedurePin === undefined ? {} : { procedurePin: input.procedurePin }),
        });
        requireCurrentRouteGeneration(owned, routeGeneration);
        return requireDraftOfRoute(route, result);
      });
    }),
  );
  ipcMain.handle(IPC_CHANNELS.promoteTaskIntentDraft, (event, input: Omit<PromoteTaskIntentDraftInput, 'bookId'>) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const result = await service.call('promoteTaskIntentDraft', {
          bookId: route.bookId, draftId: input.draftId, versionId: input.versionId, choice: input.choice,
          ...(input.writing === undefined ? {} : { writing: input.writing }),
        });
        const operation = result.kind === 'baseline-analysis-preparation' ? 'baseline-analysis'
          : result.kind === 'review-run-preparation' ? 'review-run' : result.kind === 'writing-preparation' ? 'writing' : null;
        if (operation === null) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '准备计划的结果类型无效。');
        rememberEditorResource(owned, 'job', result.jobId, { operation, bookId: route.bookId, manuscriptId: null, branchId: null });
        return result;
      });
    }),
  );
  ipcMain.handle(IPC_CHANNELS.promoteAnswerToTaskIntentDraft, (event, input: Omit<PromoteAnswerToTaskIntentDraftInput, 'bookId'>) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const routeGeneration = owned.routeGeneration;
        const result = await service.call('promoteAnswerToTaskIntentDraft', { bookId: route.bookId, dialogueId: input.dialogueId, attemptId: input.attemptId });
        requireCurrentRouteGeneration(owned, routeGeneration);
        return requireDraftOfRoute(route, result);
      });
    }),
  );
  // Agent 工作区 (Issue #90, wave 13 slice 13a; UI ADR 0015): always the route's Book, never the renderer's. A round takes the
  // exact selection of the manuscript this window holds and the instruction; promotion and 放弃 name only the held round.
  const requireWorkspaceOfRoute = (route: { bookId: string }, result: AgentWorkspaceProjection): AgentWorkspaceProjection => {
    if (result.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', 'Agent 工作区不属于当前图书工作台。');
    return result;
  };
  ipcMain.handle(IPC_CHANNELS.inspectAgentWorkspace, (event) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      const route = requireCurrentBookRoute(owned);
      const routeGeneration = owned.routeGeneration;
      const routeRequestSequence = owned.routeRequestSequence;
      const result = await service.call('inspectAgentWorkspace', { bookId: route.bookId });
      requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
      return requireWorkspaceOfRoute(route, result);
    }),
  );
  ipcMain.handle(IPC_CHANNELS.proposeAgentWorkspaceChangeSet, (event, input: ProposeAgentWorkspaceChangeSetInput) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object' && input.selection !== null && typeof input.selection === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const routeGeneration = owned.routeGeneration;
        requireManuscriptCapability(owned, input.selection);
        const result = await service.call('proposeAgentWorkspaceChangeSet', { bookId: route.bookId, selection: input.selection, instruction: input.instruction });
        requireCurrentRouteGeneration(owned, routeGeneration);
        return requireWorkspaceOfRoute(route, result);
      });
    }),
  );
  ipcMain.handle(IPC_CHANNELS.promoteAgentWorkspaceProposals, (event, input: AgentWorkspaceProposalSetInput) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const routeGeneration = owned.routeGeneration;
        const result = await service.call('promoteAgentWorkspaceProposals', { bookId: route.bookId, proposalSetId: input.proposalSetId });
        requireCurrentRouteGeneration(owned, routeGeneration);
        if (result.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', 'Agent 工作区不属于当前图书工作台。');
        requireWorkspaceOfRoute(route, result.workspace);
        return result;
      });
    }),
  );
  ipcMain.handle(IPC_CHANNELS.discardAgentWorkspaceProposals, (event, input: AgentWorkspaceProposalSetInput) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const routeGeneration = owned.routeGeneration;
        const result = await service.call('discardAgentWorkspaceProposals', { bookId: route.bookId, proposalSetId: input.proposalSetId });
        requireCurrentRouteGeneration(owned, routeGeneration);
        return requireWorkspaceOfRoute(route, result);
      });
    }),
  );
  // 润色这段 (Issue #842): the exact selection of the manuscript this window holds, of the route's Book; the renderer names
  // neither the Book nor anything sent. Its request, and a regeneration's, are read again bound to the route's Book.
  ipcMain.handle(IPC_CHANNELS.inspectFastInteractionRoutes, (event) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      const route = requireCurrentBookRoute(owned);
      const routeGeneration = owned.routeGeneration;
      const routeRequestSequence = owned.routeRequestSequence;
      const result = await service.call('inspectFastInteractionRoutes', { bookId: route.bookId });
      requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
      if (result.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '润色和重新生成的可用情况不属于当前图书工作台。');
      return result;
    }),
  );
  ipcMain.handle(IPC_CHANNELS.polishSelection, (event, input: PolishSelectionInput) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object' && input.selection !== null && typeof input.selection === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const routeGeneration = owned.routeGeneration;
        requireManuscriptCapability(owned, input.selection);
        const result = await service.call('polishSelection', { bookId: route.bookId, selection: input.selection });
        requireCurrentRouteGeneration(owned, routeGeneration);
        if (result.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '润色不属于当前图书工作台。');
        return result;
      });
    }),
  );
  ipcMain.handle(IPC_CHANNELS.inspectFastInteractionRequest, (event, input: InspectFastInteractionRequestInput) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      const route = requireCurrentBookRoute(owned);
      const routeGeneration = owned.routeGeneration;
      const routeRequestSequence = owned.routeRequestSequence;
      const result = await service.call('inspectFastInteractionRequest', { bookId: route.bookId, requestId: input.requestId });
      requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
      const bookId = result.kind === 'editorial-polish' ? result.polish.bookId : result.regeneration.bookId;
      if (bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '这次请求不属于当前图书工作台。');
      return result;
    }),
  );
  // 🔒 锁定 and 就选中部分让 AI 修改 (Issue #1412): a manuscript this window holds, of the route's Book; a scoped edit is read
  // again bound to the route's Book.
  ipcMain.handle(IPC_CHANNELS.inspectAiEditLocks, (event, input: InspectAiEditLocksInput) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      requireManuscriptCapability(owned, input);
      return service.call('inspectAiEditLocks', { manuscriptId: input.manuscriptId, branchId: input.branchId });
    }),
  );
  ipcMain.handle(IPC_CHANNELS.setAiEditLocks, (event, input: SetAiEditLocksInput) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        requireManuscriptCapability(owned, input);
        return service.call('setAiEditLocks', { manuscriptId: input.manuscriptId, branchId: input.branchId, targets: input.targets,
          locked: input.locked, expectedLocksDigest: input.expectedLocksDigest });
      });
    }),
  );
  ipcMain.handle(IPC_CHANNELS.startScopedAiEdit, (event, input: StartScopedAiEditInput) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const routeGeneration = owned.routeGeneration;
        requireManuscriptCapability(owned, input);
        const result = await service.call('startScopedAiEdit', { bookId: route.bookId, manuscriptId: input.manuscriptId, branchId: input.branchId,
          baseRevisionId: input.baseRevisionId, expectedJournalSequence: input.expectedJournalSequence, expectedLocksDigest: input.expectedLocksDigest,
          instruction: input.instruction, scope: input.scope });
        requireCurrentRouteGeneration(owned, routeGeneration);
        if (result.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', 'AI 局部修改不属于当前图书工作台。');
        return result;
      });
    }),
  );
  ipcMain.handle(IPC_CHANNELS.inspectScopedAiEdit, (event, input: InspectScopedAiEditInput) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      const route = requireCurrentBookRoute(owned);
      const routeGeneration = owned.routeGeneration;
      const routeRequestSequence = owned.routeRequestSequence;
      const result = await service.call('inspectScopedAiEdit', { bookId: route.bookId, requestId: input.requestId });
      requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
      if (result.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '这次请求不属于当前图书工作台。');
      return result;
    }),
  );
  registerProductionAndPackageHandlers({ chooseExportFolder, choosePackageArchiveFile, requireSender, requireAuthority, requireCurrentBookRoute, service, requireCurrentRouteReadEpoch, serializeEffect, requireCurrentRouteGeneration, requireManuscriptCapability });

  // ④ 导出 (Issue #413, plan slice S64) belongs to 交付物's Book the same way: the renderer never names a Book
  // and never a path. The review may save a revision, so it is serialized with every other effect; the
  // destination comes only from the system's own Save dialog, which the main process owns, and whose
  // replace-or-rename choice the platform makes (V2-UX-EXP-019); the answer of each call must be that Book's.
  const requireExportOfRoute = <Result extends { bookId: string }>(
    route: Extract<ResolvedBookWorkbenchRoute, { kind: 'book' }>,
    result: Result,
  ): Result => {
    if (result.bookId !== route.bookId) {
      throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '导出不属于当前图书工作台。');
    }
    return result;
  };
  ipcMain.handle(IPC_CHANNELS.reviewManuscriptExport, (event, input: Parameters<RendererApi['reviewManuscriptExport']>[0]) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const routeGeneration = owned.routeGeneration;
        const result = await service.call('reviewManuscriptExport', {
          bookId: route.bookId,
          target: input.target,
          options: input.options,
          ...(input.format === undefined ? {} : { format: input.format }),
        });
        requireCurrentRouteGeneration(owned, routeGeneration);
        return requireExportOfRoute(route, result);
      });
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.chooseManuscriptExportDestination,
    (event, input: Parameters<RendererApi['chooseManuscriptExportDestination']>[0]) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async (): Promise<Awaited<ReturnType<RendererApi['chooseManuscriptExportDestination']>>> => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const destination = await chooseExportDestination(owned, input.suggestedFileName, input.format);
          // A cancelled dialog records nothing at all (V2-UX-EXP-020).
          if (destination === undefined) return { outcome: 'cancelled' };
          requireCurrentRouteGeneration(owned, routeGeneration);
          const preparation = await service.call('prepareManuscriptExport', {
            bookId: route.bookId,
            revisionId: input.revisionId,
            target: input.target,
            options: input.options,
            reviewDigest: input.reviewDigest,
            destination,
            ...(input.format === undefined ? {} : { format: input.format }),
          });
          requireCurrentRouteGeneration(owned, routeGeneration);
          return { outcome: 'prepared', preparation: requireExportOfRoute(route, preparation) };
        });
      }),
  );
  ipcMain.handle(IPC_CHANNELS.approveManuscriptExport, (event, input: Parameters<RendererApi['approveManuscriptExport']>[0]) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const routeGeneration = owned.routeGeneration;
        // A PDF is printed here, from the page the service staged for this exact preparation, before it is approved
        // (Issue #500, S64b): the service has no Chromium to print with. Nothing is written to the destination yet.
        const staged = await service.call('stageManuscriptExport', { bookId: route.bookId, preparationId: input.preparationId });
        if (staged.print !== null) await printExportPage(staged.print.pagePath, staged.print.pdfPath);
        requireCurrentRouteGeneration(owned, routeGeneration);
        const result = await service.call('approveManuscriptExport', { bookId: route.bookId, preparationId: input.preparationId });
        requireCurrentRouteGeneration(owned, routeGeneration);
        return requireExportOfRoute(route, result);
      });
    }),
  );
  ipcMain.handle(IPC_CHANNELS.revealManuscriptExport, (event, input: Parameters<RendererApi['revealManuscriptExport']>[0]) =>
    envelope(async (): Promise<{ state: 'revealed' }> => {
      const owned = requireSender(event);
      requireAuthority();
      const route = requireCurrentBookRoute(owned);
      const receipt = requireExportOfRoute(route, await service.call('inspectManuscriptExportReceipt', {
        bookId: route.bookId,
        preparationId: input.preparationId,
      }));
      // Only a verified file is shown, at the path the system dialog returned for it.
      if (!receipt.revealAvailable || !isAbsolute(receipt.destination)) {
        throw new ServiceCallError('AI7_EXPORT_REVEAL_UNAVAILABLE', '这次导出没有可以显示的文件。');
      }
      shell.showItemInFolder(receipt.destination);
      return { state: 'revealed' };
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
  ipcMain.handle(IPC_CHANNELS.commitReplacementRevisions, (event, input: ServiceOperationMap['commitReplacementRevisions']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        requireEditorResource(owned, 'preview', input.previewId);
        const result = await service.call('commitReplacementRevisions', input);
        if (result.previewId !== input.previewId) throw new ServiceCallError('AI7_EDITOR_CAPABILITY_INVALID', '替换提交结果不属于当前稿件分支。');
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
  // 保存人员 (Issue #431, S83): a Book's 作者, 责编 and 相关人 on its 工作概览 — the Book this window shows, or none yet.
  ipcMain.handle(IPC_CHANNELS.updateBookPeople, (event, input: Parameters<RendererApi['updateBookPeople']>[0]) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        const route = owned.route;
        requireDesktop(route === null || (route.kind === 'book' && route.bookId === input.bookId), 'AI7_RENDERER_BOUNDARY_INVALID');
        const result = await service.call('updateBookPeople', {
          bookId: input.bookId, expectedVersion: input.expectedVersion, authors: input.authors, editors: input.editors, related: input.related,
        });
        requireDesktop(result.bookId === input.bookId, 'AI7_SERVICE_ROUTE_INVALID');
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
    disposeConnectionTest();
    nativeTheme.removeListener('updated', broadcastAppearance);
    ipcMain.removeHandler(APPEARANCE_IPC_CHANNEL);
    for (const channel of Object.values(IPC_CHANNELS)) if (channel !== IPC_CHANNELS.testModelServiceConnection) ipcMain.removeHandler(channel);
    for (const channel of Object.values(PREFERENCE_IPC_CHANNELS)) ipcMain.removeHandler(channel);
    ipcMain.removeHandler(NOTIFICATION_CHANNELS.notify);
    notifier.dispose();
    ipcMain.removeListener(MAIN_EVENTS.closeRiskChanged, closeRiskListener);
  };
}

/**
 * The startup step main has reached, said on stderr under an E2E Journey (Issue #518), so a Journey that waits past its
 * budget can name the last step reached. The words are the fixed startup locations, never a path or a payload; stdout
 * stays the readiness handshake alone.
 */
function reachStartup(location: string): string {
  if (process.env.AI7_E2E_JOURNEY !== undefined) process.stderr.write(`AI7_STARTUP/${location}\n`);
  return location;
}

export async function runApplication(): Promise<void> {
  let startupLocation = reachStartup('runtime');
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
      journeyClose('stop-entry');
      if (launcherLease) clearInterval(launcherLease);
      launcherLease = undefined;
      unregisterHandlers?.();
      unregisterHandlers = undefined;
      await service?.stop();
      quitReady = true;
      journeyClose('stop-complete');
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
    journeyClose('before-quit');
    if (quitReady) {
      journeyClose('quit-ready');
      return;
    }
    event.preventDefault();
    const riskyWindows = [...ownedWindows.values()].filter(
      (owned) => owned.closeRisk && !owned.window.isDestroyed(),
    );
    if (!quitting && riskyWindows.length > 0) {
      journeyClose('close-risk-blocked');
      for (const owned of riskyWindows) owned.window.webContents.send(MAIN_EVENTS.closeBlocked);
      return;
    }
    // The existing guard allowed this close, including a quit already in progress.
    journeyClose('close-risk-allowed');
    if (quitting) {
      journeyClose('quit-pending');
      return;
    }
    quitting = true;
    void stop().then(() => {
      journeyClose('app-quit');
      app.quit();
    }, () => {
      journeyClose('app-exit');
      app.exit(1);
    });
  };
  const allWindowsClosed = (): void => app.quit();

  try {
    if (app.isPackaged) {
      // No source launcher ships: carry its Chromium network-denial switches into this launch form.
      for (const name of ['disable-background-networking', 'disable-client-side-phishing-detection', 'disable-component-update',
        'disable-default-apps', 'disable-domain-reliability', 'disable-sync', 'metrics-recording-only', 'no-first-run']) {
        app.commandLine.appendSwitch(name);
      }
    }
    validateRuntime();
    startupLocation = reachStartup('arguments');
    const packaged = app.isPackaged ? packagedLaunchForm(process.argv.slice(1)) : null;
    let launch: LaunchArguments;
    if (packaged !== null) {
      launch = {
        dataRoot: undefined, allowFirstRunChooser: false, launchForm: packaged.launchForm,
        injectedPickerPath: undefined, injectedSavePath: undefined, injectedFolderPath: undefined,
        injectedDiagnosticsFolder: undefined, importControl: undefined, foregroundExecutionControl: undefined,
        recoveryControl: undefined, modelAdapterControl: undefined, connectivityPath: undefined, unitHoldPath: undefined,
        answerHoldPath: undefined, backgroundQuietMs: undefined, calibrationMinBooks: undefined,
        applyControl: undefined, observeJ12Reveal: false, launcherPid: 0, journalFaultArmed: false,
      };
    } else {
      const entryIndex = process.argv.findIndex((value) => resolve(value) === resolve(__filename));
      requireDesktop(entryIndex > 0);
      launch = parseArguments(process.argv.slice(entryIndex + 1));
      requireDesktop(processIsAlive(launch.launcherPid));
      launcherLease = setInterval(() => {
        if (process.ppid !== launch.launcherPid || !processIsAlive(launch.launcherPid)) terminate();
      }, 1_000);
      launcherLease.unref();
    }
    app.enableSandbox();
    startupLocation = reachStartup('data-root');
    const codeRoot = resolve(__dirname, '..', '..');
    const buildIdentity = await readApplicationBuildIdentity(resolve(__dirname, '..'));
    const softwareVersion = buildIdentity.softwareVersion;
    const resourcesPath = process.platform === 'win32' ? resolve(dirname(process.execPath), 'resources')
      : resolve(dirname(process.execPath), '..', 'Resources');
    const channel = await readDistributionChannel(app.isPackaged, resourcesPath);
    let packagedLocation: PackagedDataLocation | null = null;
    if (packaged !== null) {
      // Only the installer keeps wave 13's first-run chooser. Self-check never prompts.
      const defaultRoot = channel === 'windows-installer' ? defaultProductionDataRoot() : null;
      launch.allowFirstRunChooser = !packaged.selfCheck && defaultRoot !== null && await readStartupDataChoice(defaultRoot) === null;
      if (!launch.allowFirstRunChooser) {
        packagedLocation = await resolvePackagedDataLocation({ channel, codeRoot, executablePath: process.execPath });
        launch.dataRoot = packagedLocation.dataRoot;
      }
    }
    if (launch.allowFirstRunChooser) {
      // The launcher owns the temporary sibling and cleans it only after this Electron process exits.
      const bootstrapRoot = packaged !== null
        ? await ensureCanonicalDataDirectory(await createCanonicalProductionDataRoot(defaultProductionDataRoot(), codeRoot), 'shell')
        : app.commandLine.getSwitchValue('user-data-dir');
      requireDesktop(isAbsolute(bootstrapRoot));
      app.setPath('userData', bootstrapRoot);
      const defaultRoot = defaultProductionDataRoot();
      let decision = chooseStartupDataRoot({}, await readStartupDataChoice(defaultRoot), { dataRoot: defaultRoot });
      if (decision.kind === 'choose') {
        await app.whenReady();
        installChromiumDenial(session.defaultSession);
        while (decision.kind === 'choose') {
          const labels = STARTUP_LOCATION_LABELS;
          const answer = await dialog.showMessageBox({
            type: 'question', title: labels.title, message: labels.message, detail: labels.defaultLocation(defaultRoot),
            buttons: [labels.useDefault, labels.chooseFolder, labels.cancel], defaultId: 0, cancelId: 2, noLink: true,
          });
          let choice: StartupLocationChoice = { kind: 'cancel' };
          if (answer.response === 0) choice = { kind: 'default' };
          else if (answer.response === 1) {
            const folder = await dialog.showOpenDialog({ title: labels.folderTitle, properties: ['openDirectory', 'createDirectory'] });
            if (!folder.canceled && folder.filePaths.length === 1) choice = { kind: 'folder', path: folder.filePaths[0]! };
          }
          decision = chooseStartupDataRoot({ choice }, null, { dataRoot: defaultRoot });
          if (decision.kind === 'ready') {
            try {
              requireStartupChoiceOutsideDataRoot(defaultRoot, decision.dataRoot);
              const canonical = await createCanonicalProductionDataRoot(decision.dataRoot, codeRoot);
              await storeStartupDataChoice(defaultRoot, canonical);
              decision = { kind: 'ready', dataRoot: canonical };
            } catch {
              await dialog.showMessageBox({ type: 'error', title: labels.refusedTitle, message: labels.refusedMessage, buttons: [labels.refusedBack] });
              decision = { kind: 'choose', defaultRoot };
            }
          }
        }
      }
      // 70 = chooser complete, 71 = cancelled. Only the explicitly flagged launcher consumes these codes:
      // it survives this child's exit, reloads the choice and starts the ordinary explicit-root child, preserving its lease.
      if (packaged !== null) {
        if (decision.kind !== 'quit') app.relaunch({ args: [] });
        app.exit(0);
      } else app.exit(decision.kind === 'quit' ? 71 : 70);
      return;
    }
    requireDesktop(launch.dataRoot !== undefined);
    // An ordinary-production data root is also kept apart from the developer caches (Issue #811), as the launcher kept it.
    const dataRoot = launch.launchForm.trustedOperationalScope === 'ordinary-production'
      ? await createCanonicalProductionDataRoot(launch.dataRoot, codeRoot)
      : await createCanonicalExternalDataRoot(launch.dataRoot, codeRoot);
    startupLocation = reachStartup('shell-root');
    const shellRoot = await ensureCanonicalDataDirectory(dataRoot, 'shell');
    const earlyUserDataSwitch = app.commandLine.getSwitchValue('user-data-dir');
    if (packaged === null) {
      requireDesktop(isAbsolute(earlyUserDataSwitch));
      await requireSameCanonicalDataDirectory(shellRoot, earlyUserDataSwitch, app.getPath('userData'));
    }
    app.setPath('userData', shellRoot);
    await requireSameCanonicalDataDirectory(shellRoot, app.getPath('userData'));
    // The Data Version (数据版本) and the store's schema revision (数据库修订) apart (Issue #967): the unit suite holds each to its owner.
    const crashFacts = () => ({
      appVersion: softwareVersion, buildIdentity, dataVersion: buildIdentity.dataVersion, schemaRevision: 114, protocol: SERVICE_PROTOCOL_VERSION,
      platform: process.platform, arch: process.arch, electron: process.versions.electron ?? 'unknown',
      uptimeSeconds: process.uptime(),
    });
    const crashes = new CrashRecords(shellRoot, crashFacts);
    crashes.ensureDirectory();
    const removeCrashHooks = installCrashHooks(crashes, app, process, terminate);
    app.once('will-quit', removeCrashHooks);
    startupLocation = reachStartup('single-instance');
    if (!app.requestSingleInstanceLock()) {
      process.stderr.write('AI7_STARTUP_FAILED/single-instance-lock\n');
      await stop();
      app.exit(packaged?.selfCheck ? 1 : 0);
      return;
    }
    startupLocation = reachStartup('electron-ready');
    await app.whenReady();
    Menu.setApplicationMenu(null);

    const productSession = session.defaultSession;
    installChromiumDenial(productSession);
    // The PDF export's print session (Issue #500, S64b): in memory, denied every network scheme like the product's own.
    const exportPrintSession = session.fromPartition('ai7-export-print');
    installChromiumDenial(exportPrintSession);
    const exportStagingRoot = await ensureCanonicalDataDirectory(dataRoot, 'export-staging');
    startupLocation = reachStartup('service-ready');
    const serviceEntry = resolve(__dirname, '..', 'service', 'index.mjs');
    service = await ServiceClient.start(
      process.execPath,
      serviceEntry,
      dataRoot,
      launch.launchForm,
      launch.importControl,
      launch.foregroundExecutionControl,
      launch.recoveryControl,
      launch.modelAdapterControl,
      launch.connectivityPath,
      launch.unitHoldPath,
      launch.answerHoldPath,
      // A Journey reads how far the service's own startup came (Issue #675), beside main's steps and under the same switch.
      journeyStartupRelay(process.env, (line) => void process.stderr.write(line)),
      launch.backgroundQuietMs,
      launch.calibrationMinBooks,
      launch.journalFaultArmed,
    );
    service.onUnexpectedExit(() => {
      crashHook(crashes, 'service-exit', () => undefined)({ reason: 'abnormal-exit' });
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
    if (packaged?.selfCheck) {
      await requireWritableDataRoot(dataRoot);
      await openProtectedSecretStore(); // Loads the carrier; never reads or writes a credential.
      const versions = await service.call('inspectDataVersion', {});
      requireDesktop(typeof versions.dataVersion === 'number' && versions.history.length > 0);
      // Keep Electron alive after the probe window closes, until the report is flushed.
      app.once('window-all-closed', () => undefined);
      // Exercise the packaged stylesheet and font bytes in Chromium, not installed system faces.
      const fontWindow = new BrowserWindow({ show: false, webPreferences: {
        sandbox: true, contextIsolation: true, nodeIntegration: false, devTools: false, session: productSession,
      } });
      let typography;
      try {
        await fontWindow.loadFile(resolve(__dirname, '..', 'renderer', 'index.html'));
        typography = await fontWindow.webContents.executeJavaScript<{
          fontsCheck: boolean; bundledFacesLoaded: boolean; fontSize: string; lineHeight: string;
          textIndent: string; textAlign: string; textJustify: string; outlineStyle: string; columnWidth: string; uiFontSize: string; rootFontSize: string;
        }>(`(async () => {
          const faces = ['17px "Noto Serif SC"', '700 17px "Noto Serif SC"', '14px "Noto Sans SC"', '700 14px "Noto Sans SC"'];
          const loaded = await Promise.all(faces.map(face => document.fonts.load(face, '中文编辑')));
          await document.fonts.ready;
          const editor = document.createElement('div');
          editor.className = 'ProseMirror'; editor.contentEditable = 'true';
          const paragraph = document.createElement('p'); paragraph.textContent = '中文编辑';
          editor.append(paragraph); document.body.append(editor); editor.focus();
          const style = getComputedStyle(paragraph), frame = getComputedStyle(editor);
          return { fontsCheck: document.fonts.check('17px "Noto Serif SC"'),
            bundledFacesLoaded: loaded.every(entries => entries.length > 0 && entries.every(face => face.status === 'loaded')),
            fontSize: style.fontSize, lineHeight: style.lineHeight, textIndent: style.textIndent,
            textAlign: style.textAlign, textJustify: style.textJustify, outlineStyle: frame.outlineStyle,
            columnWidth: frame.maxWidth, uiFontSize: getComputedStyle(document.body).fontSize,
            rootFontSize: getComputedStyle(document.documentElement).fontSize };
        })()`);
        requireDesktop(typography.fontsCheck && typography.bundledFacesLoaded && typography.fontSize === '17px' &&
          parseFloat(typography.lineHeight) / 17 >= 1.9 && typography.textIndent === '34px' &&
          typography.textAlign === 'justify' && typography.outlineStyle === 'none' &&
          typography.uiFontSize === '14px' && typography.rootFontSize === '16px');
      } finally { fontWindow.destroy(); }
      const report = { softwareVersion, buildIdentity, channel, electron: process.versions.electron, node: process.versions.node,
        modules: process.versions.modules, keyringCarrier: 'loaded', dataRoot, writable: true, store_versions: 'readable', typography };
      await stop();
      process.stdout.write(`${JSON.stringify(report)}\n`, () => app.exit(0));
      return;
    }
    app.on('before-quit', beforeQuit);
    app.once('will-quit', () => journeyClose('will-quit'));
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
      const e2eWindow = process.env.AI7_E2E_JOURNEY
        ? /^([1-9]\d*)x([1-9]\d*)$/.exec(process.env.AI7_E2E_WINDOW ?? '') : null;
      const window = new BrowserWindow({
        width: e2eWindow ? Number(e2eWindow[1]) : 1180,
        height: e2eWindow ? Number(e2eWindow[2]) : 820,
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
      const webContentsId = window.webContents.id;
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
        attentionOffers: new Set(),
        importCommitIds: new Set(),
        manuscriptCapabilities: new Map(),
        editorResourceCapabilities: new Map(),
        restorationBindings: new Map(),
        restorationBindingCount: 0,
      };
      ownedWindows.set(webContentsId, owned);
      if (route) {
        requireDesktop(!bookWindows.has(route.bookId), 'AI7_WORKBENCH_DUPLICATE_BOOK');
        assignRoute(owned, route);
      }
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (event) => event.preventDefault());
      window.webContents.on('will-attach-webview', (event) => event.preventDefault());
      window.webContents.on('render-process-gone', (_event, detail) =>
        crashHook(crashes, 'render-process-gone', terminate)(detail));
      window.on('close', (event: ElectronEvent) => {
        if (!quitting && owned.closeRisk) {
          event.preventDefault();
          window.webContents.send(MAIN_EVENTS.closeBlocked);
        }
      });
      window.on('closed', () => {
        releaseOwnedClaims(owned);
        ownedWindows.delete(webContentsId);
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
        runtimeForm: app.isPackaged ? 'packaged' : 'source-checkout',
        runtimeFormLabel: app.isPackaged ? '打包运行' : '源码检出运行',
        channel, channelLabel: CHANNEL_LABELS[channel],
        channelDescription: channelDescription(channel, packagedLocation?.exception ?? null),
        dataLocationException: packagedLocation?.exception ?? null,
        syncWarning: dataLocationSyncWarning(dataRoot),
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
    // The preference owner (Issue #934) is the only reader of preferences.json; diagnostics takes its validated projection.
    const preferenceStore = createPreferenceStore(shellRoot);
    // Main-only, zero-argument operations: the renderer supplies neither a source nor an output path.
    const requireDiagnosticsSender = (event: IpcMainInvokeEvent): OwnedRendererWindow => {
      const owned = getOwnedWindow(event);
      requireDesktop(!owned.window.isDestroyed() && event.senderFrame === owned.window.webContents.mainFrame,
        'AI7_RENDERER_BOUNDARY_INVALID');
      return owned;
    };
    let diagnosticsFolderPending = launch.injectedDiagnosticsFolder;
    ipcMain.handle(DIAGNOSTICS_CHANNELS.listCrashRecords, (event) => envelope(() => {
      requireDiagnosticsSender(event);
      return crashes.list();
    }));
    ipcMain.handle(DIAGNOSTICS_CHANNELS.revealDiagnosticsLocation, (event) => envelope(() => {
      requireDiagnosticsSender(event);
      crashes.ensureDirectory();
      if (!launch.observeJ12Reveal) shell.showItemInFolder(crashes.directory);
      return { state: 'requested' as const };
    }));
    ipcMain.handle(DIAGNOSTICS_CHANNELS.exportDiagnosticsBundle, (event) => envelope(async () => {
      const owned = requireDiagnosticsSender(event);
      let parent = diagnosticsFolderPending;
      diagnosticsFolderPending = undefined;
      if (parent === undefined) {
        const chosen = await dialog.showOpenDialog(owned.window, {
          title: '选择诊断包保存位置', buttonLabel: '保存到此文件夹', defaultPath: app.getPath('documents'),
          properties: ['openDirectory', 'createDirectory'],
        });
        if (chosen.canceled || chosen.filePaths.length !== 1) return { state: 'cancelled' as const };
        parent = chosen.filePaths[0];
      }
      requireDesktop(parent !== undefined && isAbsolute(parent));
      // Read the shipped policy set, never infer its version from the source branch or preferences.
      await writeDiagnosticsBundle(parent, {
        facts: { ...crashFacts(), policySetVersion: 'no-policy-lock', node: process.versions.node,
          locale: app.getLocale(), windowCount: ownedWindows.size },
        crashes: crashes.list(), preferences: (({ version, values }) => ({ version, values }))(preferenceStore.read()),
      });
      return { state: 'exported' as const };
    }));
    app.once('will-quit', () => {
      for (const channel of Object.values(DIAGNOSTICS_CHANNELS)) ipcMain.removeHandler(channel);
    });
    let protectedSecretStore: ProtectedSecretStore | undefined;
    try {
      protectedSecretStore = await openProtectedSecretStore();
    } catch {
      protectedSecretStore = undefined;
    }
    /** A connection the store says is protected but the OS store no longer holds needs attention (S55a), whatever its route. */
    const confirmedConnection = async (connection: ModelServiceConnectionProjection): Promise<ModelServiceConnectionProjection> => {
      if (connection.credentialOperationState !== 'ready') return connection;
      let present = false;
      if (protectedSecretStore !== undefined) {
        try {
          present = await protectedSecretStore.has(connection.credentialReference);
        } catch {
          present = false;
        }
      }
      if (present) return connection;
      try {
        return await service!.call('setModelServiceCredentialState', {
          credentialReference: connection.credentialReference,
          credentialOperationState: 'needs-attention',
        });
      } catch {
        return { ...connection, credentialOperationState: 'needs-attention' };
      }
    };
    const settingsProjection = async (): Promise<ModelServiceSettingsProjection> => {
      const state = await service!.call('getModelServiceStoredState', {});
      const connections = await Promise.all(state.connections.map(confirmedConnection));
      const connectionOf = (route: ModelServiceRouteId): ModelServiceConnectionProjection | null =>
        connections.find((connection) => connection.binding.providerId === route) ?? null;
      const statusOf = (connection: ModelServiceConnectionProjection | null): ModelRoleStatus => protectedSecretStore === undefined
        ? 'unavailable'
        : connection === null || connection.credentialOperationState === 'missing'
          ? 'setup-required'
          : connection.credentialOperationState === 'ready' ? 'available' : 'needs-attention';
      const labelOf = (status: ModelRoleStatus): ModelRoleStatusLabel => status === 'available' ? '可用'
        : status === 'setup-required' ? '需设置' : status === 'needs-attention' ? '需处理' : '不可用';
      // The route new Tasks use (Issue #811): the editor's choice, else the default Go route once its credential is ready.
      const selected = connections.find((connection) => connection.selected) ?? null;
      const inUseRoute: ModelServiceRouteId | null = selected?.binding.providerId ??
        (connectionOf('opencode-go')?.credentialOperationState === 'ready' ? 'opencode-go' : null);
      const connection = inUseRoute === null ? null : connectionOf(inUseRoute);
      const mainStatus = statusOf(connection);
      const mainStatusLabel = labelOf(mainStatus);
      const mainBinding = connection?.binding ?? MODEL_SERVICE_ROUTE_BINDINGS[inUseRoute ?? 'opencode-go'];
      const fastConnection = connections.find((candidate) => candidate.fastSelected) ?? connectionOf('opencode-go');
      const fastStatus = statusOf(fastConnection);
      const fastBinding = fastConnection?.fastBinding ?? fastConnection?.binding ?? null;
      const mainStatusDetail = protectedSecretStore === undefined
        ? '当前操作系统安全凭据库不可用；未启用替代存储。'
        : mainStatus === 'available'
          ? '连接名称与凭据已由操作系统安全凭据库保护。'
          : mainStatus === 'needs-attention'
            ? '凭据状态无法确认；请重新输入或移除。'
            : '请输入连接名称与凭据。';
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
      // Under ordinary-production the Fast Interaction Role takes the one route the editor chose, as the main role does.
      const fastInteraction = fastConnection !== null
        ? {
            roleId: 'fast-interaction' as const,
            roleLabel: '快速交互角色' as const,
            purposeLabel: '快速交互与低风险候选生成',
            status: fastStatus,
            statusLabel: labelOf(fastStatus),
            statusDetail: '独立保存快速交互模型；主编辑角色的切换不会改变此选择。',
            binding: fastBinding,
            connection: fastConnection,
          }
        : unconfigured('fast-interaction', '快速交互角色', '快速交互与低风险候选生成');
      const supportedLabels = new Set(MODEL_SERVICE_ROUTES.map((route) => CONFIGURED_PROVIDER_LABELS[route]));
      const unsupportedProviders: ModelServiceUnsupportedProviderProjection[] = [];
      for (const route of CONFIGURED_ROUTE_IDS) {
        const providerLabel = CONFIGURED_PROVIDER_LABELS[route];
        if (supportedLabels.has(providerLabel) || unsupportedProviders.some((provider) => provider.providerLabel === providerLabel)) continue;
        unsupportedProviders.push({ providerId: route, providerLabel, statusLabel: '尚未支持' });
      }
      return {
        searchBackends: await service!.call('getSearchBackendSettings', {}),
        proxy: state.proxy,
        lastProxyProbe: state.lastProxyProbe ?? null,
        roles: [
          fastInteraction,
          {
            roleId: 'main-editorial',
            roleLabel: '主编辑角色',
            purposeLabel: '中文长篇写作、编辑建议与复杂指令处理',
            status: mainStatus,
            statusLabel: mainStatusLabel,
            statusDetail: mainStatusDetail,
            binding: mainBinding,
            connection,
          },
          unconfigured('difficult-escalation', '疑难升级角色', '疑难或高后果工作升级'),
          unconfigured('frontier', '前沿模型角色', '挑战性或明确授权的高后果工作'),
        ],
        routeChoice: {
          routes: MODEL_SERVICE_ROUTES.map((route) => {
            const routeConnection = connectionOf(route);
            const status = statusOf(routeConnection);
            return {
              route,
              binding: routeConnection?.binding ?? MODEL_SERVICE_ROUTE_BINDINGS[route],
              models: state.channels.find((channel) => channel.route === route)?.models.map(({ modelId, modelLabel }) => ({ ...MODEL_SERVICE_ROUTE_BINDINGS[route], modelId, modelLabel })) ?? modelServiceModels(route),
              isDefault: route === 'opencode-go',
              inUse: route === inUseRoute,
              status,
              statusLabel: labelOf(status),
              connection: routeConnection,
            };
          }),
          unsupportedProviders,
          effectLabel: MODEL_SERVICE_ROUTE_EFFECT_LABEL,
        },
        protectedSecretStore: {
          backend: process.platform === 'win32' ? 'windows-credential-manager' : 'macos-keychain',
          label: process.platform === 'win32' ? 'Windows 凭据管理器' : 'macOS 钥匙串',
          availability: protectedSecretStore === undefined ? 'unavailable' : 'available',
        },
        launchPolicy: state.launchPolicy, channels: state.channels,
        authorityStatement: '凭据就绪不授予模型处理、对外导出、运行、受控动作或公开发布权限。',
      };
    };
    const routeOf = (value: unknown): ModelServiceRouteId => {
      if (!MODEL_SERVICE_ROUTES.includes(value as ModelServiceRouteId)) {
        throw new ServiceCallError('MODEL_SERVICE_CREDENTIAL_INVALID', '模型服务路线无效。');
      }
      return value as ModelServiceRouteId;
    };
    /**
     * Save a route's connection name and credential — the DeepSeek 开放平台（官方） route when none is named, as S55a always saved
     * it — or, given only `{ route, select: true }`, make that saved route the one new Tasks use (Issue #811). The store mints a
     * route's Credential Reference the first time; main writes the value under it and nowhere else.
     */
    const saveModelServiceCredential = async (input: ModelServiceCredentialInput): Promise<ModelServiceSettingsProjection> => {
      if (protectedSecretStore === undefined) {
        throw new ServiceCallError('PROTECTED_SECRET_STORE_UNAVAILABLE', '操作系统安全凭据库当前不可用。');
      }
      const keys = input !== null && typeof input === 'object' ? Object.keys(input).sort().join(',') : '';
      if (keys === 'route,select') {
        const selection = input as { route: unknown; select: unknown };
        if (selection.select !== true) throw new ServiceCallError('MODEL_SERVICE_CREDENTIAL_INVALID', '连接名称或凭据输入无效。');
        await service!.call('selectModelServiceRoute', { route: routeOf(selection.route) });
        return settingsProjection();
      }
      const credential = input as { connectionName?: unknown; secret?: unknown; route?: unknown };
      if ((keys !== 'connectionName,secret' && keys !== 'connectionName,route,secret') ||
          typeof credential.connectionName !== 'string' || typeof credential.secret !== 'string' ||
          !credential.connectionName.isWellFormed() || credential.connectionName.trim().length < 1 || credential.connectionName.trim().length > 80 ||
          !credential.secret.isWellFormed() || credential.secret.length < 1 || credential.secret.length > 16_384) {
        throw new ServiceCallError('MODEL_SERVICE_CREDENTIAL_INVALID', '连接名称或凭据输入无效。');
      }
      const route = keys === 'connectionName,secret' ? 'deepseek-open-platform' : routeOf(credential.route);
      const connectionName = credential.connectionName.trim();
      const current = (await service!.call('getModelServiceStoredState', {})).connections
        .find((connection) => connection.binding.providerId === route) ?? null;
      const pending = await service!.call('saveModelServiceConnection', {
        route,
        connectionName,
        credentialReference: current?.credentialReference ?? null,
        credentialOperationState: 'needs-attention',
      });
      try {
        await protectedSecretStore.set(pending.credentialReference, credential.secret);
      } catch {
        throw new ServiceCallError('PROTECTED_SECRET_WRITE_FAILED', '凭据未能写入操作系统安全凭据库。');
      }
      try {
        await service!.call('saveModelServiceConnection', {
          route,
          connectionName,
          credentialReference: pending.credentialReference,
          credentialOperationState: 'ready',
        });
      } catch {
        throw new ServiceCallError('MODEL_SERVICE_STATE_UNCERTAIN', '凭据已受保护，但连接状态需要处理。');
      }
      const modelDiscovery = await service!.call('refreshModelServiceModels', { route });
      return { ...(await settingsProjection()), modelDiscovery };
    };
    /** Remove a route's credential — the DeepSeek 开放平台（官方） route's when none is named — keeping its connection 需设置. */
    const removeModelServiceCredential = async (input?: { route: ModelServiceRouteId }): Promise<ModelServiceSettingsProjection> => {
      if (protectedSecretStore === undefined) {
        throw new ServiceCallError('PROTECTED_SECRET_STORE_UNAVAILABLE', '操作系统安全凭据库当前不可用。');
      }
      if (input !== undefined && (input === null || typeof input !== 'object' || Object.keys(input).join(',') !== 'route')) {
        throw new ServiceCallError('MODEL_SERVICE_CREDENTIAL_INVALID', '模型服务路线无效。');
      }
      const route = input === undefined ? 'deepseek-open-platform' : routeOf(input.route);
      const current = (await service!.call('getModelServiceStoredState', {})).connections
        .find((connection) => connection.binding.providerId === route) ?? null;
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
    const searchOps: Pick<RendererApi, 'selectSearchBackend' | 'probeSearchBackend' | 'saveSearchBackendCredential' | 'removeSearchBackendCredential'> = {
      async selectSearchBackend(input) { await service!.call('selectSearchBackend', input); return settingsProjection(); },
      probeSearchBackend: (input) => service!.call('probeSearchBackend', input),
      async saveSearchBackendCredential(input) {
        const reuse = input !== null && typeof input === 'object' && Object.keys(input).sort().join(',') === 'backendId,reuseModelCredential' &&
          typeof input.backendId === 'string' && 'reuseModelCredential' in input && input.reuseModelCredential === true;
        if (!reuse && (input === null || typeof input !== 'object' || Object.keys(input).sort().join(',') !== 'backendId,secret' || !('secret' in input) || typeof input.secret !== 'string' ||
            !input.secret.isWellFormed() || input.secret.trim().length < 1 || input.secret.length > 16_384)) throw new ServiceCallError('SEARCH_CREDENTIAL_INVALID', '联网检索凭据输入无效。');
        if (protectedSecretStore === undefined) throw new ServiceCallError('PROTECTED_SECRET_STORE_UNAVAILABLE', '操作系统安全凭据库当前不可用。');
        const routeSettings = reuse ? await settingsProjection() : null;
        const source = reuse ? routeSettings!.routeChoice.routes.find((route) => route.route.startsWith(input.backendId.slice('search-'.length) + '-') )?.connection : null;
        if (reuse && source?.credentialOperationState !== 'ready') throw new ServiceCallError('SEARCH_CREDENTIAL_MISSING', '请先保存对应模型渠道的凭据。');
        const existing = reuse ? (await service!.call('getSearchBackendSettings', {})).backends.find((backend) => backend.backendId === input.backendId)?.connection : null;
        const pending = await service!.call('saveSearchBackendCredential', { backendId: input.backendId, credentialReference: existing?.credentialReference ?? null, credentialOperationState: 'needs-attention' });
        try {
          if (reuse) await protectedSecretStore.copy(source!.credentialReference, pending.credentialReference!);
          else if ('secret' in input) await protectedSecretStore.set(pending.credentialReference!, input.secret);
        }
        catch { throw new ServiceCallError('PROTECTED_SECRET_WRITE_FAILED', '联网检索凭据未能写入操作系统安全凭据库。'); }
        await service!.call('saveSearchBackendCredential', { backendId: input.backendId, credentialReference: pending.credentialReference, credentialOperationState: 'ready' });
        return settingsProjection();
      },
      async removeSearchBackendCredential(input) {
        if (protectedSecretStore === undefined) throw new ServiceCallError('PROTECTED_SECRET_STORE_UNAVAILABLE', '操作系统安全凭据库当前不可用。');
        const settings = await service!.call('getSearchBackendSettings', {});
        const connection = settings.backends.find((entry) => entry.backendId === input.backendId)?.connection;
        if (connection === undefined) throw new ServiceCallError('SEARCH_BACKEND_NOT_SHIPPED', '该联网检索后端未提供。');
        if (connection.credentialReference !== null) {
          await service!.call('saveSearchBackendCredential', { backendId: input.backendId, credentialReference: connection.credentialReference, credentialOperationState: 'needs-attention' });
          try { await protectedSecretStore.remove(connection.credentialReference); }
          catch { throw new ServiceCallError('PROTECTED_SECRET_REMOVE_FAILED', '联网检索凭据未能移除。'); }
        }
        await service!.call('removeSearchBackendCredential', input);
        return settingsProjection();
      },
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
      async (input) => { await service!.call('saveModelServiceProxy', input); return settingsProjection(); },
      saveModelServiceCredential,
      removeModelServiceCredential,
      {
        selectMainRoleModel: async (input) => { await service!.call('selectMainRoleModel', input); return settingsProjection(); },
        selectBothRoleModels: async (input) => { await service!.call('selectBothRoleModels', input); return settingsProjection(); },
        refreshModelServiceModels: async (input) => {
          const modelDiscovery = await service!.call('refreshModelServiceModels', input);
          return { ...(await settingsProjection()), modelDiscovery };
        },
        selectFastRoleModel: async (input) => { await service!.call('selectFastRoleModel', input); return settingsProjection(); },
        startConnectionTest: (input) => service!.call('testModelServiceConnection', input),
        connectionTestSettings: settingsProjection,
      },
      searchOps,
      (() => {
        let pending = launch.applyControl === 'lose-first-acknowledgement';
        return (): boolean => {
          const lose = pending;
          pending = false;
          return lose;
        };
      })(),
      // J-07's Save-dialog answer is single-use, like the picker's: every later choice is the platform's own.
      (() => {
        let pending = launch.injectedSavePath;
        return (): string | undefined => {
          const path = pending;
          pending = undefined;
          return path;
        };
      })(),
      (pagePath, pdfPath) => printStagedPage(exportStagingRoot, exportPrintSession, pagePath, pdfPath),
      // J-07's folder-dialog answer for a package export (Issue #416, S67b) is single-use too.
      (() => {
        let pending = launch.injectedFolderPath;
        return (): string | undefined => {
          const path = pending;
          pending = undefined;
          return path;
        };
      })(),
      // 现在关闭 AI7 (Issue #434, S86c): a window still holding changes not yet saved keeps AI7 open and says so, as when the
      // editor closes AI7 themselves; otherwise AI7 closes once the answer is on its way.
      () => {
        const risky = [...ownedWindows.values()].filter((owned) => owned.closeRisk && !owned.window.isDestroyed());
        if (risky.length > 0) {
          for (const owned of risky) owned.window.webContents.send(MAIN_EVENTS.closeBlocked);
          return 'blocked';
        }
        setImmediate(() => app.quit());
        return 'quitting';
      },
      () => [...ownedWindows.values()].some((owned) => owned.closeRisk && !owned.window.isDestroyed()),
      preferenceStore,
      () => ownedWindows.values(),
      () => [...ownedWindows.values()],
      launch.journalFaultArmed,
    );
    startupLocation = reachStartup('renderer-first-paint');
    const initialWindow = await createOwnedWindow(null, launch.injectedPickerPath, true);
    startupLocation = reachStartup('readiness-signal');
    requireDesktop(!serviceInterrupted);
    await announceProductReadiness();
    requireDesktop(!serviceInterrupted);
    productReady = true;
    initialWindow.window.webContents.send(MAIN_EVENTS.productReady);
    requireDesktop(!serviceInterrupted);
  } catch (error) {
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
    const refusal = error instanceof ServiceCallError ? dataVersionStartupRefusal(error.code, error.message) : null;
    if (refusal !== null) await dialog.showMessageBox({
      type: 'error', title: DATA_VERSION_STARTUP_TITLE, message: refusal.message, buttons: [DATA_VERSION_STARTUP_CLOSE],
    }).catch(() => undefined);
    app.exit(1);
  }
}
