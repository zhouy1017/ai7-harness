import { isRecord } from '../../analysis/canonical.js';
import { createBackend, resultsOf } from './common.js';

export const bochaBackend = createBackend('search-bochaai', (declaration, query, count) => ({
  url: declaration.endpoint!, method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' },
  body: JSON.stringify({ query, freshness: 'noLimit', summary: false, count }),
}), (json) => {
  const data = isRecord(json['data']) ? json['data'] : json;
  return isRecord(data['webPages']) ? resultsOf(data['webPages']['value'], 'name') : json['code'] === 200 ? [] : null;
});
