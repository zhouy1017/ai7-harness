import { isRecord } from '../../analysis/canonical.js';
import { isPublicHostName } from '../../../shared/network-denial.js';
import { SEARCH_BACKENDS, type SearchBackend, type SearchBackendDeclaration, type SearchBackendHit, type SearchBackendRequest } from '../search-backends.js';

/** Adapter output stays in protected tool context; only titles and URLs are projected by 测试检索. */
export interface SearchResult extends SearchBackendHit {
  readonly snippet: string;
  readonly publishedAt?: string;
}

export function resultsOf(list: unknown, titleField = 'title'): SearchResult[] | null {
  if (!Array.isArray(list)) return null;
  return list.flatMap((item: unknown) => {
    if (!isRecord(item) || typeof item['url'] !== 'string') return [];
    let url: string;
    try {
      const parsed = new URL(item['url']);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username !== '' || parsed.password !== '' || !isPublicHostName(parsed.hostname) ||
          (parsed.port !== '' && parsed.port !== (parsed.protocol === 'https:' ? '443' : '80'))) return [];
      url = parsed.href;
    } catch { return []; }
    const snippet = item['snippet'] ?? item['description'] ?? item['summary'] ?? item['excerpts'];
    const publishedAt = item['publishedAt'] ?? item['published_date'] ?? item['datePublished'];
    return [{ title: typeof item[titleField] === 'string' ? item[titleField] : '', url,
      snippet: typeof snippet === 'string' ? snippet : Array.isArray(snippet) ? snippet.filter((part): part is string => typeof part === 'string').join('\n') : '',
      ...(typeof publishedAt === 'string' ? { publishedAt } : {}),
    }];
  });
}

export function createBackend(
  id: string,
  request: (declaration: SearchBackendDeclaration, query: string, count: number) => Omit<SearchBackendRequest, 'headers'> & { headers: Record<string, string> },
  read: (json: Record<string, unknown>) => SearchResult[] | null,
): SearchBackend {
  const declaration = SEARCH_BACKENDS.find((entry) => entry.id === id && entry.shipped);
  if (declaration === undefined || declaration.endpoint === null) throw new Error('SEARCH_BACKEND_NOT_SHIPPED');
  return Object.freeze({
    declaration,
    request(query: string, options: { readonly credential: string; readonly count: number }): SearchBackendRequest {
      if (options.credential.length === 0) throw new Error('SEARCH_SERVICE_CREDENTIAL_REQUIRED');
      const result = request(declaration, query, Math.min(10, Math.max(1, Math.floor(options.count))));
      const auth = declaration.headerForm === 'authorization-bearer' ? { authorization: `Bearer ${options.credential}` }
        : declaration.headerForm === 'x-api-key' ? { 'x-api-key': options.credential } : { 'x-subscription-token': options.credential };
      return { ...result, headers: { ...result.headers, ...auth } };
    },
    readResults(status: number, _contentType: string | null, body: string): SearchResult[] | null {
      if (status !== 200) return null;
      try {
        const json: unknown = JSON.parse(body);
        return isRecord(json) ? read(json) : null;
      } catch { return null; }
    },
  });
}
