import { beforeEach, describe, expect, it, vi } from 'vitest';
const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => Promise<unknown>>());
vi.mock('electron', () => ({ ipcMain: { handle: (key: string, handler: (...args: unknown[]) => Promise<unknown>) => handlers.set(key, handler) }, shell: {} }));
import { lockWindowNavigation, registerSourceBrowserHandler, SOURCE_BROWSER_REFUSALS } from '../../src/main/source-browser.js';
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

function register(options: { answer?: SourceAddressProjection | Error; bookId?: string | null; route?: string; opener?: () => Promise<void> } = {}) {
  const owned = { bookId: options.bookId === undefined ? BOOK : options.bookId,
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
  registerSourceBrowserHandler({ requireSender: () => owned as never, requireAuthority: () => undefined, requireCurrentBookRoute: requireCurrentBookRoute as never, service: { call } as never, opener });
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
    ['another Book', (owned: { bookId: string | null; route: { kind: string; bookId?: string | null } }) => { owned.bookId = OTHER_BOOK; owned.route = { kind: 'book', bookId: OTHER_BOOK }; }, 'AI7_SOURCE_NOT_IN_WINDOW'],
    ['the library', (owned: { bookId: string | null; route: { kind: string; bookId?: string | null } }) => { owned.bookId = null; owned.route = { kind: 'library' }; }, 'AI7_EDITOR_ROUTE_INVALID'],
  ])('refuses when the window has moved to %s by the time the address comes back', async (_name, move, code) => {
    const { call, opener, open, owned } = register();
    call.mockImplementationOnce(async () => { move(owned); return { sourceKind: 'web', address: ADDRESS }; });
    await expect(open({ bookId: BOOK, evidenceId: EVIDENCE })).resolves.toMatchObject({ ok: false, error: { code } });
    expect(opener).not.toHaveBeenCalled();
  });

  it.each([
    ['a source of another Book', 'FACTUAL_VERIFICATION_NOT_FOUND', '这条核查结果不属于这本书。'],
    ['a card the result does not hold', 'FACTUAL_VERIFICATION_SOURCE_NOT_FOUND', '这条核查结果里没有这条来源。'],
    ['a retained source that does not exist', 'RESEARCH_EVIDENCE_NOT_FOUND', '没有这条外部来源留存。'],
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
