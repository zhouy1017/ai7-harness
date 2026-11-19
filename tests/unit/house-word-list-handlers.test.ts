import { beforeEach, describe, expect, it, vi } from 'vitest';
const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => Promise<unknown>>());
vi.mock('electron', () => ({ ipcMain: { handle: (key: string, handler: (...args: unknown[]) => Promise<unknown>) => handlers.set(key, handler) } }));
import { registerReviewHandlers } from '../../src/main/review-handlers.js';
import { IPC_CHANNELS } from '../../src/shared/protocol.js';
import { ServiceCallError } from '../../src/main/service-client.js';

// Issue #1543: 本社词表 is read and saved from 知识库, a window on the library route, and from the review sheet, a Book route.
// The two handlers need an owned window and the authority; a write still waits its turn behind the effects, a read never does.

const INPUT = { versionId: null, entryOffset: 0, historyOffset: 0 };
const SAVE = { expectedCurrent: null, sourceKind: 'editor-entry', entries: [] };
const LIBRARY = { route: { kind: 'library' }, bookId: null };
const BOOK = { route: { kind: 'book', bookId: 'b0000000-0000-4000-8000-000000000001' }, bookId: 'b0000000-0000-4000-8000-000000000001' };

function register(options: { authority?: boolean; owned?: boolean } = {}) {
  const call = vi.fn(async (operation: string) => ({ operation }));
  let queue: Promise<unknown> = Promise.resolve();
  const requireCurrentBookRoute = vi.fn((owned: { route?: { kind: string } }) => { if (owned.route?.kind === 'book') return owned.route; throw new ServiceCallError('AI7_EDITOR_ROUTE_INVALID', '当前图书工作台不是可编辑的图书路由；本次读取或写入未执行。'); });
  registerReviewHandlers({
    requireSender: (event: { sender?: object }) => { if (options.owned === false) throw new ServiceCallError('AI7_SENDER_REFUSED', 'not owned'); return event.sender ?? {}; },
    requireAuthority: () => { if (options.authority === false) throw new ServiceCallError('AI7_AUTHORITY_REFUSED', 'no authority'); },
    serializeEffect: (effect: () => Promise<unknown>) => { const next = queue.then(effect, effect); queue = next.catch(() => undefined); return next; },
    requireCurrentBookRoute, service: { call },
  } as unknown as Parameters<typeof registerReviewHandlers>[0]);
  return { call, requireCurrentBookRoute, queue: () => queue, hold: (until: Promise<unknown>) => { queue = queue.then(() => until); } };
}

beforeEach(() => handlers.clear());

describe('the 本社词表 handlers', () => {
  it.each([['library', LIBRARY], ['Book', BOOK]])('answer a read and a write from a window on the %s route, asking for no Book route', async (_name, owned) => {
    const { call, requireCurrentBookRoute } = register();
    const read = handlers.get(IPC_CHANNELS.inspectHouseWordList)!; const write = handlers.get(IPC_CHANNELS.saveHouseWordList)!;
    await expect(read({ sender: owned }, INPUT)).resolves.toEqual({ ok: true, result: { operation: 'inspectHouseWordList' } });
    await expect(write({ sender: owned }, SAVE)).resolves.toEqual({ ok: true, result: { operation: 'saveHouseWordList' } });
    expect(call).toHaveBeenNthCalledWith(1, 'inspectHouseWordList', INPUT);
    expect(call).toHaveBeenNthCalledWith(2, 'saveHouseWordList', SAVE);
    expect(requireCurrentBookRoute).not.toHaveBeenCalled();
  });

  it('refuse both without the authority, and from a sender that is no owned window, before the service is asked', async () => {
    for (const options of [{ authority: false }, { owned: false }]) {
      handlers.clear();
      const { call } = register(options);
      const code = options.authority === false ? 'AI7_AUTHORITY_REFUSED' : 'AI7_SENDER_REFUSED';
      await expect(handlers.get(IPC_CHANNELS.inspectHouseWordList)!({}, INPUT)).resolves.toMatchObject({ ok: false, error: { code } });
      await expect(handlers.get(IPC_CHANNELS.saveHouseWordList)!({}, SAVE)).resolves.toMatchObject({ ok: false, error: { code } });
      expect(call).not.toHaveBeenCalled();
    }
  });

  it('run a write inside the effect queue, behind a held effect, and a read outside it', async () => {
    const { call, hold } = register();
    let release!: () => void;
    hold(new Promise<void>((resolve) => { release = resolve; }));
    const write = handlers.get(IPC_CHANNELS.saveHouseWordList)!({}, SAVE);
    await expect(handlers.get(IPC_CHANNELS.inspectHouseWordList)!({}, INPUT)).resolves.toMatchObject({ ok: true });
    await new Promise((resolve) => setImmediate(resolve));
    expect(call.mock.calls.map(([operation]) => operation)).toEqual(['inspectHouseWordList']);
    release();
    await expect(write).resolves.toMatchObject({ ok: true });
    expect(call.mock.calls.map(([operation]) => operation)).toEqual(['inspectHouseWordList', 'saveHouseWordList']);
  });
});
