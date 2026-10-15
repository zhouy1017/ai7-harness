import { isRecord } from '../../analysis/canonical.js';
import { createBackend, resultsOf } from './common.js';

export const braveBackend = createBackend('search-brave', (declaration, query, count) => ({
  url: `${declaration.endpoint}?${new URLSearchParams({ q: query, count: String(count) })}`, method: 'GET', headers: { accept: 'application/json' }, body: null,
}), (json) => isRecord(json['web']) ? resultsOf(json['web']['results']) : json['type'] === 'search' ? [] : null);
