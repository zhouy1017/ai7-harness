import { createBackend, resultsOf } from './common.js';

export const parallelBackend = createBackend('search-parallel', (declaration, query) => ({
  url: declaration.endpoint!, method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' },
  body: JSON.stringify({ objective: query, search_queries: [query] }),
}), (json) => resultsOf(json['results']));
