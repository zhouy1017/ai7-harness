import { mkdir, mkdtemp, readFile, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => Promise<unknown>>());
vi.mock('electron', () => ({ ipcMain: { handle: (key: string, handler: (...args: unknown[]) => Promise<unknown>) => handlers.set(key, handler) }, shell: {} }));
import { BROWSER_RECORD_DIRECTORY, BROWSER_RECORD_FILE, createSourceOpener, lockWindowNavigation, registerSourceBrowserHandler, SOURCE_BROWSER_REFUSALS } from '../../src/main/source-browser.js';
import { BROWSER_ADDRESS_REFUSALS } from '../../src/shared/browser-address.js';
import { IPC_CHANNELS, type SourceAddressProjection } from '../../src/shared/protocol.js';
import { ServiceCallError } from '../../src/main/service-client.js';

// Issue #1641: 在浏览器中打开 names a source by its identity; the service answers the recorded address, and the opener is
// called once for an address the rule admits, from the window that holds the source's Book — and never otherwise.

const BOOK = 'b0000000-0000-4000-8000-000000000001';
const OTHER_BOOK = 'b0000000-0000-4000-8000-000000000002';
const RESULT = 'c0000000-0000-4000-8000-000000000001';
const EVIDENCE = 'd0000000-0000-4000-8000-000000000001';
const CARD = 'src_0123456789abcdef0123';
const ADDRESS = 'https://museum.example.org/zenghouyi/zunpan?utm_source=x';

type FakeWindow = { bookId: string | null; route: { kind: string; bookId?: string | null }; routeGeneration: number };
// As main's assignRoute and leave do: every route change is a new generation.
const moveTo = (owned: FakeWindow, bookId: string | null): void => {
  owned.bookId = bookId; owned.route = bookId === null ? { kind: 'library' } : { kind: 'book', bookId }; owned.routeGeneration += 1;
};

function register(options: { answer?: SourceAddressProjection | Error; bookId?: string | null; route?: string; opener?: () => Promise<void> } = {}) {
  const owned: FakeWindow = { bookId: options.bookId === undefined ? BOOK : options.bookId, routeGeneration: 1,
    route: options.route === 'library' ? { kind: 'library' } : { kind: 'book', bookId: options.bookId === undefined ? BOOK : options.bookId } };
  const call = vi.fn(async () => {
    const answer = options.answer ?? { sourceKind: 'web', address: ADDRESS };
    if (answer instanceof Error) throw answer;
    return answer;
  });
  const opener = vi.fn(options.opener ?? (async () => undefined));
  const requireCurrentBookRoute = (window: typeof owned) => {
    if (window.route.kind !== 'book' || window.bookId !== window.route.bookId) throw new ServiceCallError('AI7_EDITOR_ROUTE_INVALID', '当前图书工作台不是可编辑的图书路由；本次读取或写入未执行。');
    return window.route as never;
  };
  const requireCurrentRouteGeneration = (window: typeof owned, routeGeneration: number) => {
    if (window.routeGeneration !== routeGeneration) throw new ServiceCallError('AI7_SERVICE_ROUTE_STALE', '图书工作台路由已经更新；较早的本地结果未显示。');
  };
  registerSourceBrowserHandler({ requireSender: () => owned as never, requireAuthority: () => undefined, requireCurrentBookRoute: requireCurrentBookRoute as never,
    requireCurrentRouteGeneration: requireCurrentRouteGeneration as never, service: { call } as never, opener });
  const open = (input: unknown) => handlers.get(IPC_CHANNELS.openSourceInBrowser)!({}, input);
  return { call, opener, open, owned };
}

beforeEach(() => handlers.clear());

