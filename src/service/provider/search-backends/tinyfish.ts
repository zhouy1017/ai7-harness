import { createBackend, resultsOf } from './common.js';

export const tinyfishBackend = createBackend('search-tinyfish', (declaration, query) => ({
  url: `${declaration.endpoint}?${new URLSearchParams({ query })}`, method: 'GET', headers: { accept: 'application/json' }, body: null,
}), (json) => resultsOf(json['results']));
