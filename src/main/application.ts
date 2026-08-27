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
  type Event as ElectronEvent,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type Session,
} from 'electron';
import {
  IPC_CHANNELS,
  MAIN_EVENTS,
  type CommitNewBookRendererInput,
  type J01ImportControl,
  type PickerReselectResult,
  type PickerStageResult,
  type RendererCallResult,
  type ServiceOperationMap,
} from '../shared/protocol.js';
import { ServiceCallError, ServiceClient } from './service-client.js';
import {
  createCanonicalExternalDataRoot,
  ensureCanonicalDataDirectory,
  requireSameCanonicalDataDirectory,
} from '../shared/data-root.js';

interface LaunchArguments {
  dataRoot: string;
  injectedPickerPath: string | undefined;
  importControl: J01ImportControl | undefined;
  launcherPid: number;
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
          key === '--j01-import-control' ||
          key === '--launcher-pid'),
    );
    values.set(key, value);
  }
  const dataRoot = values.get('--data-root');
  requireDesktop(dataRoot !== undefined && isAbsolute(dataRoot));
  const injectedPickerPath = values.get('--j01-picker-path');
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
  const launcherPid = Number(values.get('--launcher-pid'));
  requireDesktop(
    injectedPickerPath === undefined ||
      (process.env.AI7_E2E_JOURNEY === 'J-01' &&
        isAbsolute(injectedPickerPath) &&
        extname(injectedPickerPath).toLocaleLowerCase('en-US') === '.docx'),
  );
  requireDesktop(
    importControlValue === undefined || (process.env.AI7_E2E_JOURNEY === 'J-01' && importControl !== undefined),
  );
  requireDesktop(Number.isSafeInteger(launcherPid) && launcherPid > 0 && launcherPid === process.ppid);
  return { dataRoot, injectedPickerPath, importControl, launcherPid };
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
  window: BrowserWindow,
  service: ServiceClient,
  injectedPickerPathInput: string | undefined,
  authorityIsAvailable: () => boolean,
  onCloseRiskChanged: (risk: boolean) => void,
): () => void {
  let injectedPickerPath = injectedPickerPathInput;
  const commitBindings = new Map<
    string,
    { draftId: string; expectedDraftVersion: number; reviewDigest: string; commitId: string }
  >();
  const requireSender = (event: IpcMainInvokeEvent): void => {
    requireDesktop(
      !window.isDestroyed() &&
        event.sender.id === window.webContents.id &&
        event.senderFrame === window.webContents.mainFrame,
      'AI7_RENDERER_BOUNDARY_INVALID',
    );
  };
  const requireAuthority = (): void => {
    if (!authorityIsAvailable()) {
      throw new ServiceCallError('SERVICE_INTERRUPTED', '本地业务服务已中断；当前业务操作不可继续。');
    }
  };
  const closeRiskListener = (event: IpcMainEvent, input: unknown): void => {
    requireSender(event);
    requireDesktop(typeof input === 'boolean', 'AI7_RENDERER_BOUNDARY_INVALID');
    onCloseRiskChanged(input);
  };
  const chooseDocx = async (): Promise<string | undefined> => {
    let selectedPath = injectedPickerPath;
    injectedPickerPath = undefined;
    if (!selectedPath) {
      const selected = await dialog.showOpenDialog(window, {
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

  ipcMain.handle(IPC_CHANNELS.getImportStartup, (event) =>
    envelope(async () => {
      requireSender(event);
      requireAuthority();
      return service.call('getImportStartup', {});
    }),
  );

  ipcMain.handle(IPC_CHANNELS.selectAndStageDocx, (event) =>
    envelope<PickerStageResult>(async () => {
      requireSender(event);
      requireAuthority();
      const selectedPath = await chooseDocx();
      if (!selectedPath) return { status: 'cancelled' };
      const staged = await service.call('stageSelectedDocx', { selectionToken: randomUUID(), selectedPath });
      return { status: 'staged', staged };
    }),
  );
  ipcMain.handle(IPC_CHANNELS.continueImportDraft, (event, input: ServiceOperationMap['continueImportDraft']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireAuthority();
      return service.call('continueImportDraft', input);
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.reselectImportDraft,
    (event, input: { draftId: string; expectedDraftVersion: number }) =>
      envelope<PickerReselectResult>(async () => {
        requireSender(event);
        requireAuthority();
        requireDesktop(
          input !== null &&
            typeof input === 'object' &&
            UUID_PATTERN.test(input.draftId) &&
            Number.isSafeInteger(input.expectedDraftVersion) &&
            input.expectedDraftVersion >= 1,
          'AI7_RENDERER_BOUNDARY_INVALID',
        );
        const selectedPath = await chooseDocx();
        if (!selectedPath) return { status: 'cancelled' };
        commitBindings.delete(input.draftId);
        return {
          status: 'reselected',
          continuation: await service.call('reselectImportDraft', {
            ...input,
            selectionToken: randomUUID(),
            selectedPath,
          }),
        };
      }),
  );
  ipcMain.handle(IPC_CHANNELS.abandonImportDraft, (event, input: ServiceOperationMap['abandonImportDraft']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireAuthority();
      const result = await service.call('abandonImportDraft', input);
      commitBindings.delete(input.draftId);
      return result;
    }),
  );
  ipcMain.handle(IPC_CHANNELS.prepareNewBookReview, (event, input: ServiceOperationMap['prepareNewBookReview']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireAuthority();
      commitBindings.delete(input.draftId);
      return service.call('prepareNewBookReview', input);
    }),
  );
  ipcMain.handle(IPC_CHANNELS.commitNewBookImport, (event, input: CommitNewBookRendererInput) =>
    envelope(async () => {
      requireSender(event);
      requireAuthority();
      requireDesktop(
        input.commitAttemptId === null ||
          (typeof input.commitAttemptId === 'string' && UUID_PATTERN.test(input.commitAttemptId)),
        'AI7_RENDERER_BOUNDARY_INVALID',
      );
      let commitBinding = commitBindings.get(input.draftId);
      if (!commitBinding) {
        commitBinding = {
          draftId: input.draftId,
          expectedDraftVersion: input.expectedDraftVersion,
          reviewDigest: input.reviewDigest,
          commitId: input.commitAttemptId ?? randomUUID(),
        };
        commitBindings.set(input.draftId, commitBinding);
      }
      requireDesktop(
        commitBinding.draftId === input.draftId &&
          commitBinding.expectedDraftVersion === input.expectedDraftVersion &&
          commitBinding.reviewDigest === input.reviewDigest &&
          (input.commitAttemptId === null || commitBinding.commitId === input.commitAttemptId),
      );
      return service.call('commitNewBookImport', commitBinding);
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.acknowledgeImportCompletion,
    (event, input: ServiceOperationMap['acknowledgeImportCompletion']['input']) =>
      envelope(async () => {
        requireSender(event);
        requireAuthority();
        const result = await service.call('acknowledgeImportCompletion', input);
        commitBindings.clear();
        return result;
      }),
  );
  ipcMain.handle(IPC_CHANNELS.getManuscriptWindow, (event, input: ServiceOperationMap['getManuscriptWindow']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireAuthority();
      return service.call('getManuscriptWindow', input);
    }),
  );
  ipcMain.handle(IPC_CHANNELS.flushJournalEdit, (event, input: ServiceOperationMap['flushJournalEdit']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireAuthority();
      return service.call('flushJournalEdit', input);
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
  let closeRisk = false;
  let shutdown: Promise<void> | undefined;
  let window: BrowserWindow | undefined;
  let unregisterHandlers: (() => void) | undefined;
  let launcherLease: NodeJS.Timeout | undefined;
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
    window?.destroy();
    void stop().then(
      () => app.exit(1),
      () => app.exit(1),
    );
  };
  const beforeQuit = (event: ElectronEvent): void => {
    if (quitReady) return;
    event.preventDefault();
    if (!quitting && closeRisk && window && !window.isDestroyed()) {
      window.webContents.send(MAIN_EVENTS.closeBlocked);
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
    service = await ServiceClient.start(process.execPath, serviceEntry, dataRoot, launch.importControl);
    service.onUnexpectedExit(() => {
      serviceInterrupted = true;
      if (!productReady) {
        terminate();
      } else if (window && !window.isDestroyed()) {
        window.webContents.send(MAIN_EVENTS.serviceInterrupted);
      }
    });
    requireDesktop(!serviceInterrupted);
    app.on('before-quit', beforeQuit);
    app.on('window-all-closed', allWindowsClosed);

    window = new BrowserWindow({
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
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    window.webContents.on('will-attach-webview', (event) => event.preventDefault());
    window.webContents.on('render-process-gone', terminate);
    window.on('close', (event: ElectronEvent) => {
      if (!quitting && closeRisk) {
        event.preventDefault();
        window?.webContents.send(MAIN_EVENTS.closeBlocked);
      }
    });
    startupLocation = 'renderer-first-paint';
    const firstPaint = new Promise<void>((resolvePaint, reject) => {
      const timeout = setTimeout(() => reject(new Error('AI7_RENDERER_FIRST_PAINT_TIMEOUT')), 30_000);
      timeout.unref();
      window!.once('ready-to-show', () => {
        clearTimeout(timeout);
        window?.show();
        resolvePaint();
      });
    });
    unregisterHandlers = registerRendererHandlers(
      window,
      service,
      launch.injectedPickerPath,
      () => !serviceInterrupted,
      (risk) => {
        closeRisk = risk;
      },
    );
    await Promise.all([window.loadFile(resolve(__dirname, '..', 'renderer', 'index.html')), firstPaint]);
    startupLocation = 'readiness-signal';
    requireDesktop(!serviceInterrupted);
    await announceProductReadiness();
    requireDesktop(!serviceInterrupted);
    window.webContents.send(MAIN_EVENTS.productReady);
    requireDesktop(!serviceInterrupted);
    productReady = true;
  } catch {
    process.stderr.write(`AI7_STARTUP_FAILED/${startupLocation}\n`);
    quitting = true;
    app.removeListener('before-quit', beforeQuit);
    app.removeListener('window-all-closed', allWindowsClosed);
    unregisterHandlers?.();
    unregisterHandlers = undefined;
    window?.destroy();
    try {
      await stop();
    } catch {
      // The product process exits nonzero after best-effort exact-child teardown.
    }
    app.exit(1);
  }
}