describe('在浏览器中打开', () => {
  it.each([
    ['a source card', { bookId: BOOK, resultId: RESULT, cardId: CARD }],
    ['a retained source', { bookId: BOOK, evidenceId: EVIDENCE }],
  ])('hands the recorded address of %s to the opener exactly once and answers its host', async (_name, input) => {
    const { call, opener, open } = register();
    await expect(open(input)).resolves.toEqual({ ok: true, result: { host: 'museum.example.org' } });
    expect(call).toHaveBeenCalledExactlyOnceWith('inspectSourceAddress', input);
    expect(opener).toHaveBeenCalledExactlyOnceWith(ADDRESS);
  });

  it.each(['file:///C:/Windows/notepad.exe', 'javascript:alert(1)', '\\\\server\\share', 'https://user:pass@example.org/'])(
    'refuses a recorded address the rule does not admit (%s) and never calls the opener', async (address) => {
      const { opener, open } = register({ answer: { sourceKind: 'web', address } });
      const answer = await open({ bookId: BOOK, resultId: RESULT, cardId: CARD }) as { ok: false; error: { code: string; message: string } };
      expect(answer.ok).toBe(false);
      expect(answer.error.code).toBe('AI7_SOURCE_ADDRESS_REFUSED');
      expect(Object.values(BROWSER_ADDRESS_REFUSALS)).toContain(answer.error.message);
      expect(answer.error.message).not.toContain(address);
      expect(opener).not.toHaveBeenCalled();
    });

  it('refuses an in-Book source, which has no address', async () => {
    const { opener, open } = register({ answer: { sourceKind: 'in-book', address: null } });
    await expect(open({ bookId: BOOK, resultId: RESULT, cardId: CARD })).resolves.toEqual({ ok: false,
      error: { code: 'AI7_SOURCE_NO_ADDRESS', message: SOURCE_BROWSER_REFUSALS.AI7_SOURCE_NO_ADDRESS } });
    expect(opener).not.toHaveBeenCalled();
  });

  it.each([
    ['another Book', { bookId: OTHER_BOOK }, 'AI7_SOURCE_NOT_IN_WINDOW'],
    ['the library route', { route: 'library' }, 'AI7_EDITOR_ROUTE_INVALID'],
  ])('refuses from a window that holds %s, before the service is asked', async (_name, options, code) => {
    const { call, opener, open } = register(options);
    await expect(open({ bookId: BOOK, resultId: RESULT, cardId: CARD })).resolves.toMatchObject({ ok: false, error: { code } });
    expect(call).not.toHaveBeenCalled();
    expect(opener).not.toHaveBeenCalled();
  });

  it.each([
    ['moved to another Book', (owned: FakeWindow) => moveTo(owned, OTHER_BOOK)],
    ['moved to the library', (owned: FakeWindow) => moveTo(owned, null)],
    // Round 1 finding 2: the same Book, left and opened again, is a later opening; the earlier press opens nothing.
    ['left the Book and opened it again', (owned: FakeWindow) => { moveTo(owned, null); moveTo(owned, BOOK); }],
  ])('refuses when the window has %s by the time the address comes back', async (_name, move) => {
    const { call, opener, open, owned } = register();
    call.mockImplementationOnce(async () => { move(owned); return { sourceKind: 'web', address: ADDRESS }; });
    await expect(open({ bookId: BOOK, evidenceId: EVIDENCE })).resolves.toMatchObject({ ok: false, error: { code: 'AI7_SERVICE_ROUTE_STALE' } });
    expect(opener).not.toHaveBeenCalled();
  });

  // Round 1 finding 3: two identical presses in flight open the browser once; a press after the first settled opens again.
  it('joins an identical request in flight to the first, and opens again once the first has settled', async () => {
    const { call, opener, open } = register();
    let answer!: (value: SourceAddressProjection) => void;
    call.mockImplementationOnce(() => new Promise<SourceAddressProjection>((resolve) => { answer = resolve; }));
    const card = { bookId: BOOK, resultId: RESULT, cardId: CARD };
    const both = Promise.all([open(card), open({ ...card })]);
    await vi.waitFor(() => expect(call).toHaveBeenCalledOnce());
    answer({ sourceKind: 'web', address: ADDRESS });
    expect(await both).toEqual([{ ok: true, result: { host: 'museum.example.org' } }, { ok: true, result: { host: 'museum.example.org' } }]);
    expect(call).toHaveBeenCalledOnce();
    expect(opener).toHaveBeenCalledOnce();
    await expect(open(card)).resolves.toMatchObject({ ok: true });
    expect(opener).toHaveBeenCalledTimes(2);
  });

  it('keeps different sources apart while both are in flight, and lets a refused one be pressed again', async () => {
    const { call, opener, open } = register();
    await Promise.all([open({ bookId: BOOK, resultId: RESULT, cardId: CARD }), open({ bookId: BOOK, evidenceId: EVIDENCE })]);
    expect(opener).toHaveBeenCalledTimes(2);
    call.mockImplementationOnce(async () => { throw new ServiceCallError('RESEARCH_EVIDENCE_NOT_FOUND', '这本书里没有这条外部来源留存。'); });
    await expect(open({ bookId: BOOK, evidenceId: EVIDENCE })).resolves.toMatchObject({ ok: false });
    await expect(open({ bookId: BOOK, evidenceId: EVIDENCE })).resolves.toMatchObject({ ok: true });
    expect(opener).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['a source of another Book', 'FACTUAL_VERIFICATION_NOT_FOUND', '这条核查结果不属于这本书。'],
    ['a card the result does not hold', 'FACTUAL_VERIFICATION_SOURCE_NOT_FOUND', '这条核查结果里没有这条来源。'],
    ['a retained source this Book does not hold', 'RESEARCH_EVIDENCE_NOT_FOUND', '这本书里没有这条外部来源留存。'],
  ])('passes the service refusal of %s through and opens nothing', async (_name, code, message) => {
    const { opener, open } = register({ answer: new ServiceCallError(code, message) });
    await expect(open({ bookId: BOOK, resultId: RESULT, cardId: CARD })).resolves.toEqual({ ok: false, error: { code, message } });
    expect(opener).not.toHaveBeenCalled();
  });

  it('says so in a plain sentence when the system browser does not open', async () => {
    const { opener, open } = register({ opener: async () => { throw new Error('no handler'); } });
    await expect(open({ bookId: BOOK, evidenceId: EVIDENCE })).resolves.toEqual({ ok: false,
      error: { code: 'AI7_SOURCE_OPEN_FAILED', message: SOURCE_BROWSER_REFUSALS.AI7_SOURCE_OPEN_FAILED } });
    expect(opener).toHaveBeenCalledOnce();
  });

  it.each([
    null, 'https://example.org/', [], { address: ADDRESS }, { bookId: BOOK, url: ADDRESS }, { bookId: BOOK },
    { bookId: BOOK, resultId: RESULT, cardId: CARD, address: ADDRESS },
    { bookId: BOOK, resultId: RESULT, cardId: CARD, evidenceId: EVIDENCE },
    { bookId: BOOK, evidenceId: EVIDENCE, address: ADDRESS },
    { bookId: 'book', evidenceId: EVIDENCE }, { bookId: BOOK, evidenceId: 'latest' },
    { bookId: BOOK, resultId: RESULT, cardId: 'src_XYZ' }, { bookId: BOOK, resultId: RESULT, cardId: `${CARD}0` },
  ])('refuses a request that names no single source identity: %j', async (input) => {
    const { call, opener, open } = register();
    await expect(open(input)).resolves.toMatchObject({ ok: false, error: { code: 'DESKTOP_REQUEST_FAILED' } });
    expect(call).not.toHaveBeenCalled();
    expect(opener).not.toHaveBeenCalled();
  });
});

