import { describe, expect, it } from 'vitest';
import { MAX_REPLACEMENT_GRAPHEMES, MAX_SEARCH_QUERY_GRAPHEMES } from '../../src/shared/protocol.js';
import { REPLACEMENT_LIMIT_LINE, SEARCH_QUERY_LIMIT_LINE, replacementRefusal, searchQueryRefusal } from '../../src/renderer/manuscript-search-labels.js';

// ADR 0096 §3 (#1177): the search and replacement limits are one value in the service and the surface, counted in graphemes.
describe('全稿查找与替换 limits', () => {
  it('sends a query of 1 to MAX_SEARCH_QUERY_GRAPHEMES graphemes, however many code units each takes', () => {
    expect(SEARCH_QUERY_LIMIT_LINE).toBe(`请输入 1–${MAX_SEARCH_QUERY_GRAPHEMES} 个字的查找文字。`);
    expect(searchQueryRefusal('')).toBe(SEARCH_QUERY_LIMIT_LINE);
    expect(searchQueryRefusal('𠀀'.repeat(MAX_SEARCH_QUERY_GRAPHEMES))).toBeNull();
    expect(searchQueryRefusal('天'.repeat(MAX_SEARCH_QUERY_GRAPHEMES + 1))).toBe(SEARCH_QUERY_LIMIT_LINE);
  });

  it('sends a replacement of up to MAX_REPLACEMENT_GRAPHEMES graphemes, the empty one included', () => {
    expect(replacementRefusal('')).toBeNull();
    expect(replacementRefusal('界'.repeat(MAX_REPLACEMENT_GRAPHEMES))).toBeNull();
    expect(replacementRefusal('界'.repeat(MAX_REPLACEMENT_GRAPHEMES + 1))).toBe(REPLACEMENT_LIMIT_LINE);
  });
});
