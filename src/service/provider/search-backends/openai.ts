import { isRecord } from '../../analysis/canonical.js';
import { createBackend, resultsOf } from './common.js';

/** Responses web_search request. The selected model id is supplied by the frozen Main channel binding. */
export const openaiBackend = createBackend('search-openai', (declaration, query, _count, model) => ({
  url: declaration.endpoint!, method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' },
  body: JSON.stringify({ model, tools: [{ type: 'web_search' }], include: ['web_search_call.action.sources'],
    input: `Search the web for: ${query}\nAfter searching, reply with the single word: done` }),
}), (json) => {
  if (!Array.isArray(json['output'])) return null;
  const hits: unknown[] = [];
  for (const item of json['output']) {
    if (!isRecord(item)) continue;
    if (Array.isArray(item['content'])) for (const part of item['content']) {
      if (!isRecord(part) || !Array.isArray(part['annotations'])) continue;
      for (const annotation of part['annotations']) if (isRecord(annotation) && annotation['type'] === 'url_citation') {
        hits.push({ title: annotation['title'], url: annotation['url'] });
      }
    }
    if (isRecord(item['action']) && Array.isArray(item['action']['sources'])) hits.push(...item['action']['sources']);
    if (Array.isArray(item['sources'])) hits.push(...item['sources']);
  }
  const parsed = resultsOf(hits);
  if (parsed === null) return null;
  const unique = new Map<string, typeof parsed[number]>();
  for (const hit of parsed) if (!unique.has(hit.url)) unique.set(hit.url, hit);
  return [...unique.values()];
});
