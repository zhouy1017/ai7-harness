import { TASK_OVERVIEW_OPERATIONS, type RendererApi, type TaskOverviewCall, type TaskOverviewOperation } from '../shared/protocol.js';

export function taskOverviewApi<T extends RendererApi>(api: T, book: () => string | null): T {
  const operations = new Set<string>(TASK_OVERVIEW_OPERATIONS);
  return new Proxy({ ...api }, { get(target, key) {
    const bookId = book();
    if (typeof key !== 'string' || !operations.has(key) || bookId === null) return Reflect.get(target, key);
    return (input: Record<string, unknown> = {}) => api.taskOverviewCall({ operation: key as TaskOverviewOperation, bookId, input } as TaskOverviewCall);
  } });
}
