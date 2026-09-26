import { randomUUID } from 'node:crypto';
import { release } from 'node:os';
import { writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, resolve } from 'node:path';
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
  J04_MODEL_ADAPTER_CONTROL_PATTERN,
  MAIN_EVENTS,
  PROVIDER_CACHE_ROOT_ARGUMENT,
  REVIEW_FINDING_PAGE_KEYS,
  RUN_BUDGET_CEILING_ARGUMENT,
  TRUSTED_SCOPE_ARGUMENT,
  parseTrustedLaunchForm,
  type CommitNewBookRendererInput,
  type CommitManuscriptReimportRendererInput,
  type CommitSourceImportRendererInput,
  type BookWorkbenchOpenProjection,
  type BookWorkbenchRoute,
  type ContinueImportProjection,
  type DeliverablesProjection,
  type DesignatePublicationVersionInput,
  type ImportDraftRecoveryProjection,
  type ImportCommitProjection,
  type InspectReviewFindingOfMarkRendererInput,
  type J01ImportControl,
  type J03ForegroundExecutionControl,
  type J04ModelAdapterControl,
  type J08RecoveryControl,
  type ModelServiceSettingsProjection,
  type PickerReselectResult,
  type PickerStageResult,
  type EditorClipboardCommand,
  type ProductDataLocationProjection,
  type ProductDataLocationRevealProjection,
  type RendererApi,
  type RendererCallResult,
  type ResolvedBookWorkbenchRoute,
  type ReviewBeforeManuscriptReimportProjection,
  type ReviewFindingPageRequest,
  type ReviewWorkspaceProjection,
  type ServiceJobProjection,
  type ServiceOperationMap,
  type TrustedLaunchForm,
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
  /** The trusted launch form (ADR 0065): scope, ceiling, and cache root exactly as the launcher passed them. */
  launchForm: TrustedLaunchForm;
  injectedPickerPath: string | undefined;
  /** J-07 only (Issue #413): the one answer the Save dialog gives, once, in place of the platform's own. */
  injectedSavePath: string | undefined;
  /** J-07's answer to the folder dialog of a 图书交付包 export (Issue #416, S67b): single-use, like the Save dialog's. */
  injectedFolderPath: string | undefined;
  importControl: J01ImportControl | undefined;
  foregroundExecutionControl: J03ForegroundExecutionControl | undefined;
  recoveryControl: J08RecoveryControl | undefined;
  modelAdapterControl: J04ModelAdapterControl | undefined;
  /** J-04 only (Issue #502): the file whose word, `offline`, the service reads as this device's connectivity. */
  connectivityPath: string | undefined;
  /** J-10 only (Issue #422): the file whose number says how many units may settle; a unit waits, in flight, for it. */
  unitHoldPath: string | undefined;
  /** J-05 only: the first Apply commits and its acknowledgement is withheld from the renderer, once. */
  applyControl: 'lose-first-acknowledgement' | undefined;
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
  operation: 'search' | 'replacement' | 'reimport' | 'task-authorization' | 'baseline-analysis' | 'review-run';
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
  /**
   * The Recovery Attention States this window's last 待我处理 read showed it (Issue #424). Showing one claims
   * nothing: opening it from there claims it for this window, and only while no other window holds it.
   */
  attentionOffers: Set<string>;
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
          key === '--j03-picker-path' ||
          key === '--j04-picker-path' ||
          key === '--j05-picker-path' ||
          key === '--j06-picker-path' ||
          key === '--j07-picker-path' ||
          key === '--j09-picker-path' ||
          key === '--j10-picker-path' ||
          key === '--j16-picker-path' ||
          key === '--j07-save-path' ||
          key === '--j07-folder-path' ||
          key === '--j04-save-path' ||
          key === '--j01-import-control' ||
          key === '--j03-foreground-execution-control' ||
          key === '--j08-recovery-control' ||
          key === '--j04-model-adapter' ||
          key === '--j04-connectivity-path' ||
          key === '--j10-unit-hold-path' ||
          key === '--j05-apply-control' ||
          key === '--j12-observe-reveal' ||
          key === '--launcher-pid' ||
          key === TRUSTED_SCOPE_ARGUMENT ||
          key === RUN_BUDGET_CEILING_ARGUMENT ||
          key === PROVIDER_CACHE_ROOT_ARGUMENT),
    );
    values.set(key, value);
  }
  const dataRoot = values.get('--data-root');
  requireDesktop(dataRoot !== undefined && isAbsolute(dataRoot));
  // The trusted launch form: an unknown scope, a malformed ceiling, or a relative cache root denies startup.
  const launchForm = parseTrustedLaunchForm({
    trustedOperationalScope: values.get(TRUSTED_SCOPE_ARGUMENT),
    runBudgetCeiling: values.get(RUN_BUDGET_CEILING_ARGUMENT),
    providerCacheRoot: values.get(PROVIDER_CACHE_ROOT_ARGUMENT),
  });
  requireDesktop(launchForm !== null);
  requireDesktop(launchForm.providerCacheRoot === null || isAbsolute(launchForm.providerCacheRoot));
  const j01PickerPath = values.get('--j01-picker-path');
  const j02PickerPath = values.get('--j02-picker-path');
  const j08PickerPath = values.get('--j08-picker-path');
  const j12PickerPath = values.get('--j12-picker-path');
  const j03PickerPath = values.get('--j03-picker-path');
  const j04PickerPath = values.get('--j04-picker-path');
  const j05PickerPath = values.get('--j05-picker-path');
  const j06PickerPath = values.get('--j06-picker-path');
  const j07PickerPath = values.get('--j07-picker-path');
  const j09PickerPath = values.get('--j09-picker-path');
  const j10PickerPath = values.get('--j10-picker-path');
  const j16PickerPath = values.get('--j16-picker-path');
  requireDesktop(
    [j01PickerPath, j02PickerPath, j08PickerPath, j12PickerPath, j03PickerPath, j04PickerPath, j05PickerPath, j06PickerPath, j07PickerPath, j09PickerPath,
      j10PickerPath, j16PickerPath].filter(Boolean).length <= 1,
  );
  // The picker-path launch controls carry whatever their Journey selects, in any recognised format
  // or none, so each one asks only that it is its own Journey's absolute path.
  requireDesktop(
    j01PickerPath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-01' && isAbsolute(j01PickerPath)),
  );
  requireDesktop(
    j02PickerPath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-02' && isAbsolute(j02PickerPath)),
  );
  requireDesktop(
    j08PickerPath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-08' && isAbsolute(j08PickerPath)),
  );
  requireDesktop(
    j12PickerPath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-12' && isAbsolute(j12PickerPath)),
  );
  requireDesktop(
    j03PickerPath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-03' && isAbsolute(j03PickerPath)),
  );
  requireDesktop(
    j04PickerPath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-04' && isAbsolute(j04PickerPath)),
  );
  requireDesktop(
    j05PickerPath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-05' && isAbsolute(j05PickerPath)),
  );
  requireDesktop(
    j06PickerPath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-06' && isAbsolute(j06PickerPath)),
  );
  requireDesktop(
    j07PickerPath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-07' && isAbsolute(j07PickerPath)),
  );
  requireDesktop(
    j09PickerPath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-09' && isAbsolute(j09PickerPath)),
  );
  requireDesktop(
    j10PickerPath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-10' && isAbsolute(j10PickerPath)),
  );
  requireDesktop(
    j16PickerPath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-16' && isAbsolute(j16PickerPath)),
  );
  const injectedPickerPath =
    j01PickerPath ?? j02PickerPath ?? j08PickerPath ?? j12PickerPath ?? j03PickerPath ?? j04PickerPath ?? j05PickerPath ?? j06PickerPath ??
      j07PickerPath ?? j09PickerPath ?? j10PickerPath ?? j16PickerPath;
  // The Save dialog's launch control is guarded exactly as the picker controls are: each Journey's own, and absolute —
  // J-07's for its exports, J-04's for the 审阅报告's (Issue #500, S64b part 2).
  const j07SavePath = values.get('--j07-save-path');
  const j04SavePath = values.get('--j04-save-path');
  requireDesktop(j07SavePath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-07' && isAbsolute(j07SavePath)));
  requireDesktop(j04SavePath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-04' && isAbsolute(j04SavePath)));
  const injectedSavePath = j07SavePath ?? j04SavePath;
  const injectedFolderPath = values.get('--j07-folder-path');
  requireDesktop(injectedFolderPath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-07' && isAbsolute(injectedFolderPath)));
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
  const foregroundExecutionControlValue = values.get('--j03-foreground-execution-control');
  const foregroundExecutionControl =
    foregroundExecutionControlValue === 'interrupt-before-foreground-boundary-response'
      ? foregroundExecutionControlValue
      : undefined;
  const recoveryControlValue = values.get('--j08-recovery-control');
  const recoveryControl = recoveryControlValue === 'interrupt-after-journal-ack'
    ? recoveryControlValue
    : undefined;
  const modelAdapterControlValue = values.get('--j04-model-adapter');
  const modelAdapterControl = modelAdapterControlValue !== undefined && J04_MODEL_ADAPTER_CONTROL_PATTERN.test(modelAdapterControlValue)
    ? modelAdapterControlValue
    : undefined;
  const applyControlValue = values.get('--j05-apply-control');
  const applyControl = applyControlValue === 'lose-first-acknowledgement' ? applyControlValue : undefined;
  requireDesktop(applyControlValue === undefined || (process.env.AI7_E2E_JOURNEY === 'J-05' && applyControl !== undefined));
  const observeJ12RevealValue = values.get('--j12-observe-reveal');
  const observeJ12Reveal = observeJ12RevealValue === 'true';
  const launcherPid = Number(values.get('--launcher-pid'));
  requireDesktop(
    importControlValue === undefined || (process.env.AI7_E2E_JOURNEY === 'J-01' && importControl !== undefined),
  );
  requireDesktop(
    foregroundExecutionControlValue === undefined ||
      (process.env.AI7_E2E_JOURNEY === 'J-03' && foregroundExecutionControl !== undefined),
  );
  requireDesktop(
    recoveryControlValue === undefined || (process.env.AI7_E2E_JOURNEY === 'J-08' && recoveryControl !== undefined),
  );
  // The model adapter binds a Journey whose Runs execute: J-04's analysis, J-09's 运行中 and 最近完成 (Issue #424),
  // J-10's cancelled Run (Issue #422), and J-16's 任务 panel (Issue #423).
  requireDesktop(
    modelAdapterControlValue === undefined ||
      ((process.env.AI7_E2E_JOURNEY === 'J-04' || process.env.AI7_E2E_JOURNEY === 'J-09' || process.env.AI7_E2E_JOURNEY === 'J-10' ||
        process.env.AI7_E2E_JOURNEY === 'J-16') &&
        modelAdapterControl !== undefined),
  );
  requireDesktop([importControl, foregroundExecutionControl, recoveryControl, modelAdapterControl].filter(Boolean).length <= 1);
  // The connectivity control is guarded as the picker paths are — J-04's own, and absolute — and, since it only
  // simulates whether the adapter's route has a network, it sits beside the adapter rather than excluding it.
  const connectivityPath = values.get('--j04-connectivity-path');
  requireDesktop(connectivityPath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-04' && isAbsolute(connectivityPath)));
  // J-10's unit hold (Issue #422) is guarded the same way — J-10's own, J-16's to hold a Run in its 任务 panel (Issue
  // #423), and J-09's to hold several Books' Runs at once (Issue #49), and absolute — and sits beside the adapter.
  const unitHoldPath = values.get('--j10-unit-hold-path');
  requireDesktop(unitHoldPath === undefined ||
    ((process.env.AI7_E2E_JOURNEY === 'J-09' || process.env.AI7_E2E_JOURNEY === 'J-10' || process.env.AI7_E2E_JOURNEY === 'J-16') && isAbsolute(unitHoldPath)));
  requireDesktop(
    observeJ12RevealValue === undefined ||
      (process.env.AI7_E2E_JOURNEY === 'J-12' && observeJ12RevealValue === 'true'),
  );
  requireDesktop(Number.isSafeInteger(launcherPid) && launcherPid > 0 && launcherPid === process.ppid);
  // developer-live is a human-attended developer-host launch: never a Journey launch and never combined with a Journey control.
  requireDesktop(
    launchForm.trustedOperationalScope === 'development-ci' ||
      (process.env.AI7_E2E_JOURNEY === undefined && injectedPickerPath === undefined && observeJ12RevealValue === undefined &&
        importControlValue === undefined && foregroundExecutionControlValue === undefined && recoveryControlValue === undefined && modelAdapterControlValue === undefined &&
        applyControlValue === undefined && injectedSavePath === undefined && injectedFolderPath === undefined && connectivityPath === undefined &&
        unitHoldPath === undefined),
  );
  return {
    dataRoot,
    launchForm,
    injectedPickerPath,
    injectedSavePath,
    injectedFolderPath,
    importControl,
    foregroundExecutionControl,
    recoveryControl,
    modelAdapterControl,
    connectivityPath,
    unitHoldPath,
    applyControl,
    observeJ12Reveal,
    launcherPid,
  };
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

/** What the Save dialog offers for each export format (Issue #500, S64b). */
const EXPORT_DIALOG_FORMATS = {
  docx: { extension: 'docx', name: 'Word 文档' },
  pdf: { extension: 'pdf', name: 'PDF 文档' },
  markdown: { extension: 'md', name: 'Markdown 文本' },
} as const;

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
  consumeLostApplyAcknowledgement: () => boolean,
  consumeInjectedSavePath: () => string | undefined,
  printExportPage: (pagePath: string, pdfPath: string) => Promise<void>,
  consumeInjectedFolderPath: () => string | undefined,
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
        : job.kind === 'task-authorization-preparation'
          ? 'task-authorization'
          : job.kind === 'baseline-analysis-preparation'
            ? 'baseline-analysis'
            : job.kind === 'review-run-preparation'
              ? 'review-run'
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
    } else if (result !== null && 'taskIntent' in result) {
      if (actualOperation !== 'task-authorization' || result.bookId !== capability.bookId) {
        throw new ServiceCallError('AI7_EDITOR_CAPABILITY_INVALID', '任务授权准备结果不属于当前图书工作台。');
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
  const chooseManuscript = async (owned: OwnedRendererWindow): Promise<string | undefined> => {
    let selectedPath = owned.injectedPickerPath;
    owned.injectedPickerPath = undefined;
    if (!selectedPath) {
      // Intake accepts a file whatever its extension and identifies the format from its content
      // (ADR 0072 §1), so the picker suggests the recognised formats without restricting to them.
      const selected = await dialog.showOpenDialog(owned.window, {
        title: '选择要导入的稿件文件',
        buttonLabel: '选择稿件',
        properties: ['openFile'],
        filters: [
          { name: '稿件文件', extensions: ['docx', 'doc', 'pdf', 'odt', 'rtf', 'txt', 'md'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      });
      if (selected.canceled || selected.filePaths.length !== 1) return undefined;
      selectedPath = selected.filePaths[0];
    }
    requireDesktop(selectedPath !== undefined && isAbsolute(selectedPath));
    return selectedPath;
  };
  /**
   * 选择保存位置… (Issue #413): the platform's own Save dialog, which owns an existing file's replace-or-rename
   * choice (V2-UX-EXP-019), offering the review's file name in the documents folder. J-07 alone may answer it
   * once with a launch control instead, exactly as it answers the picker; `undefined` is a cancelled dialog.
   */
  const chooseExportDestination = async (owned: OwnedRendererWindow, suggestedFileName: unknown, formatInput: unknown): Promise<string | undefined> => {
    // The format the review was of (Issue #500, S64b): the dialog offers its extension, and the service checks it again.
    requireDesktop(formatInput === undefined || formatInput === 'docx' || formatInput === 'pdf' || formatInput === 'markdown');
    const format = EXPORT_DIALOG_FORMATS[(formatInput ?? 'docx') as keyof typeof EXPORT_DIALOG_FORMATS];
    const injected = consumeInjectedSavePath();
    if (injected !== undefined) {
      requireDesktop(isAbsolute(injected));
      return injected;
    }
    const offered = typeof suggestedFileName === 'string' && suggestedFileName.isWellFormed()
      ? basename(suggestedFileName).replace(/[\\/:*?"<>|]/gu, '_').slice(0, 180)
      : '';
    const fileName = extname(offered).toLowerCase() === `.${format.extension}` ? offered : `稿件.${format.extension}`;
    const chosen = await dialog.showSaveDialog(owned.window, {
      title: '选择导出位置',
      buttonLabel: '选择此位置',
      defaultPath: resolve(app.getPath('documents'), fileName),
      filters: [{ name: format.name, extensions: [format.extension] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (chosen.canceled || chosen.filePath === undefined || chosen.filePath.length === 0) return undefined;
    requireDesktop(isAbsolute(chosen.filePath));
    return chosen.filePath;
  };

  /**
   * The system's own folder dialog for a 图书交付包 export (Issue #416, S67b; EXP-019, EXP-020): the editor chooses a folder,
   * or makes a new one in the dialog. J-07 answers it once with a launch control instead; `undefined` is a cancelled dialog.
   */
  const chooseExportFolder = async (owned: OwnedRendererWindow): Promise<string | undefined> => {
    const injected = consumeInjectedFolderPath();
    if (injected !== undefined) {
      requireDesktop(isAbsolute(injected));
      return injected;
    }
    const chosen = await dialog.showOpenDialog(owned.window, {
      title: '选择导出图书交付包的文件夹',
      buttonLabel: '导出到此文件夹',
      defaultPath: app.getPath('documents'),
      // `createDirectory` makes a new folder inside the dialog on macOS; Windows' dialog makes one by itself. Windows'
      // `promptToCreate` would answer with a folder that does not exist yet, which AI7 never creates, so it is not asked.
      properties: ['openDirectory', 'createDirectory'],
    });
    const folder = chosen.canceled ? undefined : chosen.filePaths[0];
    if (folder === undefined || folder.length === 0) return undefined;
    requireDesktop(isAbsolute(folder));
    return folder;
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

  ipcMain.handle(IPC_CHANNELS.selectAndStageManuscript, (event) =>
    envelope<PickerStageResult>(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        claims.requireNewDraftCapacity(owned);
        const selectedPath = await chooseManuscript(owned);
        if (!selectedPath) return { status: 'cancelled' as const };
        const staged = await service.call('stageSelectedManuscript', { selectionToken: randomUUID(), selectedPath });
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
  // 审阅 (Issue #417, plan slice S69) is a Book destination: the renderer never names a Book, the service
  // is asked within the route's, and every answer must be that Book's — and, where the renderer named a
  // Review Run, open exactly that Run. Reads are held to the route's read epoch; writes are serialized
  // with every other effect of this window's authority and held to its route generation.
  const requireReviewWorkspaceOfRoute = (
    route: Extract<ResolvedBookWorkbenchRoute, { kind: 'book' }>,
    result: ReviewWorkspaceProjection,
    reviewRunId: string | null,
  ): ReviewWorkspaceProjection => {
    if (result.bookId !== route.bookId || (reviewRunId !== null && result.run?.reviewRunId !== reviewRunId)) {
      throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '审阅记录不属于当前图书工作台。');
    }
    return result;
  };
  ipcMain.handle(
    IPC_CHANNELS.inspectReviewWorkspace,
    (event, input?: Omit<ServiceOperationMap['inspectReviewWorkspace']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const routeGeneration = owned.routeGeneration;
        const routeRequestSequence = owned.routeRequestSequence;
        const reviewRunId = typeof input?.reviewRunId === 'string' ? input.reviewRunId : null;
        // The page and the four filters travel as the renderer gave them; the request frame is what
        // decides whether each is well formed, and a key the renderer left out reads as none.
        const page: Partial<ReviewFindingPageRequest> = {};
        if (typeof input === 'object' && input !== null) {
          for (const key of REVIEW_FINDING_PAGE_KEYS) if (Object.hasOwn(input, key)) Object.assign(page, { [key]: input[key] });
        }
        const result = await service.call('inspectReviewWorkspace', { ...page, bookId: route.bookId, reviewRunId });
        requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
        return requireReviewWorkspaceOfRoute(route, result, reviewRunId);
      }),
  );
  ipcMain.handle(
    IPC_CHANNELS.prepareReviewRun,
    (event, input: Omit<ServiceOperationMap['prepareReviewRun']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const result = await service.call('prepareReviewRun', {
            categoryIds: input.categoryIds,
            scope: input.scope,
            bookId: route.bookId,
          });
          // A Run of the leads alone is prepared by the job's first step, so its answer may already carry the workspace.
          const prepared = result.result;
          if (result.kind !== 'review-run-preparation' ||
              (prepared !== null && !('scopeOptions' in prepared && prepared.bookId === route.bookId))) {
            throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '审阅计划准备结果类型无效或不属于当前图书工作台。');
          }
          rememberEditorResource(owned, 'job', result.jobId, {
            operation: 'review-run',
            bookId: route.bookId,
            manuscriptId: null,
            branchId: null,
          });
          return result;
        });
      }),
  );
  ipcMain.handle(
    IPC_CHANNELS.authorizeReviewRun,
    (event, input: Omit<ServiceOperationMap['authorizeReviewRun']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('authorizeReviewRun', {
            reviewRunId: input.reviewRunId,
            planDigests: input.planDigests,
            bookId: route.bookId,
          });
          requireCurrentRouteGeneration(owned, routeGeneration);
          return requireReviewWorkspaceOfRoute(route, result, input.reviewRunId);
        });
      }),
  );
  ipcMain.handle(
    IPC_CHANNELS.continueReviewRun,
    (event, input: Omit<ServiceOperationMap['continueReviewRun']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('continueReviewRun', { reviewRunId: input.reviewRunId, bookId: route.bookId });
          requireCurrentRouteGeneration(owned, routeGeneration);
          return requireReviewWorkspaceOfRoute(route, result, input.reviewRunId);
        });
      }),
  );
  ipcMain.handle(
    IPC_CHANNELS.recordReviewFindingDisposition,
    (event, input: Omit<ServiceOperationMap['recordReviewFindingDisposition']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('recordReviewFindingDisposition', {
            reviewRunId: input.reviewRunId,
            findingId: input.findingId,
            disposition: input.disposition,
            reason: input.reason,
            bookId: route.bookId,
          });
          requireCurrentRouteGeneration(owned, routeGeneration);
          return requireReviewWorkspaceOfRoute(route, result, input.reviewRunId);
        });
      }),
  );
  ipcMain.handle(
    IPC_CHANNELS.generateReviewReport,
    (event, input: Omit<ServiceOperationMap['generateReviewReport']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('generateReviewReport', { reviewRunId: input.reviewRunId, bookId: route.bookId });
          requireCurrentRouteGeneration(owned, routeGeneration);
          return requireReviewWorkspaceOfRoute(route, result, input.reviewRunId);
        });
      }),
  );
  // 查看任务 lives on the Mark Card, which was opened on this manuscript: the window proves that
  // capability within the route, and a mark of any other Book is answered as no Review Run's mark.
  ipcMain.handle(IPC_CHANNELS.inspectReviewFindingOfMark, (event, input: InspectReviewFindingOfMarkRendererInput) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      const capability = requireManuscriptCapability(owned, input);
      const routeGeneration = owned.routeGeneration;
      const routeRequestSequence = owned.routeRequestSequence;
      const result = await service.call('inspectReviewFindingOfMark', { bookId: capability.bookId, markId: input.markId });
      requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
      return result !== null && result.bookId === capability.bookId ? result : null;
    }),
  );
  // ⑥ 交付物 (Issue #414, plan slice S65) is a Book destination like 审阅: the renderer never names a Book,
  // the service is asked within the route's, and every answer must be that Book's. The read is held to the
  // route's read epoch; 设为发稿版本 is serialized with every other effect of this window's authority and
  // held to its route generation. The milestone is named by the renderer and checked by the service, which
  // refuses one that is not a milestone of this Book's primary Manuscript.
  const requireDeliverablesOfRoute = (
    route: Extract<ResolvedBookWorkbenchRoute, { kind: 'book' }>,
    result: DeliverablesProjection,
  ): DeliverablesProjection => {
    if (result.bookId !== route.bookId) {
      throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '交付物不属于当前图书工作台。');
    }
    return result;
  };
  ipcMain.handle(IPC_CHANNELS.inspectDeliverables, (event) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      const route = requireCurrentBookRoute(owned);
      const routeGeneration = owned.routeGeneration;
      const routeRequestSequence = owned.routeRequestSequence;
      const result = await service.call('inspectDeliverables', { bookId: route.bookId });
      requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
      return requireDeliverablesOfRoute(route, result);
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.designatePublicationVersion,
    (event, input: Omit<DesignatePublicationVersionInput, 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('designatePublicationVersion', {
            milestoneId: input.milestoneId,
            scope: input.scope,
            basis: input.basis,
            bookId: route.bookId,
          });
          requireCurrentRouteGeneration(owned, routeGeneration);
          if (result.bookId !== route.bookId) {
            throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '发稿版本不属于当前图书工作台。');
          }
          requireDeliverablesOfRoute(route, result.deliverables);
          return result;
        });
      }),
  );
  // 维护事项 (Issue #426, S68a): one case of the route's Book, and each of its steps, serialized like every other command.
  // The service checks the designation, the case and the step; main only names the route's Book.
  const requireMaintenanceOfRoute = (route: { bookId: string }, bookId: string): void => {
    if (bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '维护事项不属于当前图书工作台。');
  };
  ipcMain.handle(
    IPC_CHANNELS.inspectMaintenanceCase,
    (event, input: Parameters<RendererApi['inspectMaintenanceCase']>[0]) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('inspectMaintenanceCase', { ...input, bookId: route.bookId });
          requireCurrentRouteGeneration(owned, routeGeneration);
          requireMaintenanceOfRoute(route, result.bookId);
          return result;
        });
      }),
  );
  ipcMain.handle(
    IPC_CHANNELS.listMaintenanceCases,
    (event, input: Parameters<RendererApi['listMaintenanceCases']>[0]) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('listMaintenanceCases', {
            bookId: route.bookId,
            publicationVersionId: input.publicationVersionId,
            beforeOrdinal: input.beforeOrdinal,
          });
          requireCurrentRouteGeneration(owned, routeGeneration);
          requireMaintenanceOfRoute(route, result.bookId);
          return result;
        });
      }),
  );
  ipcMain.handle(
    IPC_CHANNELS.recordMaintenanceCase,
    (event, input: Parameters<RendererApi['recordMaintenanceCase']>[0]) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('recordMaintenanceCase', { bookId: route.bookId, publicationVersionId: input.publicationVersionId, classification: input.classification, reason: input.reason, evidence: input.evidence });
          requireCurrentRouteGeneration(owned, routeGeneration);
          requireMaintenanceOfRoute(route, result.bookId);
          return result;
        });
      }),
  );
  ipcMain.handle(
    IPC_CHANNELS.appendMaintenanceCaseRevision,
    (event, input: Parameters<RendererApi['appendMaintenanceCaseRevision']>[0]) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('appendMaintenanceCaseRevision', { bookId: route.bookId, caseId: input.caseId, expectedRevision: input.expectedRevision, step: input.step });
          requireCurrentRouteGeneration(owned, routeGeneration);
          requireMaintenanceOfRoute(route, result.bookId);
          return result;
        });
      }),
  );
  ipcMain.handle(
    IPC_CHANNELS.saveMaintenanceErrata,
    (event, input: Parameters<RendererApi['saveMaintenanceErrata']>[0]) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('saveMaintenanceErrata', { bookId: route.bookId, caseId: input.caseId, expectedRevision: input.expectedRevision, body: input.body });
          requireCurrentRouteGeneration(owned, routeGeneration);
          requireMaintenanceOfRoute(route, result.bookId);
          return result;
        });
      }),
  );
  // 交付 · 生产文档 (Issue #415, plan slice S66): three deterministic commands of the route's Book, serialized with
  // every other effect of this window's authority and held to its route generation. 从来源材料创建 and 本书不做 name
  // a house type and a material by identity, and the service decides whether they are this Book's; 保存为版本 names
  // a document this window opened, so it needs the document's editing capability like any journal write.
  const requireProductionDocumentResultOfRoute = (
    route: Extract<ResolvedBookWorkbenchRoute, { kind: 'book' }>,
    result: ServiceOperationMap['createProductionDocument']['output'],
  ): ServiceOperationMap['createProductionDocument']['output'] => {
    if (result.bookId !== route.bookId || result.documents.bookId !== route.bookId) {
      throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '生产文档不属于当前图书工作台。');
    }
    return result;
  };
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
  ipcMain.handle(IPC_CHANNELS.inspectProductionDocuments, (event) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      const route = requireCurrentBookRoute(owned);
      const routeGeneration = owned.routeGeneration;
      const routeRequestSequence = owned.routeRequestSequence;
      const result = await service.call('inspectProductionDocuments', { bookId: route.bookId });
      requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
      if (result.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '生产文档不属于当前图书工作台。');
      return result;
    }),
  );
  // 图书交付包 (Issue #416, S67a): a read bound to the route's Book and its read epoch, and 准备图书交付包 serialized
  // like every other command. The service decides whether the content is still what the editor saw; nothing here
  // chooses a destination or writes a file.
  const requireBookDeliveryPackageOfRoute = (route: { bookId: string }, bookId: string): void => {
    if (bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '图书交付包不属于当前图书工作台。');
  };
  ipcMain.handle(IPC_CHANNELS.inspectBookDeliveryPackage, (event) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      const route = requireCurrentBookRoute(owned);
      const routeGeneration = owned.routeGeneration;
      const routeRequestSequence = owned.routeRequestSequence;
      const result = await service.call('inspectBookDeliveryPackage', { bookId: route.bookId });
      requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
      requireBookDeliveryPackageOfRoute(route, result.bookId);
      return result;
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.prepareBookDeliveryPackage,
    (event, input: Omit<ServiceOperationMap['prepareBookDeliveryPackage']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('prepareBookDeliveryPackage', {
            bookId: route.bookId,
            purpose: input.purpose,
            expectedContentDigest: input.expectedContentDigest,
          });
          requireCurrentRouteGeneration(owned, routeGeneration);
          requireBookDeliveryPackageOfRoute(route, result.bookId);
          requireBookDeliveryPackageOfRoute(route, result.package.bookId);
          return result;
        });
      }),
  );
  // Its export (Issue #416, S67b): the review is a read of the route's Book; choosing the folder prepares and 按上述方式导出
  // writes, each serialized like every other command. The service checks the files and the folder; main only asks the
  // platform's dialog.
  ipcMain.handle(
    IPC_CHANNELS.reviewBookDeliveryPackageExport,
    (event, input: Parameters<RendererApi['reviewBookDeliveryPackageExport']>[0]) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('reviewBookDeliveryPackageExport', {
            bookId: route.bookId,
            packageVersionId: input.packageVersionId,
            options: input.options,
            ...(input.offset === undefined ? {} : { offset: input.offset }),
          });
          requireCurrentRouteGeneration(owned, routeGeneration);
          requireBookDeliveryPackageOfRoute(route, result.bookId);
          return result;
        });
      }),
  );
  ipcMain.handle(
    IPC_CHANNELS.chooseBookDeliveryPackageExportFolder,
    (event, input: Parameters<RendererApi['chooseBookDeliveryPackageExportFolder']>[0]) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async (): Promise<Awaited<ReturnType<RendererApi['chooseBookDeliveryPackageExportFolder']>>> => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const folder = await chooseExportFolder(owned);
          // A cancelled dialog records nothing at all (V2-UX-EXP-020).
          if (folder === undefined) return { outcome: 'cancelled' };
          requireCurrentRouteGeneration(owned, routeGeneration);
          const prepared = await service.call('prepareBookDeliveryPackageExport', {
            bookId: route.bookId,
            packageVersionId: input.packageVersionId,
            options: input.options,
            ...(input.offset === undefined ? {} : { offset: input.offset }),
            reviewDigest: input.reviewDigest,
            memberKeys: input.memberKeys,
            folder,
          });
          requireCurrentRouteGeneration(owned, routeGeneration);
          return { outcome: 'prepared', export: prepared };
        });
      }),
  );
  // The effect lock stays held while a package job runs. Only its owning window's cancellation bypasses it.
  let packageExportInFlight: { owned: OwnedRendererWindow; bookId: string; exportId: string; job: Promise<ServiceJobProjection> } | null = null;
  ipcMain.handle(
    IPC_CHANNELS.approveBookDeliveryPackageExport,
    (event, input: Parameters<RendererApi['approveBookDeliveryPackageExport']>[0]) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const active = { owned, bookId: route.bookId, exportId: input.exportId,
            job: service.call('approveBookDeliveryPackageExport', { bookId: route.bookId, exportId: input.exportId }) };
          packageExportInFlight = active;
          try {
            let job = await active.job;
            while (job.state === 'queued' || job.state === 'running') {
              await new Promise<void>((resolve) => setTimeout(resolve, 50));
              job = await service.call('pollServiceJob', { jobId: job.jobId });
            }
            if (job.state === 'cancelled') throw new ServiceCallError('EXPORT_CANCELLED', '已取消导出，没有写入任何文件。');
            if (job.state === 'failed') throw new ServiceCallError(job.failure?.code ?? 'EXPORT_FAILED', job.failure?.message ?? '交付包导出未完成。');
            const result = job.result;
            if (job.kind !== 'package-export' || result === null || !('export' in result) || result.export.exportId !== input.exportId) {
              throw new ServiceCallError('AI7_EXPORT_INVALID', '交付包导出结果不一致。');
            }
            requireCurrentRouteGeneration(owned, routeGeneration);
            requireBookDeliveryPackageOfRoute(route, result.bookId);
            requireBookDeliveryPackageOfRoute(route, result.package.bookId);
            return result;
          } finally {
            if (packageExportInFlight === active) packageExportInFlight = null;
          }
        });
      }),
  );
  ipcMain.handle(
    IPC_CHANNELS.cancelBookDeliveryPackageExport,
    (event, input: Parameters<RendererApi['cancelBookDeliveryPackageExport']>[0]) =>
      envelope(async () => {
        const owned = requireSender(event);
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const active = packageExportInFlight;
        if (active === null || active.owned !== owned || active.bookId !== route.bookId || active.exportId !== input.exportId) return false;
        const job = await active.job;
        if (packageExportInFlight !== active) return false;
        try { return await service.call('cancelBookDeliveryPackageExport', { jobId: job.jobId }); }
        catch (error) {
          if (error instanceof ServiceCallError && error.code === 'JOB_NOT_FOUND') return false;
          throw error;
        }
      }),
  );
  ipcMain.handle(
    IPC_CHANNELS.createProductionDocument,
    (event, input: Omit<ServiceOperationMap['createProductionDocument']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('createProductionDocument', {
            bookId: route.bookId,
            typeId: input.typeId,
            sourceVersionId: input.sourceVersionId,
          });
          requireCurrentRouteGeneration(owned, routeGeneration);
          return requireProductionDocumentResultOfRoute(route, result);
        });
      }),
  );
  ipcMain.handle(
    IPC_CHANNELS.decideProductionDocumentType,
    (event, input: Omit<ServiceOperationMap['decideProductionDocumentType']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('decideProductionDocumentType', {
            bookId: route.bookId,
            typeId: input.typeId,
            notForThisBook: input.notForThisBook,
          });
          requireCurrentRouteGeneration(owned, routeGeneration);
          return requireProductionDocumentResultOfRoute(route, result);
        });
      }),
  );
  // A document's workflow phase (Issue #415, S66c): one deterministic move of a document of the route's Book, serialized
  // like every other command; the service decides whether the move is open to the phase and still what the editor saw.
  ipcMain.handle(
    IPC_CHANNELS.transitionProductionDocumentPhase,
    (event, input: Omit<ServiceOperationMap['transitionProductionDocumentPhase']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('transitionProductionDocumentPhase', {
            bookId: route.bookId,
            documentId: input.documentId,
            phaseId: input.phaseId,
            action: input.action,
            expectedTransitions: input.expectedTransitions,
            reason: input.reason,
          });
          requireCurrentRouteGeneration(owned, routeGeneration);
          return requireProductionDocumentResultOfRoute(route, result);
        });
      }),
  );
  ipcMain.handle(
    IPC_CHANNELS.saveProductionDocumentVersion,
    (event, input: Omit<ServiceOperationMap['saveProductionDocumentVersion']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const capability = requireManuscriptCapability(owned, { manuscriptId: input.documentId, branchId: input.branchId });
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('saveProductionDocumentVersion', {
            bookId: capability.bookId,
            documentId: capability.manuscriptId,
            branchId: capability.branchId,
          });
          requireCurrentRouteGeneration(owned, routeGeneration);
          return requireProductionDocumentResultOfRoute(route, result);
        });
      }),
  );
  // 交付 (Issue #415, S66b): a Delivery Record of one version of a document of the route's Book — a saved one, or the
  // current text saved as the next version first; the service decides whether the document and the version are that
  // Book's. Nothing is sent: the export follows on its card.
  ipcMain.handle(
    IPC_CHANNELS.recordProductionDocumentDelivery,
    (event, input: Omit<ServiceOperationMap['recordProductionDocumentDelivery']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('recordProductionDocumentDelivery', {
            bookId: route.bookId,
            documentId: input.documentId,
            version: input.version,
            recipient: input.recipient,
            note: input.note,
          });
          requireCurrentRouteGeneration(owned, routeGeneration);
          return requireProductionDocumentResultOfRoute(route, result);
        });
      }),
  );
  // 待我处理 (Issue #424, plan slice S78): a read across every Book, in any window whatever it shows. It needs no
  // Book route and takes none — unlike getStartup it claims nothing and leaves no workbench. It remembers only
  // which Recovery Attention States it showed this window, so opening one from there can claim it while no
  // other window holds it (getRecoveryComparison above).
  ipcMain.handle(IPC_CHANNELS.inspectGlobalAttention, (event) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      const result = await service.call('inspectGlobalAttention', {});
      owned.attentionOffers.clear();
      for (const group of result.groups) {
        for (const item of group.items) {
          if (item.target.kind === 'manuscript-recovery' && UUID_PATTERN.test(item.target.attentionId)) owned.attentionOffers.add(item.target.attentionId);
        }
      }
      return result;
    }),
  );
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
    for (const channel of Object.values(IPC_CHANNELS)) ipcMain.removeHandler(channel);
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
    startupLocation = reachStartup('arguments');
    const entryIndex = process.argv.findIndex((value) => resolve(value) === resolve(__filename));
    requireDesktop(entryIndex > 0);
    const launch = parseArguments(process.argv.slice(entryIndex + 1));
    requireDesktop(processIsAlive(launch.launcherPid));
    launcherLease = setInterval(() => {
      if (process.ppid !== launch.launcherPid || !processIsAlive(launch.launcherPid)) terminate();
    }, 1_000);
    launcherLease.unref();
    app.enableSandbox();
    startupLocation = reachStartup('data-root');
    const codeRoot = resolve(__dirname, '..', '..');
    const dataRoot = await createCanonicalExternalDataRoot(launch.dataRoot, codeRoot);
    startupLocation = reachStartup('shell-root');
    const shellRoot = await ensureCanonicalDataDirectory(dataRoot, 'shell');
    const earlyUserDataSwitch = app.commandLine.getSwitchValue('user-data-dir');
    requireDesktop(isAbsolute(earlyUserDataSwitch));
    await requireSameCanonicalDataDirectory(shellRoot, earlyUserDataSwitch, app.getPath('userData'));
    app.setPath('userData', shellRoot);
    await requireSameCanonicalDataDirectory(shellRoot, app.getPath('userData'));
    startupLocation = reachStartup('single-instance');
    if (!app.requestSingleInstanceLock()) {
      process.stderr.write('AI7_STARTUP_FAILED/single-instance-lock\n');
      await stop();
      app.exit(0);
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
      window.webContents.on('render-process-gone', terminate);
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
