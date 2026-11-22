import { ServiceCallError } from './service-client.js';
import type { BookFindingsReadProjection, InspectBookFindingsInput } from '../shared/protocol/review.js';

/** The renderer polls once; main collects private snapshot chunks and retries an evicted snapshot once. */
export async function readBookFindings(input: InspectBookFindingsInput | undefined,
  read: (request: InspectBookFindingsInput) => Promise<BookFindingsReadProjection>): Promise<BookFindingsReadProjection> {
  if (!input?.whole) return read(input ?? { offset: 0 });
  const collect = async (): Promise<BookFindingsReadProjection> => {
    const first = await read({ ...input, offset: 0 });
    if (first.unchanged) return first;
    const items = [...first.items];
    let next = first.next;
    while (next !== null) {
      const tail = await read({ ...input, since: first.version, offset: next });
      items.push(...tail.items); next = tail.next;
    }
    return { ...first, items, offset: 0, next: null };
  };
  try { return await collect(); }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'FINDINGS_VERSION_CHANGED') return collect();
    throw error;
  }
}
/** Keep the complete collection under the route epoch captured by its caller, including its Book binding. */
export async function readBookFindingsInRoute(input: InspectBookFindingsInput | undefined, bookId: string,
  read: (request: InspectBookFindingsInput) => Promise<BookFindingsReadProjection>, assertCurrent: () => void): Promise<BookFindingsReadProjection> {
  const result = await readBookFindings(input, read);
  assertCurrent();
  if (result.bookId !== bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '发现不属于当前图书。');
  return result;
}