// Round 1 finding 1: the record file is never a path a caller names; it sits in its own real directory of the data root.
describe('the Journey record that stands in for the browser', () => {
  it('appends each address to the fixed file inside the data root, and refuses a record directory that links out of it', async () => {
    const parent = await realpath(await mkdtemp(join(tmpdir(), 'ai7-browser-record-')));
    try {
      const dataRoot = join(parent, 'data');
      await mkdir(dataRoot);
      const opener = await createSourceOpener(dataRoot, true);
      await opener(ADDRESS);
      await opener('https://example.org/');
      await expect(readFile(join(dataRoot, BROWSER_RECORD_DIRECTORY, BROWSER_RECORD_FILE), 'utf8')).resolves.toBe(`${ADDRESS}\nhttps://example.org/\n`);
      const linked = join(parent, 'linked');
      const outside = join(parent, 'outside');
      await mkdir(join(linked));
      await mkdir(outside);
      await symlink(outside, join(linked, BROWSER_RECORD_DIRECTORY), 'junction');
      await expect(createSourceOpener(linked, true)).rejects.toThrow();
      await expect(createSourceOpener(undefined, true)).rejects.toThrow();
    } finally { await rm(parent, { recursive: true, force: true }); }
  });
});

describe('the window navigation lock', () => {
  it('denies every new window, and prevents navigation and webviews', () => {
    let openHandler: (() => unknown) | undefined;
    const listeners = new Map<string, (event: { preventDefault(): void }) => void>();
    lockWindowNavigation({ setWindowOpenHandler: (handler) => { openHandler = handler; }, on: (name, listener) => { listeners.set(name, listener); } });
    expect(openHandler?.()).toEqual({ action: 'deny' });
    for (const name of ['will-navigate', 'will-attach-webview']) {
      const event = { preventDefault: vi.fn() };
      listeners.get(name)!(event);
      expect(event.preventDefault).toHaveBeenCalledOnce();
    }
  });
});
