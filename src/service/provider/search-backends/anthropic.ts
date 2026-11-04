import { isRecord } from '../../analysis/canonical.js';
import { createBackend, resultsOf } from './common.js';

/** Messages web_search request. The selected model id is supplied by the frozen Main channel binding. */
export const anthropicBackend = createBackend('search-anthropic', (declaration, query, _count, model) => ({
  url: declaration.endpoint!, method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', 'anthropic-version': declaration.anthropicVersion! },
  body: JSON.stringify({ model, max_tokens: 1024, tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 1 }],
    messages: [{ role: 'user', content: `Search the web for: ${query}\nAfter searching, reply with the single word: done` }] }),
}), (json) => {
  if (!Array.isArray(json['content'])) return null;
  const hits: unknown[] = [];
  for (const block of json['content']) if (isRecord(block) && block['type'] === 'web_search_tool_result' && Array.isArray(block['content'])) {
    for (const item of block['content']) if (isRecord(item) && item['type'] === 'web_search_result') hits.push(item);
  }
  const results = resultsOf(hits);
  return results?.length ? results : null;
});
