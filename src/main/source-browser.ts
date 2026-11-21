import { ipcMain, shell, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ensureCanonicalDataDirectory } from '../shared/data-root.js';
import { IPC_CHANNELS, type ResolvedBookWorkbenchRoute, type SourceIdentityInput, type SourceOpenedProjection } from '../shared/protocol.js';
import { checkBrowserAddress } from '../shared/browser-address.js';
import { ServiceCallError, type ServiceClient } from './service-client.js';
import { UUID_PATTERN, envelope, requireDesktop } from './handler-guards.js';
import type { OwnedRendererWindow } from './application-types.js';

/**
 * 在浏览器中打开 (Issue #1641). AI7's own windows never navigate, open a window or attach a webview; the one way an address
 * leaves the application is this operation: the renderer names a source by its identity, the service answers the address it
 * recorded for it — refusing another Book's — and the address goes to the system browser exactly as recorded, once, only when
 * it is an http / https address the rule in `browser-address.ts` admits, and only for the window that holds that Book.
 */
export type SourceOpener = (address: string) => Promise<void>;

export const SOURCE_BROWSER_REFUSALS = {
  AI7_SOURCE_NOT_IN_WINDOW: '这条来源不属于当前打开的书，没有打开浏览器。',
  AI7_SOURCE_NO_ADDRESS: '这条来源在本书之内，没有网页地址可以打开。',
  AI7_SOURCE_OPEN_FAILED: '系统浏览器没有打开这个地址，可以复制链接后自己打开。',
} as const;

const CARD_ID_PATTERN = /^src_[0-9a-f]{20}$/u;

/** The navigation lock every AI7 window carries, the product window and the hidden print window alike. */
export function lockWindowNavigation(contents: Pick<BrowserWindow['webContents'], 'setWindowOpenHandler' | 'on'>): void {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event: { preventDefault(): void }) => event.preventDefault());
  contents.on('will-attach-webview', (event: { preventDefault(): void }) => event.preventDefault());
}

/** Where J-04's record stands in for the browser: one fixed file in its own directory of the launch's canonical data root. */
export const BROWSER_RECORD_DIRECTORY = 'e2e-browser-record';
export const BROWSER_RECORD_FILE = 'addresses.txt';

/**
 * The system browser — or, under J-04's bare `--j04-browser-record on` (admitted only under the E2E harness), a record file
 * the main process places inside the launch's own data root, never a path a caller names: each address handed over is
 * appended on its own line instead of any browser opening. The directory is created or checked as a real directory of the
 * data root, so a link out of it refuses the launch.
 */
export async function createSourceOpener(dataRoot: string | undefined, record: boolean): Promise<SourceOpener> {
  if (!record) return (address) => shell.openExternal(address);
  requireDesktop(dataRoot !== undefined, 'AI7_DESKTOP_STARTUP_INVALID');
  const recordPath = resolve(await ensureCanonicalDataDirectory(dataRoot, BROWSER_RECORD_DIRECTORY), BROWSER_RECORD_FILE);
  return (address) => appendFile(recordPath, `${address}\n`, 'utf8');
}

function sourceIdentity(input: unknown): SourceIdentityInput {
  requireDesktop(input !== null && typeof input === 'object' && !Array.isArray(input), 'AI7_RENDERER_BOUNDARY_INVALID');
  const value = input as Record<string, unknown>;
  const keys = Object.keys(value).sort().join(',');
  if (keys === 'bookId,evidenceId') {
    requireDesktop(typeof value.bookId === 'string' && UUID_PATTERN.test(value.bookId) && typeof value.evidenceId === 'string' &&
      UUID_PATTERN.test(value.evidenceId), 'AI7_RENDERER_BOUNDARY_INVALID');
    return { bookId: value.bookId, evidenceId: value.evidenceId };
  }
  requireDesktop(keys === 'bookId,cardId,resultId' && typeof value.bookId === 'string' && UUID_PATTERN.test(value.bookId) &&
    typeof value.resultId === 'string' && UUID_PATTERN.test(value.resultId) && typeof value.cardId === 'string' &&
    CARD_ID_PATTERN.test(value.cardId), 'AI7_RENDERER_BOUNDARY_INVALID');
  return { bookId: value.bookId, resultId: value.resultId, cardId: value.cardId };
}

const refuse = (code: keyof typeof SOURCE_BROWSER_REFUSALS): never => {
  throw new ServiceCallError(code, SOURCE_BROWSER_REFUSALS[code]);
};

export function registerSourceBrowserHandler(context: {
  requireSender: (event: IpcMainInvokeEvent | IpcMainEvent) => OwnedRendererWindow;
  requireAuthority: () => void;
  requireCurrentBookRoute: (owned: OwnedRendererWindow) => Extract<ResolvedBookWorkbenchRoute, { kind: 'book' }>;
  requireCurrentRouteGeneration: (owned: OwnedRendererWindow, routeGeneration: number) => void;
  service: Pick<ServiceClient, 'call'>;
  opener: SourceOpener;
}): void {
  const { requireSender, requireAuthority, requireCurrentBookRoute, requireCurrentRouteGeneration, service, opener } = context;
  // One opening per window, route generation and source while it is in flight: a second identical press joins the first.
  const inFlight = new WeakMap<OwnedRendererWindow, Map<string, Promise<SourceOpenedProjection>>>();
  const open = async (owned: OwnedRendererWindow, identity: SourceIdentityInput, routeGeneration: number): Promise<SourceOpenedProjection> => {
    requireAuthority();
    const recorded = await service.call('inspectSourceAddress', identity);
    // Still the same opening of the same Book: leaving and reopening it, or moving to another, opens nothing.
    requireCurrentRouteGeneration(owned, routeGeneration);
    if (requireCurrentBookRoute(owned).bookId !== identity.bookId) refuse('AI7_SOURCE_NOT_IN_WINDOW');
    if (recorded.sourceKind !== 'web') return refuse('AI7_SOURCE_NO_ADDRESS');
    const checked = checkBrowserAddress(recorded.address);
    if (!checked.ok) throw new ServiceCallError('AI7_SOURCE_ADDRESS_REFUSED', checked.sentence);
    try {
      await opener(checked.address);
    } catch {
      refuse('AI7_SOURCE_OPEN_FAILED');
    }
    return { host: checked.host };
  };
  ipcMain.handle(IPC_CHANNELS.openSourceInBrowser, (event, input: unknown) =>
    envelope(async (): Promise<SourceOpenedProjection> => {
      const owned = requireSender(event);
      const identity = sourceIdentity(input);
      if (requireCurrentBookRoute(owned).bookId !== identity.bookId) refuse('AI7_SOURCE_NOT_IN_WINDOW');
      const routeGeneration = owned.routeGeneration;
      const key = `${routeGeneration}:${'evidenceId' in identity ? `evidence:${identity.evidenceId}` : `card:${identity.resultId}:${identity.cardId}`}`;
      const pending = inFlight.get(owned) ?? new Map<string, Promise<SourceOpenedProjection>>();
      inFlight.set(owned, pending);
      const joined = pending.get(key);
      if (joined !== undefined) return joined;
      const opening = open(owned, identity, routeGeneration).finally(() => pending.delete(key));
      pending.set(key, opening);
      return opening;
    }),
  );
}
