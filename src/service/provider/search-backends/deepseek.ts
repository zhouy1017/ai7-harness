import { canonicalJson, isRecord } from '../../analysis/canonical.js';
import { MEASURED_SEARCH_SUBJECTS, type SearchBackendCandidate, type SearchBackendRequest } from '../search-backends.js';
import { createBackend, resultsOf, type SearchResult } from './common.js';

const LEGACY = MEASURED_SEARCH_SUBJECTS['search-deepseek']!;

/** The exact server-tool shape measured by #883; no client SDK or vendor text is executed. */
export const deepseekBackend = createBackend('search-deepseek', (declaration, query) => ({
  url: declaration.endpoint!, method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', 'anthropic-version': declaration.anthropicVersion! },
  body: JSON.stringify({ model: LEGACY.model, max_tokens: 1024,
    tools: [{ type: LEGACY.tool.type, name: LEGACY.tool.name, max_uses: 1 }],
    messages: [{ role: 'user', content: `Search the web for: ${query}\nAfter searching, reply with the single word: done` }],
  }),
}), (json) => {
  if (!Array.isArray(json['content'])) return null;
  const blocks = (json['content'] as unknown[]).filter((block) => isRecord(block) && block['type'] === 'web_search_tool_result');
  if (blocks.length === 0) return null;
  return blocks.flatMap((block) => isRecord(block) && Array.isArray(block['content']) ? resultsOf(block['content'].filter((item: unknown) => isRecord(item) && item['type'] === 'web_search_result')) ?? [] : []);
});

/**
 * The direct Search API request (api-docs.deepseek.com/api/search, read 2026-10-29): Bearer, a JSON body of exactly the given
 * arguments in canonical key order, nothing else — no model, server tool, localization or `ori_question`.
 */
export function deepseekDirectSearchRequest(candidate: SearchBackendCandidate, args: SearchBackendCandidate['search']['probeArguments'], credential: string): SearchBackendRequest {
  if (credential.length === 0) throw new Error('SEARCH_SERVICE_CREDENTIAL_REQUIRED');
  return { url: candidate.search.endpoint, method: 'POST', body: canonicalJson({ query: args.query, count: args.count, need_content: args.need_content }),
    headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${credential}` } };
}

/** The direct Fetch API request (the Search & Fetch guide): exactly one cited public URL. */
export function deepseekDirectFetchRequest(candidate: SearchBackendCandidate, url: string, credential: string): SearchBackendRequest {
  if (credential.length === 0) throw new Error('SEARCH_SERVICE_CREDENTIAL_REQUIRED');
  return { url: candidate.fetch.endpoint, method: 'POST', body: canonicalJson({ url }),
    headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${credential}` } };
}

/** A 200 Search answer's `results`, an empty array included; `null` when the body is not the documented shape. */
export function readDeepseekDirectSearch(body: string): SearchResult[] | null {
  try {
    const json: unknown = JSON.parse(body);
    return isRecord(json) && Array.isArray(json['results']) ? resultsOf(json['results']) : null;
  } catch { return null; }
}

/** A 200 Fetch answer's title and Markdown content; `null` when the body is not the documented shape. */
export function readDeepseekDirectFetch(body: string): { readonly title: string; readonly content: string } | null {
  try {
    const json: unknown = JSON.parse(body);
    return isRecord(json) && typeof json['content'] === 'string' ? { title: typeof json['title'] === 'string' ? json['title'] : '', content: json['content'] } : null;
  } catch { return null; }
}
