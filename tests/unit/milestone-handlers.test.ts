import { beforeEach, describe, expect, it, vi } from 'vitest';
const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => Promise<unknown>>());
vi.mock('electron', () => ({ ipcMain: { handle: (key: string, handler: (...args: unknown[]) => Promise<unknown>) => handlers.set(key, handler) } }));
import { registerMilestoneHandlers } from '../../src/main/milestone-handlers.js';
import { IPC_CHANNELS } from '../../src/shared/protocol.js';
import { ServiceCallError } from '../../src/main/service-client.js';

// Issue #1639: 存为里程碑 from 交付物 works for a window that has the Book open but has not opened the manuscript.
// The guards below are the ones application.ts defines (the same refusals and keys), over a small owned window.

const BOOK = 'b0000000-0000-4000-8000-000000000001';
const OTHER_BOOK = 'b0000000-0000-4000-8000-000000000002';
const INPUT = { manuscriptId: 'a0000000-0000-4000-8000-000000000001', branchId: 'c0000000-0000-4000-8000-000000000001', label: '定稿', purposeKind: 'stage-archive', purpose: null, note: '' };

function setup(options: { route?: 'book' | 'library'; held?: boolean; windowOf?: (input: { manuscriptId: string; branchId: string }) => Promise<unknown> } = {}) {
  const owned = { route: options.route === 'library' ? { kind: 'library' } : { kind: 'book', bookId: BOOK },
    routeGeneration: 3, manuscriptCapabilities: new Map<string, unknown>() };
  const key = (input: { manuscriptId: string; branchId: string }) => `${input.manuscriptId}:${input.branchId}`;
  if (options.held === true) owned.manuscriptCapabilities.set(key(INPUT), { bookId: BOOK, ...INPUT, routeGeneration: 3 });
  const requireCurrentBookRoute = (window: typeof owned) => {
    if (window.route.kind === 'book') return window.route;
    throw new ServiceCallError('AI7_EDITOR_ROUTE_INVALID', '当前图书工作台不是可编辑的图书路由；本次读取或写入未执行。');
  };
  const requireManuscriptCapability = (window: typeof owned, input: { manuscriptId: string; branchId: string }) => {
    requireCurrentBookRoute(window);
    const held = window.manuscriptCapabilities.get(key(input));
    if (held === undefined) throw new ServiceCallError('AI7_EDITOR_CAPABILITY_INVALID', '当前窗口没有这份稿件与分支的可编辑能力；本次读取或写入未执行。');
    return held;
  };
  const rememberManuscriptCapability = (window: typeof owned, projection: { bookId: string; manuscriptId: string; branchId: string }, expected: { manuscriptId: string; branchId: string }, generation: number) => {
    if (projection.bookId !== BOOK || projection.manuscriptId !== expected.manuscriptId || projection.branchId !== expected.branchId) {
      throw new ServiceCallError('AI7_EDITOR_ROUTE_INVALID', '稿件读取结果不属于当前图书工作台；结果未显示。');
    }
    const capability = { bookId: projection.bookId, manuscriptId: projection.manuscriptId, branchId: projection.branchId, routeGeneration: generation };
    window.manuscriptCapabilities.set(key(expected), capability);
    return capability;
  };
  const call = vi.fn(async (operation: string, input: { manuscriptId: string; branchId: string }) => {
    if (operation === 'getManuscriptWindow') return (options.windowOf ?? (async (target) => ({ bookId: BOOK, ...target })))(input);
    return { manuscriptId: input.manuscriptId, branchId: input.branchId, milestoneId: 'm' };
  });
  registerMilestoneHandlers({
    requireSender: () => owned,
    requireAuthority: () => undefined,
    requireCurrentBookRoute, requireManuscriptCapability, rememberManuscriptCapability,
    requireResourceIdentity: () => undefined,
    service: { call },
    serializeEffect: (effect: () => Promise<unknown>) => effect(),
  } as unknown as Parameters<typeof registerMilestoneHandlers>[0]);
  const save = () => handlers.get(IPC_CHANNELS.saveMilestone)!({}, INPUT) as Promise<{ ok: boolean; error?: { code?: string } }>;
  return { owned, call, save };
}

beforeEach(() => handlers.clear());

describe('存为里程碑', () => {
  it('obtains the manuscript capability for a window that has the Book open but never opened the manuscript', async () => {
    const { owned, call, save } = setup();
    expect((await save()).ok).toBe(true);
    expect(call.mock.calls.map(([operation]) => operation)).toEqual(['getManuscriptWindow', 'saveMilestone']);
    expect(call).toHaveBeenNthCalledWith(1, 'getManuscriptWindow', { manuscriptId: INPUT.manuscriptId, branchId: INPUT.branchId, cursor: null });
    expect(owned.manuscriptCapabilities.size).toBe(1);
  });

  it('reads nothing more for a window that already holds the capability', async () => {
    const { call, save } = setup({ held: true });
    expect((await save()).ok).toBe(true);
    expect(call.mock.calls.map(([operation]) => operation)).toEqual(['saveMilestone']);
  });

  it('is refused, with no read and no save, in a window with no Book open', async () => {
    const { owned, call, save } = setup({ route: 'library' });
    const answer = await save();
    expect(answer.ok).toBe(false);
    expect(call).not.toHaveBeenCalled();
    expect(owned.manuscriptCapabilities.size).toBe(0);
  });

  it('is refused, and remembers nothing, for a manuscript that belongs to another Book', async () => {
    const { owned, call, save } = setup({ windowOf: async (target) => ({ bookId: OTHER_BOOK, ...target }) });
    expect((await save()).ok).toBe(false);
    expect(call.mock.calls.map(([operation]) => operation)).toEqual(['getManuscriptWindow']);
    expect(owned.manuscriptCapabilities.size).toBe(0);
  });

  it('is refused, and remembers nothing, for a branch that does not exist in the Book', async () => {
    const { owned, call, save } = setup({ windowOf: async () => { throw new ServiceCallError('MANUSCRIPT_BRANCH_NOT_FOUND', '稿件分支不存在。'); } });
    const answer = await save();
    expect(answer.ok).toBe(false);
    expect(call.mock.calls.map(([operation]) => operation)).toEqual(['getManuscriptWindow']);
    expect(owned.manuscriptCapabilities.size).toBe(0);
  });
});
