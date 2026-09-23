declare module 'electron' {
  export type Event = { preventDefault(): void };
  export type IpcMainInvokeEvent = {
    sender: { id: number };
    senderFrame: unknown;
  };
  export type IpcMainEvent = IpcMainInvokeEvent;
  export type Session = {
    webRequest: {
      onBeforeRequest(
        filter: { urls: string[] },
        listener: (details: unknown, callback: (response: { cancel: boolean }) => void) => void,
      ): void;
    };
    setPermissionCheckHandler(handler: () => boolean): void;
    setPermissionRequestHandler(handler: (webContents: unknown, permission: unknown, callback: (allowed: boolean) => void) => void): void;
    on(event: 'will-download', listener: (event: Event) => void): void;
  };
  export class BrowserWindow {
    constructor(options: Record<string, unknown>);
    readonly webContents: {
      id: number;
      mainFrame: unknown;
      send(channel: string): void;
      setWindowOpenHandler(handler: () => { action: 'deny' }): void;
      on(event: string, listener: (...args: any[]) => void): void;
      cut(): void;
      copy(): void;
      paste(): void;
      pasteAndMatchStyle(): void;
      /** The PDF export's print of a staged page (Issue #500, S64b). */
      printToPDF(options: { pageSize: 'A4'; printBackground: boolean; preferCSSPageSize: boolean }): Promise<Uint8Array>;
    };
    destroy(): void;
    focus(): void;
    isDestroyed(): boolean;
    isMinimized(): boolean;
    isVisible(): boolean;
    loadFile(path: string): Promise<void>;
    on(event: string, listener: (...args: any[]) => void): void;
    once(event: 'ready-to-show', listener: () => void): void;
    restore(): void;
    show(): void;
  }
  export const app: {
    commandLine: { getSwitchValue(name: string): string };
    enableSandbox(): void;
    getPath(name: 'userData' | 'documents'): string;
    requestSingleInstanceLock(): boolean;
    setPath(name: 'userData', path: string): void;
    whenReady(): Promise<void>;
    on(event: string, listener: (...args: any[]) => void): void;
    removeListener(event: string, listener: (...args: any[]) => void): void;
    exit(code?: number): void;
    quit(): void;
  };
  export const contextBridge: { exposeInMainWorld(name: string, api: unknown): void };
  export const dialog: {
    showOpenDialog(
      window: BrowserWindow,
      options: Record<string, unknown>,
    ): Promise<{ canceled: boolean; filePaths: string[] }>;
    showSaveDialog(
      window: BrowserWindow,
      options: Record<string, unknown>,
    ): Promise<{ canceled: boolean; filePath?: string }>;
  };
  export const ipcMain: {
    handle(channel: string, listener: (event: IpcMainInvokeEvent, input?: any) => unknown): void;
    on(channel: string, listener: (event: IpcMainEvent, input?: any) => void): void;
    removeListener(channel: string, listener: (event: IpcMainEvent, input?: any) => void): void;
    removeHandler(channel: string): void;
  };
  export const ipcRenderer: {
    invoke(channel: string, input?: unknown): Promise<unknown>;
    on(channel: string, listener: () => void): void;
    send(channel: string, input?: unknown): void;
  };
  export const Menu: { setApplicationMenu(menu: null): void };
  export const session: { defaultSession: Session; fromPartition(partition: string): Session };
  export const shell: { showItemInFolder(path: string): void };
}
