import { MAX_REPLACEMENT_GRAPHEMES, MAX_SEARCH_QUERY_GRAPHEMES } from '../shared/protocol.js';
import { graphemesOf } from '../shared/mark-anchor.js';

// 全稿查找与替换's words and limits (ADR 0096 §3; Issue #1177): one value in the service and the surface, counted as the service
// counts it — in graphemes — and a result set an edit made old stays on screen, read as past.

export const SEARCH_QUERY_LIMIT_LINE = `请输入 1–${MAX_SEARCH_QUERY_GRAPHEMES} 个字的查找文字。`;
export const REPLACEMENT_LIMIT_LINE = `替换文字最多 ${MAX_REPLACEMENT_GRAPHEMES} 个字。`;
export const SEARCH_STALE_LINE = '稿件已变化；以下结果已过时，请重新查找。';

/** Why the query is not sent, or `null` when it is within the service's own limit. */
export function searchQueryRefusal(query: string): string | null {
  const length = graphemesOf(query).length;
  return length === 0 || length > MAX_SEARCH_QUERY_GRAPHEMES ? SEARCH_QUERY_LIMIT_LINE : null;
}

/** Why the replacement is not sent, or `null` when it is within the service's own limit; an empty replacement deletes. */
export function replacementRefusal(replacement: string): string | null {
  return graphemesOf(replacement).length > MAX_REPLACEMENT_GRAPHEMES ? REPLACEMENT_LIMIT_LINE : null;
}
