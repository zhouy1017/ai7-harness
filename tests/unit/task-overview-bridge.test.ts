import { beforeEach, describe, expect, it, vi } from 'vitest';
const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => Promise<unknown>>());
vi.mock('electron', () => ({ ipcMain: { handle: (key: string, handler: (...args: unknown[]) => Promise<unknown>) => handlers.set(key, handler) } }));
import { registerProductionAndPackageHandlers } from '../../src/main/deliverables-handlers.js';
import { IPC_CHANNELS } from '../../src/shared/protocol.js';
import { ServiceCallError } from '../../src/main/service-client.js';

beforeEach(() => handlers.clear());
describe('cross-Book overview bridge', () => {
  it('owns optional review-reference preparation through job completion in the selected Book', async () => {
    const bookId = 'b0000000-0000-4000-8000-000000000001'; const owned = { routeGeneration: 1 };
    const call = vi.fn(async (operation: string) => operation === 'inspectTaskOverview' ? { books: [{ bookId }] }
      : operation === 'prepareReviewRun' ? { jobId: 'job', state: 'running' } : { jobId: 'job', state: 'completed', result: { bookId } });
    registerProductionAndPackageHandlers({ requireSender: () => owned, requireAuthority: () => {},
      serializeEffect: (effect: () => Promise<unknown>) => effect(), requireCurrentRouteGeneration: () => {}, service: { call },
    } as unknown as Parameters<typeof registerProductionAndPackageHandlers>[0]);
    await handlers.get(IPC_CHANNELS.inspectTaskOverview)!({});
    await expect(handlers.get(IPC_CHANNELS.taskOverviewCall)!({}, { bookId, operation: 'prepareReviewRun', input: { categoryIds: ['typos-and-usage'] } }))
      .resolves.toMatchObject({ ok: true, result: { state: 'completed', result: { bookId } } });
    expect(call).toHaveBeenCalledWith('prepareReviewRun', { bookId, categoryIds: ['typos-and-usage'] });
    expect(call).toHaveBeenCalledWith('pollServiceJob', { jobId: 'job' });
  });
  it('refuses a Book that this window has not read in the overview', async () => {
    const call = vi.fn();
    registerProductionAndPackageHandlers({ requireSender: () => ({}), requireAuthority: () => {}, service: { call } } as unknown as Parameters<typeof registerProductionAndPackageHandlers>[0]);
    const result = await handlers.get(IPC_CHANNELS.taskOverviewCall)!({}, { bookId: 'b0000000-0000-4000-8000-000000000001', operation: 'inspectTaskPlan', input: {} });
    expect(result).toMatchObject({ ok: false, error: { code: 'TASK_OVERVIEW_INVALID' } }); expect(call).not.toHaveBeenCalled();
  });
  it.each(['wrong-book', 'stale-route'])('still rejects a scoped drawer response with %s', async (scenario) => {
    const bookId = 'b0000000-0000-4000-8000-000000000001'; const owned = { routeGeneration: 1 };
    registerProductionAndPackageHandlers({ requireSender: () => owned, requireAuthority: () => {}, serializeEffect: (effect: () => Promise<unknown>) => effect(),
      service: { call: async (operation: string) => { if (operation === 'inspectTaskOverview') return { books: [{ bookId }] }; if (scenario === 'stale-route') owned.routeGeneration += 1; return { bookId: 'other-book' }; } },
      requireCurrentRouteGeneration: (_owned: unknown, generation: number) => { if (generation !== owned.routeGeneration) throw new ServiceCallError('AI7_SERVICE_ROUTE_STALE', '较早的本地结果未显示。'); },
    } as unknown as Parameters<typeof registerProductionAndPackageHandlers>[0]);
    await handlers.get(IPC_CHANNELS.inspectTaskOverview)!({});
    await expect(handlers.get(IPC_CHANNELS.taskOverviewCall)!({}, { bookId, operation: 'inspectTaskPlan', input: {} })).resolves.toMatchObject({ ok: false, error: { code: scenario === 'stale-route' ? 'AI7_SERVICE_ROUTE_STALE' : 'TASK_OVERVIEW_INVALID' } });
  });
  it('keeps the global overview readable while a Book route changes', async () => {
    const owned = { routeGeneration: 1 };
    const projection = { books: [] };
    registerProductionAndPackageHandlers({ requireSender: () => owned, requireAuthority: () => {},
      service: { call: async () => { owned.routeGeneration = 2; return projection; } },
      requireCurrentRouteGeneration: (_owned: unknown, generation: number) => { if (generation !== owned.routeGeneration) throw new ServiceCallError('AI7_SERVICE_ROUTE_STALE', '较早的本地结果未显示。'); },
    } as unknown as Parameters<typeof registerProductionAndPackageHandlers>[0]);
    await expect(handlers.get(IPC_CHANNELS.inspectTaskOverview)!({})).resolves.toEqual({ ok: true, result: projection });
  });
});

