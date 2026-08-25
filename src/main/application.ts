import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { release } from 'node:os';
import { basename, extname, isAbsolute, resolve } from 'node:path';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  session,
  type IpcMainInvokeEvent,
  type Session,
} from 'electron';
import {
  IPC_CHANNELS,
  type CommitNewBookRendererInput,
  type PickerStageResult,
  type RendererCallResult,
  type ServiceOperationMap,
} from '../shared/protocol.js';
import { ServiceCallError, ServiceClient } from './service-client.js';
import { createCanonicalExternalDataRoot } from '../shared/data-root.js';

interface LaunchArguments {
  dataRoot: string;
  injectedPickerPath: string | undefined;
}

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
        (key === '--data-root' || key === '--j01-picker-path'),
    );
    values.set(key, value);
  }
  const dataRoot = values.get('--data-root');
  requireDesktop(dataRoot !== undefined && isAbsolute(dataRoot));
  const injectedPickerPath = values.get('--j01-picker-path');
  requireDesktop(
    injectedPickerPath === undefined ||
      (process.env.AI7_E2E_JOURNEY === 'J-01' &&
        isAbsolute(injectedPickerPath) &&
        extname(injectedPickerPath).toLocaleLowerCase('en-US') === '.docx'),
  );
  return { dataRoot, injectedPickerPath };
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

function registerRendererHandlers(
  window: BrowserWindow,
  service: ServiceClient,
  injectedPickerPathInput: string | undefined,
): () => void {
  let injectedPickerPath = injectedPickerPathInput;
  let commitBinding:
    | { draftId: string; expectedDraftVersion: number; reviewDigest: string; commitId: string }
    | undefined;
  const requireSender = (event: IpcMainInvokeEvent): void => {
    requireDesktop(
      !window.isDestroyed() &&
        event.sender.id === window.webContents.id &&
        event.senderFrame === window.webContents.mainFrame,
      'AI7_RENDERER_BOUNDARY_INVALID',
    );
  };

  ipcMain.handle(IPC_CHANNELS.selectAndStageDocx, (event) =>
    envelope<PickerStageResult>(async () => {
      requireSender(event);
      let selectedPath = injectedPickerPath;
      injectedPickerPath = undefined;
      if (!selectedPath) {
        const selected = await dialog.showOpenDialog(window, {
          title: '选择要导入的 DOCX 稿件',
          buttonLabel: '选择稿件',
          properties: ['openFile'],
          filters: [{ name: 'Word 文档', extensions: ['docx'] }],
        });
        if (selected.canceled || selected.filePaths.length !== 1) return { status: 'cancelled' };
        selectedPath = selected.filePaths[0];
      }
      requireDesktop(
        selectedPath !== undefined &&
          isAbsolute(selectedPath) &&
          extname(basename(selectedPath)).toLocaleLowerCase('en-US') === '.docx',
      );
      const staged = await service.call('stageSelectedDocx', { selectionToken: randomUUID(), selectedPath });
      return { status: 'staged', staged };
    }),
  );
  ipcMain.handle(IPC_CHANNELS.prepareNewBookReview, (event, input: ServiceOperationMap['prepareNewBookReview']['input']) =>
    envelope(async () => {
      requireSender(event);
      return service.call('prepareNewBookReview', input);
    }),
  );
  ipcMain.handle(IPC_CHANNELS.commitNewBookImport, (event, input: CommitNewBookRendererInput) =>
    envelope(async () => {
      requireSender(event);
      if (!commitBinding) commitBinding = { ...input, commitId: randomUUID() };
      requireDesktop(
        commitBinding.draftId === input.draftId &&
          commitBinding.expectedDraftVersion === input.expectedDraftVersion &&
          commitBinding.reviewDigest === input.reviewDigest,
      );
      return service.call('commitNewBookImport', commitBinding);
    }),
  );
  ipcMain.handle(IPC_CHANNELS.getManuscriptWindow, (event, input: ServiceOperationMap['getManuscriptWindow']['input']) =>
    envelope(async () => {
      requireSender(event);
      return service.call('getManuscriptWindow', input);
    }),
  );
  ipcMain.handle(IPC_CHANNELS.flushJournalEdit, (event, input: ServiceOperationMap['flushJournalEdit']['input']) =>
    envelope(async () => {
      requireSender(event);
      return service.call('flushJournalEdit', input);
    }),
  );

  return () => {
    for (const channel of Object.values(IPC_CHANNELS)) ipcMain.removeHandler(channel);
  };
}

export async function runApplication(): Promise<void> {
  let service: ServiceClient | undefined;
  let quitting = false;
  let quitReady = false;
  let shutdown: Promise<void> | undefined;
  let window: BrowserWindow | undefined;
  let unregisterHandlers: (() => void) | undefined;
  const stop = (): Promise<void> => {
    if (!service) return Promise.resolve();
    return (shutdown ??= (async () => {
      unregisterHandlers?.();
      unregisterHandlers = undefined;
      await service.stop();
      quitReady = true;
    })());
  };
  const terminate = (): void => {
    if (quitting) return;
    quitting = true;
    window?.destroy();
    void stop().then(
      () => app.exit(1),
      () => app.exit(1),
    );
  };
  const beforeQuit = (event: Electron.Event): void => {
    if (quitReady) return;
    event.preventDefault();
    if (quitting) return;
    quitting = true;
    void stop().then(() => app.quit(), () => app.exit(1));
  };
  const allWindowsClosed = (): void => app.quit();

  try {
    validateRuntime();
    const entryIndex = process.argv.findIndex((value) => resolve(value) === resolve(__filename));
    requireDesktop(entryIndex > 0);
    const launch = parseArguments(process.argv.slice(entryIndex + 1));
    app.enableSandbox();
    const codeRoot = resolve(__dirname, '..', '..');
    const dataRoot = await createCanonicalExternalDataRoot(launch.dataRoot, codeRoot);
    const shellRoot = resolve(dataRoot, 'shell');
    await mkdir(shellRoot, { recursive: true });
    app.setPath('userData', shellRoot);
    await app.whenReady();
    Menu.setApplicationMenu(null);

    const productSession = session.fromPartition('ai7-j01');
    installChromiumDenial(productSession);
    const serviceEntry = resolve(__dirname, '..', 'service', 'index.mjs');
    service = await ServiceClient.start(process.execPath, serviceEntry, dataRoot);
    service.onUnexpectedExit(terminate);
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
    window.once('ready-to-show', () => window?.show());
    unregisterHandlers = registerRendererHandlers(window, service, launch.injectedPickerPath);
    await window.loadFile(resolve(__dirname, '..', 'renderer', 'index.html'));
  } catch {
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
