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

// 大纲 / 查找 / 替换 (Issue #1409): the panel's own words.
export const OUTLINE_EMPTY_LINE = '当前稿件尚未设置章节标题。可在正文中将章节名段落设为「1 级标题 / 2 级标题」以生成结构大纲。';
export const outlineNoMatchLine = (query: string): string => `没有标题含有「${query}」的章节。`;
export const REPLACE_NOTHING_LINE = '没有可替换的匹配。';
export const REPLACE_SAME_LINE = '替换文字与查找文字相同。';
export const REPLACE_LAST_LINE = '已替换当前处；没有更多匹配。';
export const searchHitsTitle = (count: number): string => `查找命中 ${count.toLocaleString('zh-CN')} 处`;
export const replaceAllLabel = (count: number | null): string => count === null ? '全部替换' : `全部替换（${count.toLocaleString('zh-CN')} 处）`;

/** A result's context with each occurrence of the query marked, for `<mark class="search-match-highlight">`. */
export function searchContextParts(context: string, query: string): Array<{ readonly text: string; readonly match: boolean }> {
  if (query.length === 0) return [{ text: context, match: false }];
  const parts: Array<{ text: string; match: boolean }> = [];
  let at = 0;
  for (let found = context.indexOf(query); found !== -1; found = context.indexOf(query, at)) {
    if (found > at) parts.push({ text: context.slice(at, found), match: false });
    parts.push({ text: query, match: true });
    at = found + query.length;
  }
  if (at < context.length || parts.length === 0) parts.push({ text: context.slice(at), match: false });
  return parts;
}
