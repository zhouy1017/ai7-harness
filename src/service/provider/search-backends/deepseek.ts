import { isRecord } from '../../analysis/canonical.js';
import { createBackend, resultsOf } from './common.js';

/** The exact server-tool shape measured by #883; no client SDK or vendor text is executed. */
export const deepseekBackend = createBackend('search-deepseek', (declaration, query) => ({
  url: declaration.endpoint!, method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', 'anthropic-version': declaration.anthropicVersion! },
  body: JSON.stringify({ model: 'deepseek-flash', max_tokens: 1024,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 1 }],
    messages: [{ role: 'user', content: `Search the web for: ${query}\nAfter searching, reply with the single word: done` }],
  }),
}), (json) => {
  if (!Array.isArray(json['content'])) return null;
  const blocks = (json['content'] as unknown[]).filter((block) => isRecord(block) && block['type'] === 'web_search_tool_result');
  if (blocks.length === 0) return null;
  return blocks.flatMap((block) => isRecord(block) && Array.isArray(block['content']) ? resultsOf(block['content'].filter((item: unknown) => isRecord(item) && item['type'] === 'web_search_result')) ?? [] : []);
});