describe('evaluation references on the task overview', () => {
  const bookA = 'a0000000-0000-4000-8000-000000000001';
  const bookB = 'b0000000-0000-4000-8000-000000000002';
  const material = { materialId: 'material-b', title: 'B', characters: 2, scope: 'book', selectable: true, reason: null };
  const series = { seriesId: 'series-b', title: 'B' };
  const page = {
    bookId: bookB, record: {}, records: [{}], initial: {}, readersReport: {}, materialReferences: {}, rewrite: {},
    materials: { statement: '', more: 1, frozen: [], items: [{ ...material, extractedText: 'omitted' }] },
    market: { series: [{ ...series, actuals: {} }], pricing: {}, comparables: [{}] },
  };
  function bridge(activeBook: string | null = bookA) {
    const window = { bookId: activeBook, routeGeneration: 1 };
    const otherWindow = { bookId: activeBook, routeGeneration: 1 };
    const inspect = vi.fn<() => unknown>().mockReturnValue(page);
    const beforeDispatch = vi.fn();
    const serviceCall = vi.fn(async (operation: string) => {
      if (operation === 'inspectTaskOverview') return { books: [{ bookId: bookA }, { bookId: bookB }] };
      if (operation === 'inspectEvaluation') return inspect();
      throw new Error('unexpected service call');
    });
    registerProductionAndPackageHandlers({
      requireSender: (event: unknown) => event === window ? window : otherWindow,
      requireAuthority: () => {},
      serializeEffect: (effect: () => Promise<unknown>) => { beforeDispatch(); return effect(); },
      requireCurrentRouteGeneration: (sender: typeof window, generation: number) => {
        if (generation !== sender.routeGeneration) throw new ServiceCallError('AI7_SERVICE_ROUTE_STALE', '较早的本地结果未显示。');
      },
      service: { call: serviceCall },
    } as unknown as Parameters<typeof registerProductionAndPackageHandlers>[0]);
    return {
      window, otherWindow, inspect, serviceCall, beforeDispatch,
      list: () => handlers.get(IPC_CHANNELS.inspectTaskOverview)!(window),
      read: (bookId: string, input: unknown, sender = window) =>
        handlers.get(IPC_CHANNELS.taskOverviewCall)!(sender, { operation: 'inspectEvaluationReferences', bookId, input }),
    };
  }

  it.each([null, bookA])('reads only the listed target book references with active book %s', async activeBook => {
    const api = bridge(activeBook);
    await api.list();
    await expect(api.read(bookB, { recordId: null })).resolves.toEqual({ ok: true, result: {
      bookId: bookB, materials: { statement: '', more: 1, items: [material] }, market: { series: [series] },
    } });
    expect(api.serviceCall).toHaveBeenLastCalledWith('inspectEvaluation', { bookId: bookB, recordId: null });
    expect(api.window.bookId).toBe(activeBook);
  });

  it('requires a book listed for this sender and the exact initial reference read', async () => {
    const api = bridge();
    await api.list();
    const refused = { ok: false, error: { code: 'TASK_OVERVIEW_INVALID' } };
    await expect(api.read(bookB, { recordId: null }, api.otherWindow)).resolves.toMatchObject(refused);
    await expect(api.read('c0000000-0000-4000-8000-000000000003', { recordId: null })).resolves.toMatchObject(refused);
    for (const input of [null, [], {}, 'invalid', { recordId: 'older' }, { recordId: null, recordsBefore: null }, { recordId: null, bookId: bookA }]) {
      await expect(api.read(bookB, input)).resolves.toMatchObject(refused);
    }
    expect(api.serviceCall).toHaveBeenCalledTimes(1);
  });

  it.each([bookA, undefined])('withholds a result with book identity %s', async bookId => {
    const api = bridge();
    api.inspect.mockReturnValue({ ...page, bookId });
    await api.list();
    await expect(api.read(bookB, { recordId: null })).resolves.toMatchObject({ ok: false, error: { code: 'TASK_OVERVIEW_INVALID' } });
  });

  it.each(['queued', 'in flight'])('withholds a read when the route changes while %s', async stage => {
    const api = bridge();
    await api.list();
    const changeRoute = () => { api.window.routeGeneration += 1; return page; };
    if (stage === 'queued') api.beforeDispatch.mockImplementation(changeRoute);
    else api.inspect.mockImplementation(changeRoute);
    await expect(api.read(bookB, { recordId: null })).resolves.toMatchObject({ ok: false, error: { code: 'AI7_SERVICE_ROUTE_STALE' } });
    expect(api.inspect).toHaveBeenCalledTimes(stage === 'queued' ? 0 : 1);
  });
});
