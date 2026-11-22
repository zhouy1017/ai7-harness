import { MAX_FRAME_BYTES, type BookFindingsReadProjection } from '../shared/protocol.js';

/** The renderer sees one whole list. Only its private transport uses byte-bounded snapshot tails. */
export function bookFindingsChunk(answer: BookFindingsReadProjection, whole: boolean): BookFindingsReadProjection {
  if (!whole || answer.unchanged) return answer;
  // Leave 4 KiB for the response envelope and its identity; the hard frame guard remains unchanged.
  const budget = MAX_FRAME_BYTES - 4096 - Buffer.byteLength(JSON.stringify({ ...answer, items: [] }), 'utf8');
  let bytes = 0, count = 0;
  for (const item of answer.items) {
    const size = Buffer.byteLength(JSON.stringify(item), 'utf8') + (count > 0 ? 1 : 0);
    if (bytes + size > budget) break;
    bytes += size; count++;
  }
  // An individual row that cannot fit still meets the existing RESPONSE_TOO_LARGE guard, never a stalled cursor.
  return count === 0 || count === answer.items.length ? answer
    : { ...answer, items: answer.items.slice(0, count), next: answer.offset + count };
}
