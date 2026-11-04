import { beforeEach, describe, expect, it, vi } from 'vitest';
const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => Promise<unknown>>());
vi.mock('electron', () => ({ ipcMain: { handle: (key: string, handler: (...args: unknown[]) => Promise<unknown>) => handlers.set(key, handler) } }));
import { registerProductionAndPackageHandlers } from '../../src/main/deliverables-handlers.js';
import { IPC_CHANNELS } from '../../src/shared/protocol.js';
import { ServiceCallError } from '../../src/main/service-client.js';

beforeEach(() => handlers.clear());
describe('cross-Book overview bridge', () => {
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
